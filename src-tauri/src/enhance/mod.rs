mod chain;
pub mod field;
mod merge;
mod script;
pub mod seq;
mod tun;

use self::{chain::*, field::*, merge::*, script::*, seq::*, tun::*};
use crate::{config::Config, utils::tmpl};
use serde_yaml_ng::Mapping;
use std::collections::{HashMap, HashSet};

type ResultLog = Vec<(String, String)>;

/// Enhance mode
/// 返回最终订阅、该订阅包含的键、和script执行的结果
pub async fn enhance() -> (Mapping, Vec<String>, HashMap<String, ResultLog>) {
    // config.yaml 的订阅
    let clash_config = { Config::clash().await.latest_ref().0.clone() };

    let (clash_core, enable_tun, enable_builtin, socks_enabled, http_enabled, enable_dns_settings) = {
        let verge = Config::verge().await;
        let verge = verge.latest_ref();
        (
            Some(verge.get_valid_clash_core()),
            verge.enable_tun_mode.unwrap_or(false),
            verge.enable_builtin_enhanced.unwrap_or(true),
            verge.verge_socks_enabled.unwrap_or(false),
            verge.verge_http_enabled.unwrap_or(false),
            verge.enable_dns_settings.unwrap_or(false),
        )
    };
    #[cfg(not(target_os = "windows"))]
    let redir_enabled = {
        let verge = Config::verge().await;
        let verge = verge.latest_ref();
        verge.verge_redir_enabled.unwrap_or(false)
    };
    #[cfg(target_os = "linux")]
    let tproxy_enabled = {
        let verge = Config::verge().await;
        let verge = verge.latest_ref();
        verge.verge_tproxy_enabled.unwrap_or(false)
    };

    // 从profiles里拿东西 - 先收集需要的数据，然后释放锁
    let (
        mut config,
        merge_item,
        script_item,
        rules_item,
        proxies_item,
        groups_item,
        global_merge,
        global_script,
        profile_name,
    ) = {
        // 收集所有需要的数据，然后释放profiles锁
        let (
            current,
            merge_uid,
            script_uid,
            rules_uid,
            proxies_uid,
            groups_uid,
            _current_profile_uid,
            name,
        ) = {
            // 分离async调用和数据获取，避免借用检查问题
            let current = {
                let profiles = Config::profiles().await;
                let profiles_clone = profiles.latest_ref().clone();
                profiles_clone.current_mapping().await.unwrap_or_default()
            };

            // 重新获取锁进行其他操作
            let profiles = Config::profiles().await;
            let profiles_ref = profiles.latest_ref();

            let merge_uid = profiles_ref.current_merge().unwrap_or_default();
            let script_uid = profiles_ref.current_script().unwrap_or_default();
            let rules_uid = profiles_ref.current_rules().unwrap_or_default();
            let proxies_uid = profiles_ref.current_proxies().unwrap_or_default();
            let groups_uid = profiles_ref.current_groups().unwrap_or_default();
            let current_profile_uid = profiles_ref.get_current().unwrap_or_default();

            let name = profiles_ref
                .get_item(&current_profile_uid)
                .ok()
                .and_then(|item| item.name.clone())
                .unwrap_or_default();

            (
                current,
                merge_uid,
                script_uid,
                rules_uid,
                proxies_uid,
                groups_uid,
                current_profile_uid,
                name,
            )
        };

        // 现在获取具体的items，此时profiles锁已经释放
        let merge = {
            let item = {
                let profiles = Config::profiles().await;
                let profiles = profiles.latest_ref();
                profiles.get_item(&merge_uid).ok().cloned()
            };
            if let Some(item) = item {
                <Option<ChainItem>>::from_async(&item).await
            } else {
                None
            }
        }
        .unwrap_or_else(|| ChainItem {
            uid: "".into(),
            data: ChainType::Merge(Mapping::new()),
        });

        let script = {
            let item = {
                let profiles = Config::profiles().await;
                let profiles = profiles.latest_ref();
                profiles.get_item(&script_uid).ok().cloned()
            };
            if let Some(item) = item {
                <Option<ChainItem>>::from_async(&item).await
            } else {
                None
            }
        }
        .unwrap_or_else(|| ChainItem {
            uid: "".into(),
            data: ChainType::Script(tmpl::ITEM_SCRIPT.into()),
        });

        let rules = {
            let item = {
                let profiles = Config::profiles().await;
                let profiles = profiles.latest_ref();
                profiles.get_item(&rules_uid).ok().cloned()
            };
            if let Some(item) = item {
                <Option<ChainItem>>::from_async(&item).await
            } else {
                None
            }
        }
        .unwrap_or_else(|| ChainItem {
            uid: "".into(),
            data: ChainType::Rules(SeqMap::default()),
        });

        let proxies = {
            let item = {
                let profiles = Config::profiles().await;
                let profiles = profiles.latest_ref();
                profiles.get_item(&proxies_uid).ok().cloned()
            };
            if let Some(item) = item {
                <Option<ChainItem>>::from_async(&item).await
            } else {
                None
            }
        }
        .unwrap_or_else(|| ChainItem {
            uid: "".into(),
            data: ChainType::Proxies(SeqMap::default()),
        });

        let groups = {
            let item = {
                let profiles = Config::profiles().await;
                let profiles = profiles.latest_ref();
                profiles.get_item(&groups_uid).ok().cloned()
            };
            if let Some(item) = item {
                <Option<ChainItem>>::from_async(&item).await
            } else {
                None
            }
        }
        .unwrap_or_else(|| ChainItem {
            uid: "".into(),
            data: ChainType::Groups(SeqMap::default()),
        });

        let global_merge = {
            let item = {
                let profiles = Config::profiles().await;
                let profiles = profiles.latest_ref();
                profiles.get_item(&"Merge".to_string()).ok().cloned()
            };
            if let Some(item) = item {
                <Option<ChainItem>>::from_async(&item).await
            } else {
                None
            }
        }
        .unwrap_or_else(|| ChainItem {
            uid: "Merge".into(),
            data: ChainType::Merge(Mapping::new()),
        });

        let global_script = {
            let item = {
                let profiles = Config::profiles().await;
                let profiles = profiles.latest_ref();
                profiles.get_item(&"Script".to_string()).ok().cloned()
            };
            if let Some(item) = item {
                <Option<ChainItem>>::from_async(&item).await
            } else {
                None
            }
        }
        .unwrap_or_else(|| ChainItem {
            uid: "Script".into(),
            data: ChainType::Script(tmpl::ITEM_SCRIPT.into()),
        });

        (
            current,
            merge,
            script,
            rules,
            proxies,
            groups,
            global_merge,
            global_script,
            name,
        )
    };

    let mut result_map = HashMap::new(); // 保存脚本日志
    let mut exists_keys = use_keys(&config); // 保存出现过的keys

    // 全局Merge和Script
    if let ChainType::Merge(merge) = global_merge.data {
        exists_keys.extend(use_keys(&merge));
        config = use_merge(merge, config.to_owned());
    }

    if let ChainType::Script(script) = global_script.data {
        let mut logs = vec![];

        match use_script(script, config.to_owned(), profile_name.to_owned()) {
            Ok((res_config, res_logs)) => {
                exists_keys.extend(use_keys(&res_config));
                config = res_config;
                logs.extend(res_logs);
            }
            Err(err) => logs.push(("exception".into(), err.to_string())),
        }

        result_map.insert(global_script.uid, logs);
    }

    // 订阅关联的Merge、Script、Rules、Proxies、Groups
    if let ChainType::Rules(rules) = rules_item.data {
        config = use_seq(rules, config.to_owned(), "rules");
    }

    if let ChainType::Proxies(proxies) = proxies_item.data {
        config = use_seq(proxies, config.to_owned(), "proxies");
    }

    if let ChainType::Groups(groups) = groups_item.data {
        config = use_seq(groups, config.to_owned(), "proxy-groups");
    }

    if let ChainType::Merge(merge) = merge_item.data {
        exists_keys.extend(use_keys(&merge));
        config = use_merge(merge, config.to_owned());
    }

    if let ChainType::Script(script) = script_item.data {
        let mut logs = vec![];

        match use_script(script, config.to_owned(), profile_name.to_owned()) {
            Ok((res_config, res_logs)) => {
                exists_keys.extend(use_keys(&res_config));
                config = res_config;
                logs.extend(res_logs);
            }
            Err(err) => logs.push(("exception".into(), err.to_string())),
        }

        result_map.insert(script_item.uid, logs);
    }

    // 合并默认的config
    for (key, value) in clash_config.into_iter() {
        if key.as_str() == Some("tun") {
            let mut tun = config.get_mut("tun").map_or(Mapping::new(), |val| {
                val.as_mapping().cloned().unwrap_or(Mapping::new())
            });
            let patch_tun = value.as_mapping().cloned().unwrap_or(Mapping::new());
            for (key, value) in patch_tun.into_iter() {
                tun.insert(key, value);
            }
            config.insert("tun".into(), tun.into());
        } else {
            if key.as_str() == Some("socks-port") && !socks_enabled {
                config.remove("socks-port");
                continue;
            }
            if key.as_str() == Some("port") && !http_enabled {
                config.remove("port");
                continue;
            }
            #[cfg(target_os = "windows")]
            {
                if key.as_str() == Some("redir-port") || key.as_str() == Some("tproxy-port") {
                    continue;
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                if key.as_str() == Some("redir-port") && !redir_enabled {
                    config.remove("redir-port");
                    continue;
                }
            }
            #[cfg(target_os = "linux")]
            {
                if key.as_str() == Some("tproxy-port") && !tproxy_enabled {
                    config.remove("tproxy-port");
                    continue;
                }
            }
            // 处理 external-controller 键的开关逻辑
            if key.as_str() == Some("external-controller") {
                let enable_external_controller = Config::verge()
                    .await
                    .latest_ref()
                    .enable_external_controller
                    .unwrap_or(false);

                if enable_external_controller {
                    config.insert(key, value);
                } else {
                    // 如果禁用了外部控制器，设置为空字符串
                    config.insert(key, "".into());
                }
            } else {
                config.insert(key, value);
            }
        }
    }

    // 内建脚本最后跑
    if enable_builtin {
        ChainItem::builtin()
            .into_iter()
            .filter(|(s, _)| s.is_support(clash_core.as_ref()))
            .map(|(_, c)| c)
            .for_each(|item| {
                log::debug!(target: "app", "run builtin script {}", item.uid);
                if let ChainType::Script(script) = item.data {
                    match use_script(script, config.to_owned(), "".to_string()) {
                        Ok((res_config, _)) => {
                            config = res_config;
                        }
                        Err(err) => {
                            log::error!(target: "app", "builtin script error `{err}`");
                        }
                    }
                }
            });
    }

    config = use_tun(config, enable_tun);
    config = use_sort(config);

    // 🚀 性能优化：针对大量节点场景（2000+）的内核配置
    use serde_yaml_ng::Value;
    
    // profile-cache-size: 缓存大小，对大量节点很重要
    config.insert(
        "profile".into(),
        serde_yaml_ng::to_value(serde_json::json!({
            "store-selected": true,
            "store-fake-ip": true,
        })).unwrap_or(Value::Null),
    );
    
    // 增加文件描述符和连接限制
    config.insert("global-client-fingerprint".into(), "chrome".into());
    
    // TCP并发连接数优化
    if !config.contains_key("tcp-concurrent") {
        config.insert("tcp-concurrent".into(), true.into());
    }
    
    // 统一延迟测试超时，避免大量节点测速卡死
    if !config.contains_key("url-test-timeout") {
        config.insert("url-test-timeout".into(), 5000.into()); // 5秒超时
    }
    
    log::info!(target: "app", "已应用大规模节点性能优化配置");

    // 应用独立的DNS配置（如果启用）
    if enable_dns_settings {
        use crate::utils::dirs;
        use std::fs;

        if let Ok(app_dir) = dirs::app_home_dir() {
            let dns_path = app_dir.join("dns_config.yaml");

            if dns_path.exists()
                && let Ok(dns_yaml) = fs::read_to_string(&dns_path)
                && let Ok(dns_config) = serde_yaml_ng::from_str::<serde_yaml_ng::Mapping>(&dns_yaml)
            {
                // 处理hosts配置
                if let Some(hosts_value) = dns_config.get("hosts")
                    && hosts_value.is_mapping()
                {
                    config.insert("hosts".into(), hosts_value.clone());
                    log::info!(target: "app", "apply hosts configuration");
                }

                if let Some(dns_value) = dns_config.get("dns") {
                    if let Some(dns_mapping) = dns_value.as_mapping() {
                        config.insert("dns".into(), dns_mapping.clone().into());
                        log::info!(target: "app", "apply dns_config.yaml (dns section)");
                    }
                } else {
                    config.insert("dns".into(), dns_config.into());
                    log::info!(target: "app", "apply dns_config.yaml");
                }
            }
        }
    }

    let mut exists_set = HashSet::new();
    exists_set.extend(exists_keys);
    exists_keys = exists_set.into_iter().collect();

    (config, exists_keys, result_map)
}
