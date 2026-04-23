const fs = require('fs');
const { getOIChange } = require('./oiFetcher');
const { analyzeDirection, formatDirection, trackSignalResult } = require('./directionAnalyzer');

const VOLUME_THRESHOLD = 3.0;
const PRICE_THRESHOLD = 0.5;
const HISTORY_SIZE = 10;
const COOLDOWN = {
  '1000PEPEUSDT': 15 * 60 * 1000,
  'default': 5 * 60 * 1000,
};

const VOLUME_LOG = '/data/signals.log';
const closedCandles = [];
const lastSignalTime = {};

function logSignal(entry) {
  const line = JSON.stringify(entry) + '\n';
  try {
    fs.appendFileSync(VOLUME_LOG, line);
  } catch (err) {
    console.error('[DETECTOR] Volume log write error:', err.message);
  }
  console.log('SIGNAL_LOG: ' + JSON.stringify(entry));
}

function formatHorizon(label, h) {
  const sign = (v) => v >= 0 ? '+' : '';
  return `${label}: max ${sign(h.mfe_pct)}${h.mfe_pct.toFixed(2)}% / min ${sign(h.mae_pct)}${h.mae_pct.toFixed(2)}% / close ${sign(h.close_pct)}${h.close_pct.toFixed(2)}%`;
}

function getSignalLevel(oiChange) {
  if (oiChange === null) return 'NEUTRAL';
  if (oiChange >= 2) return 'STRONG';
  if (Math.abs(oiChange) < 0.5) return 'NEUTRAL';
  if (oiChange > 0) return 'MEDIUM';
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

    const dirResult = analyzeDirection(current.symbol, oiChange);
    const dirLine = formatDirection(dirResult);

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
      dirLine,
      '⏱ Вероятное движение через 30-60 сек',
    ].join('\n');

    logSignal({ stage: 'initial', time: timestamp, symbol: current.symbol, price: entryPrice, volumeRatio: parseFloat(volumeRatio.toFixed(2)), priceChange: parseFloat(priceChange.toFixed(3)), oiChange, level, direction: dirResult.direction, confidence: dirResult.confidence, buyRatio: dirResult.stats.buyRatio, tradesCount: dirResult.stats.tradesCount });

    console.log('\n' + text + '\n');

    if (module.exports.onSignal) {
      module.exports.onSignal(text);
    }

    trackSignalResult(current.symbol, entryPrice, Date.now(), (result) => {
      logSignal({ stage: 'result', time: timestamp, symbol: current.symbol, price: entryPrice, result });

      const report = [
        `📊 РЕЗУЛЬТАТ: ${current.symbol}`,
        `Вход: ${entryPrice.toFixed(6)}`,
        formatHorizon('+5 мин', result.horizon_5min),
        formatHorizon('+10 мин', result.horizon_10min),
        formatHorizon('+15 мин', result.horizon_15min),
        formatHorizon('+30 мин', result.horizon_30min),
      ].join('\n');

      console.log('\n' + report + '\n');

      if (module.exports.onSignal) {
        module.exports.onSignal(report);
      }
    });
  }
}

module.exports = { onKline };
