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

const BASE_URL = 'wss://fstream.binance.com/stream';

const tradeBuffers = {};

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
  if (oiDeltaPct !== null && oiDeltaPct !== undefined) {
    if (oiDeltaPct > OI_BOOST_THRESHOLD) {
      confidence += OI_BOOST_POSITIVE;
    } else if (oiDeltaPct < -OI_BOOST_THRESHOLD) {
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

module.exports = { analyzeDirection, formatDirection, startAggTradeStream };
