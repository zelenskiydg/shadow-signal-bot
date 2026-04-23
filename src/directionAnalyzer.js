const WebSocket = require('ws');

// Tunable constants
const LOOKBACK_SEC = 60;
const MIN_TRADES = 20;
const HIGH_BUY_RATIO = 0.65;
const MID_BUY_RATIO = 0.55;
const HIGH_SELL_RATIO = 0.35;
const MID_SELL_RATIO = 0.45;
const OI_BOOST_THRESHOLD = 0.5;
const OI_BOOST_POSITIVE = 15;
const OI_BOOST_NEGATIVE = -10;
const MAX_CONFIDENCE = 95;

const TRACK_HORIZONS = [
  { label: '5min', ms: 5 * 60 * 1000 },
  { label: '10min', ms: 10 * 60 * 1000 },
  { label: '15min', ms: 15 * 60 * 1000 },
  { label: '30min', ms: 30 * 60 * 1000 },
];
const TRACK_TOTAL_MS = 30 * 60 * 1000;

const BASE_URL = 'wss://fstream.binance.com/stream';

const tradeBuffers = {};
const activeTracks = [];

function cleanBuffer(symbol) {
  const cutoff = Date.now() - LOOKBACK_SEC * 1000;
  if (tradeBuffers[symbol]) {
    tradeBuffers[symbol] = tradeBuffers[symbol].filter(t => t.timestamp >= cutoff);
  }
}

function analyzeDirection(symbol, oiDeltaPct) {
  cleanBuffer(symbol);

  const trades = tradeBuffers[symbol] || [];
  const tradesCount = trades.length;

  if (tradesCount < MIN_TRADES) {
    return {
      direction: 'UNCERTAIN',
      confidence: 50,
      reason: `insufficient data (${tradesCount} trades)`,
      stats: { buyVol: 0, sellVol: 0, buyRatio: 0, tradesCount },
    };
  }

  let buyVol = 0;
  let sellVol = 0;

  for (const t of trades) {
    if (t.isBuyerMaker) {
      sellVol += t.qtyUsdt;
    } else {
      buyVol += t.qtyUsdt;
    }
  }

  const buyRatio = buyVol / (buyVol + sellVol);

  let direction;
  let confidence;
  let reason;

  if (buyRatio >= HIGH_BUY_RATIO) {
    direction = 'LONG';
    confidence = 70;
    reason = `strong buy pressure (${(buyRatio * 100).toFixed(0)}% buys)`;
  } else if (buyRatio >= MID_BUY_RATIO) {
    direction = 'LONG';
    confidence = 55;
    reason = `moderate buy pressure (${(buyRatio * 100).toFixed(0)}% buys)`;
  } else if (buyRatio <= HIGH_SELL_RATIO) {
    direction = 'SHORT';
    confidence = 70;
    reason = `strong sell pressure (${(buyRatio * 100).toFixed(0)}% buys)`;
  } else if (buyRatio <= MID_SELL_RATIO) {
    direction = 'SHORT';
    confidence = 55;
    reason = `moderate sell pressure (${(buyRatio * 100).toFixed(0)}% buys)`;
  } else {
    direction = 'UNCERTAIN';
    confidence = 50;
    reason = `balanced flow (${(buyRatio * 100).toFixed(0)}% buys)`;
  }

  // OI adjustment
  if (oiDeltaPct !== null && oiDeltaPct !== undefined && !isNaN(oiDeltaPct)) {
    if (oiDeltaPct > OI_BOOST_THRESHOLD) {
      const side = direction === 'LONG' ? 'longs' : 'shorts';
      reason += ` + OI rising (new ${side} opening)`;
      confidence += OI_BOOST_POSITIVE;
    } else if (oiDeltaPct < -OI_BOOST_THRESHOLD) {
      reason += ` + OI falling (positions closing, weaker move)`;
      confidence += OI_BOOST_NEGATIVE;
    }
  }

  confidence = Math.max(0, Math.min(MAX_CONFIDENCE, confidence));

  return {
    direction,
    confidence,
    reason,
    stats: {
      buyVol: parseFloat(buyVol.toFixed(2)),
      sellVol: parseFloat(sellVol.toFixed(2)),
      buyRatio: parseFloat(buyRatio.toFixed(4)),
      tradesCount,
    },
  };
}

