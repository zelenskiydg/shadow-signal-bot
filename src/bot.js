const { Bot } = require('grammy');
require('dotenv').config();

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const chatId = process.env.TELEGRAM_CHAT_ID;

async function sendSignal(text) {
  try {
    await bot.api.sendMessage(chatId, text);
    console.log('[BOT] Signal sent to Telegram');
  } catch (err) {
    console.error('[BOT] Failed to send:', err.message);
  }
}

module.exports = { sendSignal };
