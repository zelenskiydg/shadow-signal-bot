const fs = require('fs');
const path = require('path');
const { getOIChange } = require('./oiFetcher');

const VOLUME_THRESHOLD = 3.0;
const PRICE_THRESHOLD = 0.5;
const HISTORY_SIZE = 10;
const COOLDOWN = {
  '1000PEPEUSDT': 15 * 60 * 1000,
  'default': 5 * 60 * 1000,
};

const LOG_FILE = path.join(__dirname, '../signals.log');
const closedCandles = [];
const lastSignalTime = {};

function logSignal(entry) {
  const line = JSON.stringify(entry) + '\n';
  fs.appendFile(LOG_FILE, line, (err) => {
    if (err) console.error('[DETECTOR] Log write error:', err.message);
  });
}

async function getPrice(symbol) {
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
    const data = await res.json();
    return parseFloat(data.price);
  } catch (err) {
    console.error(`[DETECTOR] Price fetch error for ${symbol}:`, err.message);
    return null;
  }
}

function formatChange(entry, current, label) {
  if (current === null) return `${label}: ошибка`;
  const change = ((current - entry) / entry * 100);
  const sign = change >= 0 ? '+' : '';
  const emoji = change >= 0.3 ? '✅' : change <= -0.3 ? '🔴' : '⚪️';
  return `${label}: ${current.toFixed(6)} (${sign}${change.toFixed(2)}%) ${emoji}`;
}

function scheduleChecks(symbol, entryPrice, onResult) {
  const checks = [
    { label: '+1 мин', delay: 60 * 1000 },
    { label: '+5 мин', delay: 5 * 60 * 1000 },
    { label: '+30 мин', delay: 30 * 60 * 1000 },
  ];

  checks.forEach(({ label, delay }) => {
    setTimeout(async () => {
      const price = await getPrice(symbol);
      const line = formatChange(entryPrice, price, label);
      onResult(label, price, line);
    }, delay);
  });
}

function getSignalLevel(oiChange) {
  if (oiChange === null) return 'NEUTRAL';
  if (oiChange >= 2) return 'STRONG';
  if (oiChange >= 0) return 'MEDIUM';
  if (Math.abs(oiChange) < 0.5) return 'NEUTRAL';
  return 'WEAK';
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

    const cooldownMs = COOLDOWN[current.symbol] || COOLDOWN['default'];
    if (now - last < cooldownMs) {
      console.log(`[DETECTOR] Cooldown active for ${current.symbol}, skipping`);
      return;
    }

    const oiChange = getOIChange(current.symbol);
    const level = getSignalLevel(oiChange);

    // WEAK отправляем с предупреждением

    lastSignalTime[current.symbol] = now;

    const volumePercent = ((volumeRatio - 1) * 100).toFixed(0);
    const entryPrice = current.close;
    const timestamp = new Date().toISOString();

    let oiLine;
    if (oiChange === null) {
      oiLine = 'OI: данные недоступны';
    } else if (oiChange >= 2) {
      oiLine = `OI: +${oiChange.toFixed(2)}% ↑ (new positions opening)`;
    } else if (oiChange > 0.1) {
      oiLine = `OI: +${oiChange.toFixed(2)}% ↑ (possible early accumulation)`;
    } else if (oiChange >= -0.1) {
      oiLine = `OI: ${oiChange >= 0 ? '+' : ''}${oiChange.toFixed(2)}% — spot-driven move / be cautious`;
    } else {
      oiLine = `OI: ${oiChange.toFixed(2)}% ↓ (positions closing)`;
    }

    const levelEmoji = {
      STRONG: '🔴',
      MEDIUM: '🟡',
      NEUTRAL: '⚪',
      WEAK: '⚠️'
    }[level] || '🔦';

    const text = [
      `${levelEmoji} ${level} SIGNAL`,
      `Монета: ${current.symbol}`,
      `Объём: +${volumePercent}% за 1 мин`,
      `Цена: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}% (тихо)`,
      oiLine,
      '⏱ Вероятное движение через 30-60 сек',
    ].join('\n');

    logSignal({ time: timestamp, symbol: current.symbol, price: entryPrice, volumeRatio: parseFloat(volumeRatio.toFixed(2)), priceChange: parseFloat(priceChange.toFixed(3)), oiChange, level });

    console.log('\n' + text + '\n');

    if (module.exports.onSignal) {
      module.exports.onSignal(text);
    }

    const results = {};
    scheduleChecks(current.symbol, entryPrice, (label, price, line) => {
      results[label] = line;
      if (Object.keys(results).length === 3) {
        const report = [
          `📊 РЕЗУЛЬТАТ: ${current.symbol}`,
          `Вход: ${entryPrice.toFixed(6)}`,
          results['+1 мин'],
          results['+5 мин'],
          results['+30 мин'],
        ].join('\n');
        console.log('\n' + report + '\n');
        if (module.exports.onSignal) {
          module.exports.onSignal(report);
        }
      }
    });
  }
}

module.exports = { onKline };
