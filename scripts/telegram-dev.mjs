import axios from "axios";
import { readFileSync } from "fs";
import { log_success, log_error, log_info } from "./utils.mjs";

// Development 构建专用 Telegram 通知脚本
async function sendDevTelegramNotification() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is required");
  }

  if (!process.env.TELEGRAM_CHAT_ID) {
    throw new Error("TELEGRAM_CHAT_ID is required");
  }

  const version = process.env.VERSION || "dev-build";
  const branchName = process.env.BRANCH_NAME || "development";
  const buildStatus = process.env.BUILD_STATUS || "状态未知";
  const buildEmoji = process.env.BUILD_EMOJI || "🔧";
  const chatId = process.env.TELEGRAM_CHAT_ID;

  log_info(`Preparing Development Telegram notification for ${branchName}`);
  log_info(`Target channel: ${chatId}`);
  log_info(`Build status: ${buildStatus}`);

  // 构建基本信息
  const currentTime = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const commitSha = process.env.GITHUB_SHA?.substring(0, 7) || "unknown";
  const runId = process.env.GITHUB_RUN_ID || "unknown";

  // 检查是否构建失败
  const isBuildFailed = buildStatus.includes("失败") || buildStatus.includes("❌");

  // 构建通知内容
  let releaseContent = `**🔧 Development Build**

**📊 构建信息**
- 🌿 分支: ${branchName}
- 🔖 版本: ${version}
- 📅 时间: ${currentTime}
- 🔨 提交: ${commitSha}
- 🎯 状态: ${buildStatus}

**🔗 相关链接**
- [GitHub分支](https://github.com/liebesu/LIebesu_Clash/tree/${branchName})
- [构建日志](https://github.com/liebesu/LIebesu_Clash/actions/runs/${runId})`;

  // 如果构建失败，显示错误信息
  if (isBuildFailed) {
    releaseContent += `

**❌ 构建失败**
构建过程中出现错误，请查看构建日志获取详细信息。

**🔧 故障排查**
- 检查编译错误
- 查看依赖问题
- 验证代码语法`;
  } else {
    // 只在构建成功时显示构建内容
    releaseContent += `

**🎯 构建内容**
- ✅ 连接池优化：大幅提升并发处理能力
- ✅ 连接管理：智能健康检查与清理机制
- ✅ 性能提升：支持128连接池+256并发+512请求/秒`;

    // 如果有Release信息，添加下载链接
    const releaseTag = process.env.RELEASE_TAG;
    const windowsFile = process.env.WINDOWS_FILE;
    const macosFile = process.env.MACOS_FILE;
    const windowsArm64File = process.env.WINDOWS_ARM64_FILE;
    const linuxFile = process.env.LINUX_FILE;

    if (releaseTag && (windowsFile || macosFile || windowsArm64File || linuxFile)) {
      releaseContent += `

**📥 下载链接**
- 🔗 [Release页面](https://github.com/liebesu/LIebesu_Clash/releases/tag/${releaseTag})`;

      if (windowsFile) {
        releaseContent += `
- 📦 [Windows x64](https://github.com/liebesu/LIebesu_Clash/releases/download/${releaseTag}/${windowsFile})`;
      }
      if (windowsArm64File) {
        releaseContent += `
- 📦 [Windows ARM64](https://github.com/liebesu/LIebesu_Clash/releases/download/${releaseTag}/${windowsArm64File})`;
      }
      if (macosFile) {
        releaseContent += `
- 🍎 [macOS DMG](https://github.com/liebesu/LIebesu_Clash/releases/download/${releaseTag}/${macosFile})`;
      }
      if (linuxFile) {
        releaseContent += `
- 🐧 [Linux DEB](https://github.com/liebesu/LIebesu_Clash/releases/download/${releaseTag}/${linuxFile})`;
      }
    }
  }

  releaseContent += `

**📝 说明**
这是Development分支的测试构建，用于验证修复和功能。

Created at ${currentTime}.`;

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
              return `<a href="${url}">${text}</a>`;
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

  // 构建标题
  const releaseTitle = "Development 构建";
  const content = `<b>${buildEmoji} LIebesu_Clash ${releaseTitle}</b>\n\n${formattedContent}`;

  // 发送到 Telegram
  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: content,
        parse_mode: "HTML",
        disable_web_page_preview: false
      },
    );
    log_success(`✅ Development Telegram 通知发送成功到 ${chatId}`);
  } catch (error) {
    log_error(
      `❌ Development Telegram 通知发送失败到 ${chatId}:`,
      error.response?.data || error.message,
      error,
    );
    process.exit(1);
  }
}

// 执行函数
sendDevTelegramNotification().catch((error) => {
  log_error("脚本执行失败:", error);
  process.exit(1);
});
