import axios from "axios";

async function getChatId() {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("❌ 错误: 未找到 TELEGRAM_BOT_TOKEN 环境变量");
    console.log("");
    console.log("请先设置环境变量:");
    console.log("export TELEGRAM_BOT_TOKEN='your_bot_token_here'");
    console.log("");
    console.log("或者从 GitHub Secrets 获取:");
    console.log("gh secret get TELEGRAM_BOT_TOKEN --repo liebesu/LIebesu_Clash");
    return;
  }

  try {
    console.log("🤖 获取 Telegram Chat ID");
    console.log("=====================================");
    console.log("");
    console.log("📱 请按照以下步骤操作：");
    console.log("1. 在 Telegram 中搜索 @liebesu_clash_bot");
    console.log("2. 点击 'START' 或发送 '/start' 消息");
    console.log("3. 发送任意消息给机器人");
    console.log("");
    console.log("⏳ 正在获取最新消息...");

    const response = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`
    );

    const updates = response.data.result;
    
    if (updates.length === 0) {
      console.log("❌ 没有找到消息，请先发送消息给机器人");
      return;
    }

    const latestUpdate = updates[updates.length - 1];
    const chatId = latestUpdate.message?.chat?.id;
    const username = latestUpdate.message?.from?.username;
    const firstName = latestUpdate.message?.from?.first_name;

    if (chatId) {
      console.log("✅ 找到你的 Chat ID!");
      console.log(`👤 用户: ${firstName} (@${username})`);
      console.log(`🆔 Chat ID: ${chatId}`);
      console.log("");
      console.log("🔧 下一步操作：");
      console.log(`运行以下命令设置 Chat ID：`);
      console.log(`gh secret set TELEGRAM_CHAT_ID --body "${chatId}" --repo liebesu/LIebesu_Clash`);
    } else {
      console.log("❌ 无法获取 Chat ID，请确保已发送消息给机器人");
    }
  } catch (error) {
    console.error("❌ 获取失败:", error.response?.data || error.message);
  }
}

getChatId();
