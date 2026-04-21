const fs = require('fs');
const path = require('path');

const VOLUME_THRESHOLD = 3.0;
const PRICE_THRESHOLD = 0.5;
const HISTORY_SIZE = 10;
const COOLDOWN_MS = 5 * 60 * 1000;

const LOG_FILE = path.join(__dirname, '../signals.log');

const closedCandles = [];
const lastSignalTime = {};

function logSignal(entry) {
  const line = JSON.stringify(entry) + '\n';
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) console.error('[DETECTOR] Log write error:', err.message);
  });
}

function onKline(data) {
  const k = data.k;

  if (!k.x) return;

  const candle = {
    symbol: k.s,
    open: parseFloat(k.o),
    close: parseFloat(k.c),
    volume: parseFloat(k.v),
  };

  closedCandles.push(candle);

  if (closedCandles.length <= HISTORY_SIZE) {
    console.log(`[DETECTOR] Warming up: ${closedCandles.length}/${HISTORY_SIZE}`);
    return;
  }

  if (closedCandles.length > HISTORY_SIZE + 1) {
    closedCandles.shift();
  }

  const previous = closedCandles.slice(0, HISTORY_SIZE);
  const current = closedCandles[closedCandles.length - 1];

  const avgVolume = previous.reduce((sum, c) => sum + c.volume, 0) / previous.length;
  const volumeRatio = current.volume / avgVolume;
  const priceChange = Math.abs((current.close - current.open) / current.open) * 100;

  console.log(`[DETECTOR] ${current.symbol} | Vol ratio: ${volumeRatio.toFixed(2)}x | Price change: ${priceChange.toFixed(3)}%`);

  if (volumeRatio >= VOLUME_THRESHOLD && priceChange < PRICE_THRESHOLD) {
    const now = Date.now();
    const last = lastSignalTime[current.symbol] || 0;

    if (now - last < COOLDOWN_MS) {
      console.log(`[DETECTOR] Cooldown active for ${current.symbol}, skipping`);
      return;
    }

    lastSignalTime[current.symbol] = now;

    const volumePercent = ((volumeRatio - 1) * 100).toFixed(0);
    const signalPrice = current.close;
    const timestamp = new Date().toISOString();

    const entry = {
      time: timestamp,
      symbol: current.symbol,
      price: signalPrice,
      volumeRatio: parseFloat(volumeRatio.toFixed(2)),
      priceChange: parseFloat(priceChange.toFixed(3)),
    };

    logSignal(entry);
    console.log(`[SIGNAL LOGGED] ${entry.symbol} | Price: ${entry.price} | Vol: ${entry.volumeRatio}x`);

    const text = [
      '🔦 SHADOW SIGNAL',
      `Монета: ${current.symbol}`,
      `Объём: +${volumePercent}% за 1 мин`,
      `Цена: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}% (тихо)`,
      '⚠️ Направление не определено — объём мог быть от продавца. Проверь стакан.',
      '⏱ Вероятное движение через 30-60 сек',
    ].join('\n');

    console.log('\n' + text + '\n');

    if (module.exports.onSignal) {
      module.exports.onSignal(text);
    }
  }
}

module.exports = { onKline };
