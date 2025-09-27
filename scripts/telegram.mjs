import axios from "axios";
import { readFileSync } from "fs";
import { log_success, log_error, log_info } from "./utils.mjs";
import { execSync } from "child_process";

// 你可以通过与 @liebesu_clash_bot 对话获取你的 chat_id
// 发送 /start 给机器人，然后查看日志获取 chat_id
const CHAT_ID_RELEASE = process.env.TELEGRAM_CHAT_ID || "YOUR_CHAT_ID"; // 正式发布通知
const CHAT_ID_TEST = process.env.TELEGRAM_CHAT_ID || "YOUR_CHAT_ID"; // 测试通知

// 根据实际资产生成发布内容
function generateReleaseContent(assets, releaseTag, version) {
  let content = `**v${version}**\n\n`;
  content += `**🐞 修复问题**\n\n`;
  content += `- ✅ 修复全局节点测速功能 (批量并发 + 异步安全)\n`;
  content += `- ✅ 增强进度条UI显示和颜色标注系统\n`;
  content += `- ✅ 修复 macOS DMG 安装后 Launchpad 图标显示\n`;
  content += `- ✅ 添加服务启动停止控制按钮\n`;
  content += `- ✅ 完善错误处理和超时保护机制\n`;
  content += `- ✅ 优化前端构建内存配置 (4GB→8GB)\n\n`;
  
  content += `**下载地址**\n\n`;
  
  // Windows 资产
  const windowsAssets = assets.filter(name => name.includes('setup.exe'));
  if (windowsAssets.length > 0) {
    content += `**Windows (不再支持Win7)**\n`;
    windowsAssets.forEach(asset => {
      // 检查文件名是否已经URL编码，如果已编码就不要再编码
      const isAlreadyEncoded = asset.includes('%');
      const encodedAsset = isAlreadyEncoded ? asset : encodeURIComponent(asset);
      const url = `https://github.com/liebesu/LIebesu_Clash/releases/download/${releaseTag}/${encodedAsset}`;
      if (asset.includes('webview2')) {
        content += `- [内置WebView2版 64位](${url})\n`;
      } else {
        content += `- [正常版 64位](${url})\n`;
      }
    });
    content += `\n`;
  }
  
  // macOS 资产  
  const macosAssets = assets.filter(name => name.includes('.dmg') || name.includes('.app.tar.gz'));
  if (macosAssets.length > 0) {
    content += `**macOS**\n`;
    macosAssets.forEach(asset => {
      // 检查文件名是否已经URL编码，如果已编码就不要再编码
      const isAlreadyEncoded = asset.includes('%');
      const encodedAsset = isAlreadyEncoded ? asset : encodeURIComponent(asset);
      const url = `https://github.com/liebesu/LIebesu_Clash/releases/download/${releaseTag}/${encodedAsset}`;
      if (asset.includes('aarch64')) {
        content += `- [Apple M芯片 DMG](${url})\n`;
      } else if (asset.includes('.app.tar.gz')) {
        content += `- [App包](${url})\n`;
      } else if (asset.includes('.dmg')) {
        content += `- [Intel芯片 DMG](${url})\n`;
      }
    });
    content += `\n`;
  }
  
  // Linux 资产
  const linuxAssets = assets.filter(name => name.includes('.deb') || name.includes('.rpm') || name.includes('AppImage'));
  if (linuxAssets.length > 0) {
    content += `**Linux**\n`;
    linuxAssets.forEach(asset => {
      // 检查文件名是否已经URL编码，如果已编码就不要再编码
      const isAlreadyEncoded = asset.includes('%');
      const encodedAsset = isAlreadyEncoded ? asset : encodeURIComponent(asset);
      const url = `https://github.com/liebesu/LIebesu_Clash/releases/download/${releaseTag}/${encodedAsset}`;
      content += `- [${asset}](${url})\n`;
    });
  } else {
    content += `**Linux**\n⚠️ 此版本暂不提供Linux构建\n`;
  }
  
  content += `\n**FAQ**\n- [常见问题](https://github.com/liebesu/LIebesu_Clash/wiki/FAQ)`;
  
  return content;
}

