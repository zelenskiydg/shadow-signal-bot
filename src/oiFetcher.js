const axios = require('axios');

const SYMBOLS = ['1000PEPEUSDT', 'DOGEUSDT', 'BANANAUSDT', '1000SHIBUSDT', '1000BONKUSDT'];
const HISTORY_SIZE = 5;

const oiHistory = {};

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

    if (!oiHistory[symbol]) oiHistory[symbol] = [];
    oiHistory[symbol].push(current);

    if (oiHistory[symbol].length > HISTORY_SIZE) {
      oiHistory[symbol].shift();
    }

    console.log(`[OI] ${symbol} | queue: ${oiHistory[symbol].length}/${HISTORY_SIZE} | current: ${current}`);
  }
  console.log('[OI] Cache updated');
}

function getOIChange(symbol) {
  const history = oiHistory[symbol];
  if (!history || history.length < HISTORY_SIZE) return null;
  const oldest = history[0];
  const current = history[history.length - 1];
  return ((current - oldest) / oldest) * 100;
}

function startOIUpdates(intervalSec = 60) {
  updateAll();
  setInterval(updateAll, intervalSec * 1000);
}

module.exports = { startOIUpdates, getOIChange };