function formatDirection(result) {
  if (result.direction === 'LONG') {
    return `📈 Direction: LONG | confidence ${result.confidence}%\n   ${result.reason}`;
  }
  if (result.direction === 'SHORT') {
    return `📉 Direction: SHORT | confidence ${result.confidence}%\n   ${result.reason}`;
  }
  return `🤷 Direction: UNCERTAIN (${result.reason})`;
}

function trackSignalResult(symbol, entryPrice, entryTime, callback) {
  const track = {
    symbol,
    entryPrice,
    entryTime,
    callback,
    snapshots: {},
    lastPrice: entryPrice,
  };

  for (const h of TRACK_HORIZONS) {
    track.snapshots[h.label] = { min: entryPrice, max: entryPrice, close: entryPrice };
  }

  activeTracks.push(track);

  setTimeout(() => {
    const result = {};
    for (const h of TRACK_HORIZONS) {
      const s = track.snapshots[h.label];
      result[`horizon_${h.label}`] = {
        mfe_pct: parseFloat((((s.max - entryPrice) / entryPrice) * 100).toFixed(4)),
        mae_pct: parseFloat((((s.min - entryPrice) / entryPrice) * 100).toFixed(4)),
        close_pct: parseFloat((((s.close - entryPrice) / entryPrice) * 100).toFixed(4)),
      };
    }

    const idx = activeTracks.indexOf(track);
    if (idx !== -1) activeTracks.splice(idx, 1);

    callback(result);
  }, TRACK_TOTAL_MS);

  console.log(`[TRACK] Started tracking ${symbol} from ${entryPrice}`);
}

function updateTracks(symbol, price, tradeTime) {
  for (const track of activeTracks) {
    if (track.symbol !== symbol) continue;

    const elapsed = tradeTime - track.entryTime;
    track.lastPrice = price;

    for (const h of TRACK_HORIZONS) {
      if (elapsed > h.ms) continue;
      const s = track.snapshots[h.label];
      if (price > s.max) s.max = price;
      if (price < s.min) s.min = price;
      s.close = price;
    }
  }
}

function startAggTradeStream(symbols, attempt = 0) {
  const streams = symbols.map(s => `${s.toLowerCase()}@aggTrade`).join('/');
  const url = `${BASE_URL}?streams=${streams}`;
  const ws = new WebSocket(url);

  ws.on('open', () => {
    console.log(`[AGGTRADE] Connected. Monitoring: ${symbols.join(', ')}`);
    attempt = 0;
  });

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    const data = msg.data;

    const symbol = data.s;
    const price = parseFloat(data.p);
    const qty = parseFloat(data.q);

    if (!tradeBuffers[symbol]) tradeBuffers[symbol] = [];

    tradeBuffers[symbol].push({
      timestamp: data.T,
      qtyUsdt: price * qty,
      isBuyerMaker: data.m,
    });

    updateTracks(symbol, price, data.T);

    // Periodic cleanup every 100 trades
    if (tradeBuffers[symbol].length % 100 === 0) {
      cleanBuffer(symbol);
    }
  });

  ws.on('error', (err) => {
    console.error('[AGGTRADE] Error:', err.message);
  });

  ws.on('close', () => {
    const delay = Math.min(1000 * 2 ** attempt, 30000);
    console.log(`[AGGTRADE] Disconnected. Reconnecting in ${delay / 1000}s... (attempt ${attempt + 1})`);
    setTimeout(() => startAggTradeStream(symbols, attempt + 1), delay);
  });
}

module.exports = { analyzeDirection, formatDirection, startAggTradeStream, trackSignalResult };
