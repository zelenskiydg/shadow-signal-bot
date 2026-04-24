const WebSocket = require('ws');
const { setupHeartbeat } = require('./heartbeat');

const SYMBOLS = ['1000pepeusdt', 'dogeusdt', 'bananausdt', '1000shibusdt', '1000bonkusdt'];
const BASE_URL = 'wss://fstream.binance.com/stream';

function buildStreams() {
  return SYMBOLS.flatMap(s => [`${s}@kline_1m`]).join('/');
}

function connect(onKline, attempt = 0) {
  const streams = buildStreams();
  const url = `${BASE_URL}?streams=${streams}`;
  const ws = new WebSocket(url);
  const hb = setupHeartbeat(ws, 'WS');

  ws.on('open', () => {
    console.log(`[WS] Connected (attempt ${attempt}). Monitoring: ${SYMBOLS.join(', ')}`);
    hb.start();
  });

  ws.on('message', (raw) => {
    hb.onData();
    attempt = 0;
    const msg = JSON.parse(raw);
    const { stream, data } = msg;

    if (stream.endsWith('@kline_1m')) {
      const k = data.k;
      console.log(`[KLINE] ${k.s} | C: ${k.c} | Vol: ${k.v} | Closed: ${k.x}`);
      onKline(data);
    }
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err.message);
  });

  ws.on('close', () => {
    hb.stop();
    const delay = Math.min(1000 * 2 ** attempt, 30000);
    console.log(`[WS] Disconnected. Reconnecting in ${delay / 1000}s... (attempt ${attempt + 1})`);
    setTimeout(() => connect(onKline, attempt + 1), delay);
  });
}

module.exports = { connect };
