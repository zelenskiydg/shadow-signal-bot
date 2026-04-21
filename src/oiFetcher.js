const axios = require('axios');

const SYMBOLS = ['1000PEPEUSDT', 'DOGEUSDT', 'WIFUSDT', '1000SHIBUSDT', 'BONKUSDT'];

const oiCache = {};

async function fetchOI(symbol) {
  try {
    const res = await axios.get(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`);
    return parseFloat(res.data.openInterest);
  } catch (err) {
    console.error(`[OI] Fetch error for ${symbol}:`, err.message);
    return null;
  }
}

async function updateAll() {
  for (const symbol of SYMBOLS) {
    const current = await fetchOI(symbol);
    if (current === null) continue;

    const prev = oiCache[symbol]?.current ?? null;
    oiCache[symbol] = { prev, current };
    console.log(`[OI] ${symbol} | prev: ${prev} | current: ${current}`);
  }
  console.log('[OI] Cache updated');
}

function getOIChange(symbol) {
  const entry = oiCache[symbol];
  if (!entry || entry.prev === null) return null;
  return ((entry.current - entry.prev) / entry.prev) * 100;
}

function startOIUpdates(intervalSec = 60) {
  updateAll();
  setInterval(updateAll, intervalSec * 1000);
}

module.exports = { startOIUpdates, getOIChange };
