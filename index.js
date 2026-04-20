require('dotenv').config();

const { sendSignal } = require('./src/bot');
const { onKline } = require('./src/detector');
const { connect } = require('./src/websocket');

const detector = require('./src/detector');
detector.onSignal = (text) => {
  sendSignal(text);
};

connect(onKline);

console.log('[APP] Shadow Signal Bot started');
