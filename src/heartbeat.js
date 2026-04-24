const PING_INTERVAL = 30 * 1000;
const DATA_TIMEOUT = 90 * 1000;

function setupHeartbeat(ws, label) {
  let lastData = Date.now();
  let pingTimer = null;
  let watchdog = null;

  function start() {
    pingTimer = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, PING_INTERVAL);

    watchdog = setInterval(() => {
      const silence = Date.now() - lastData;
      if (silence > DATA_TIMEOUT) {
        console.log(`[${label}] no data for ${(silence / 1000).toFixed(0)}s, terminating`);
        stop();
        ws.terminate();
      }
    }, PING_INTERVAL);
  }

  function onData() {
    lastData = Date.now();
  }

  function stop() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (watchdog) { clearInterval(watchdog); watchdog = null; }
  }

  return { start, onData, stop };
}

module.exports = { setupHeartbeat };