async function sendTelegramNotification() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  if (!process.env.TELEGRAM_CHAT_ID) {
    throw new Error("TELEGRAM_CHAT_ID is required");
  }

  const version =
    process.env.VERSION ||
    (() => {
      const pkg = readFileSync("package.json", "utf-8");
      return JSON.parse(pkg).version;
    })();

  const downloadUrl =
    process.env.DOWNLOAD_URL ||
    `https://github.com/liebesu/LIebesu_Clash/releases/download/v${version}`;

  const isAutobuild =
    process.env.BUILD_TYPE === "autobuild" || version.includes("autobuild");
  const chatId = isAutobuild ? CHAT_ID_TEST : CHAT_ID_RELEASE;
  const buildType = isAutobuild ? "滚动更新版" : "正式版";
  const releaseTag = isAutobuild ? "autobuild" : `v${version}`;

  log_info(`Preparing Telegram notification for ${buildType} ${version}`);
  log_info(`Target channel: ${chatId}`);
  log_info(`Download URL: ${downloadUrl}`);
  log_info(`Release tag: ${releaseTag}`);

  // 获取实际的release资产
  let releaseAssets = [];
  try {
    // 使用更可靠的方式获取资产信息，包括完整的文件名
    const assetsOutput = execSync(`gh api repos/liebesu/LIebesu_Clash/releases/tags/${releaseTag} --jq '.assets[] | .name' 2>/dev/null || echo ""`, { encoding: 'utf-8' });
    releaseAssets = assetsOutput.trim().split('\n').filter(name => name.length > 0 && name !== '' && !name.includes('null'));
    
    // 如果没有获取到资产，尝试其他方法
    if (releaseAssets.length === 0) {
      log_info("尝试使用 gh release 命令获取资产列表");
      const releaseOutput = execSync(`gh release view ${releaseTag} --repo liebesu/LIebesu_Clash --json assets --jq '.assets[].name' 2>/dev/null || echo ""`, { encoding: 'utf-8' });
      releaseAssets = releaseOutput.trim().split('\n').filter(name => name.length > 0 && name !== '' && !name.includes('null'));
    }
    
    log_info(`发现 ${releaseAssets.length} 个资产: ${releaseAssets.join(', ')}`);
    
    // 调试信息：显示实际的文件名
    if (releaseAssets.length > 0) {
      log_info("实际的资产文件名:");
      releaseAssets.forEach((asset, index) => {
        log_info(`  ${index + 1}. ${asset}`);
      });
    }
    
  } catch (error) {
    log_error("获取release资产失败", error);
  }

  // 读取发布说明和下载地址
  let releaseContent = "";
  
  // 优先使用动态生成的内容，如果有资产的话
  if (releaseAssets.length > 0) {
    log_info("使用动态检测的资产生成发布内容");
    releaseContent = generateReleaseContent(releaseAssets, releaseTag, version);
  } else {
    // 如果没有检测到资产，尝试读取静态文件
    try {
      releaseContent = readFileSync("release.txt", "utf-8");
      log_info("未检测到资产，使用 release.txt 文件");
    } catch (error) {
      log_error("无法读取 release.txt，使用默认发布说明", error);
      releaseContent = generateReleaseContent([], releaseTag, version);
    }
  }

  // Markdown 转换为 HTML
  function convertMarkdownToTelegramHTML(content) {
    return content
      .split("\n")
      .map((line) => {
        if (line.trim().length === 0) {
          return "";
        } else if (line.startsWith("## ")) {
          return `<b>${line.replace("## ", "")}</b>`;
        } else if (line.startsWith("### ")) {
          return `<b>${line.replace("### ", "")}</b>`;
        } else if (line.startsWith("#### ")) {
          return `<b>${line.replace("#### ", "")}</b>`;
        } else {
          let processedLine = line.replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            (match, text, url) => {
              // 检查URL是否已经编码，避免双重编码
              const isAlreadyEncoded = url.includes('%');
              const encodedUrl = isAlreadyEncoded ? url : encodeURI(url);
              return `<a href="${encodedUrl}">${text}</a>`;
            },
          );
          processedLine = processedLine.replace(
            /\*\*([^*]+)\*\*/g,
            "<b>$1</b>",
          );
          return processedLine;
        }
      })
      .join("\n");
  }

  const formattedContent = convertMarkdownToTelegramHTML(releaseContent);

  // 追加：macOS 放行脚本链接与使用说明（若存在）
  let fixSectionHTML = "";
  try {
    const fixNames = ["fix-startup.sh", "enhanced-macos-fix.sh"];
    const foundFixes = releaseAssets.filter((n) => fixNames.some((x) => n.endsWith(x)));
    if (foundFixes.length > 0) {
      const links = foundFixes
        .map((asset) => {
          const enc = asset.includes('%') ? asset : encodeURIComponent(asset);
          const url = `https://github.com/liebesu/LIebesu_Clash/releases/download/${releaseTag}/${enc}`;
          return `- <a href="${url}">${asset}</a>`;
        })
        .join("\n");
      const usage = [
        "下载脚本后在终端执行：",
        "<pre><code>chmod +x ~/Downloads/fix-startup.sh && bash ~/Downloads/fix-startup.sh</code></pre>",
      ].join("\n");
      fixSectionHTML = `\n\n<b>macOS 一键放行脚本</b>\n${links}\n${usage}`;
    }
  } catch (e) {
    // 忽略构建 fixSection 失败
  }

  const releaseTitle = isAutobuild ? "滚动更新版发布" : "正式发布";
  const encodedVersion = encodeURIComponent(version);
  const content = `<b>🎉 <a href="https://github.com/liebesu/LIebesu_Clash/releases/tag/${releaseTag}">LIebesu_Clash v${version}</a> ${releaseTitle}</b>\n\n${formattedContent}${fixSectionHTML}`;

  // 发送到 Telegram
  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: content,
        link_preview_options: {
          is_disabled: false,
          url: `https://github.com/liebesu/LIebesu_Clash/releases/tag/${releaseTag}`,
          prefer_large_media: true,
        },
        parse_mode: "HTML",
      },
    );
    log_success(`✅ Telegram 通知发送成功到 ${chatId}`);
  } catch (error) {
    log_error(
      `❌ Telegram 通知发送失败到 ${chatId}:`,
      error.response?.data || error.message,
      error,
    );
    process.exit(1);
  }

  // 附加：尝试作为文档附件推送 macOS 修复脚本（若存在）
  try {
    const { existsSync, readFileSync: readFs } = await import('fs');
    const path = await import('path');
    // 在 CI 中我们把脚本集中到 artifacts-extra
    const scriptsDir = 'artifacts-extra';
    const candidates = ['fix-startup.sh', 'enhanced-macos-fix.sh'];
    for (const fname of candidates) {
      const full = path.join(scriptsDir, fname);
      if (existsSync(full)) {
        const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`;
        const form = new (await import('form-data')).default();
        form.append('chat_id', chatId);
        form.append('caption', `macOS 启动修复脚本：${fname}`);
        form.append('document', readFs(full), { filename: fname, contentType: 'text/x-shellscript' });
        await axios.post(url, form, { headers: form.getHeaders() });
        log_success(`✅ 已附加推送脚本到 Telegram: ${fname}`);
      } else {
        // 若本地文件不存在，尝试从 Release 直接下载并转发为附件
        const assetName = releaseAssets.find((n) => n.endsWith(fname));
        if (assetName) {
          const enc = assetName.includes('%') ? assetName : encodeURIComponent(assetName);
          const assetUrl = `https://github.com/liebesu/LIebesu_Clash/releases/download/${releaseTag}/${enc}`;
          const resp = await axios.get(assetUrl, { responseType: 'arraybuffer' });
          const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`;
          const form = new (await import('form-data')).default();
          form.append('chat_id', chatId);
          form.append('caption', `macOS 启动修复脚本：${fname}`);
          form.append('document', Buffer.from(resp.data), { filename: fname, contentType: 'text/x-shellscript' });
          await axios.post(url, form, { headers: form.getHeaders() });
          log_success(`✅ 已从 Release 下载并附加推送脚本到 Telegram: ${fname}`);
        }
      }
    }
  } catch (err) {
    log_error('⚠️ 推送脚本附件到 Telegram 失败（忽略）：', err?.response?.data || err?.message || err);
  }
}

// 执行函数
sendTelegramNotification().catch((error) => {
  log_error("脚本执行失败:", error);
  process.exit(1);
});
