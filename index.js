require('dotenv').config();

const { sendSignal } = require('./src/bot');
const { onKline } = require('./src/detector');
const { connect } = require('./src/websocket');
const { startOIUpdates } = require('./src/oiFetcher');
const { startAggTradeStream } = require('./src/directionAnalyzer');

const SYMBOLS = ['1000PEPEUSDT', 'DOGEUSDT', 'WIFUSDT', '1000SHIBUSDT', 'BONKUSDT'];

const detector = require('./src/detector');
detector.onSignal = (text) => {
  sendSignal(text);
};

startOIUpdates(60);
startAggTradeStream(SYMBOLS);
connect(onKline);

console.log('[APP] Shadow Signal Bot started');
