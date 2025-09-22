import axios from "axios";
import { readFileSync } from "fs";
import { log_success, log_error, log_info } from "./utils.mjs";

// 你可以通过与 @liebesu_clash_bot 对话获取你的 chat_id
// 发送 /start 给机器人，然后查看日志获取 chat_id
const CHAT_ID_RELEASE = process.env.TELEGRAM_CHAT_ID || "YOUR_CHAT_ID"; // 正式发布通知
const CHAT_ID_TEST = process.env.TELEGRAM_CHAT_ID || "YOUR_CHAT_ID"; // 测试通知

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

  log_info(`Preparing Telegram notification for ${buildType} ${version}`);
  log_info(`Target channel: ${chatId}`);
  log_info(`Download URL: ${downloadUrl}`);

  // 读取发布说明和下载地址
  let releaseContent = "";
  try {
    releaseContent = readFileSync("release.txt", "utf-8");
    log_info("成功读取 release.txt 文件");
  } catch (error) {
    log_error("无法读取 release.txt，使用默认发布说明", error);
    releaseContent = "更多新功能现已支持，详细更新日志请查看发布页面。";
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
              const encodedUrl = encodeURI(url);
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

  const releaseTitle = isAutobuild ? "滚动更新版发布" : "正式发布";
  const encodedVersion = encodeURIComponent(version);
  const content = `<b>🎉 <a href="https://github.com/liebesu/LIebesu_Clash/releases/tag/autobuild">LIebesu_Clash v${version}</a> ${releaseTitle}</b>\n\n${formattedContent}`;

  // 发送到 Telegram
  try {
    await axios.post(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text: content,
        link_preview_options: {
          is_disabled: false,
          url: `https://github.com/liebesu/LIebesu_Clash/releases/tag/v${encodedVersion}`,
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
}

// 执行函数
sendTelegramNotification().catch((error) => {
  log_error("脚本执行失败:", error);
  process.exit(1);
});
