const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARCHIVE_FILE = path.join(__dirname, '../signals-archive.jsonl');
const SIGNAL_PREFIX = 'SIGNAL_LOG: ';
const DEFAULT_LINES = 5000;

// Parse --lines=N argument
const linesArg = process.argv.find(a => a.startsWith('--lines='));
const lines = linesArg ? parseInt(linesArg.split('=')[1], 10) : DEFAULT_LINES;

// Load existing entries for dedup
function loadExistingKeys() {
  const keys = new Set();
  if (fs.existsSync(ARCHIVE_FILE)) {
    const content = fs.readFileSync(ARCHIVE_FILE, 'utf-8').trim();
    if (content) {
      for (const line of content.split('\n')) {
        try {
          const entry = JSON.parse(line);
          keys.add(`${entry.time}|${entry.symbol}`);
        } catch {}
      }
    }
  }
  return keys;
}

// Fetch logs from Railway
function fetchLogs() {
  try {
    const output = execSync(`railway logs --json -n ${lines}`, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim().split('\n').filter(Boolean);
  } catch (err) {
    const msg = err.stderr || err.message || '';
    if (msg.includes('not logged in') || msg.includes('login') || msg.includes('No linked project')) {
      console.error('ERROR: Railway CLI not logged in or project not linked.');
      console.error('Run: railway login && railway link');
      process.exit(1);
    }
    console.error('ERROR: Failed to fetch Railway logs:', msg);
    process.exit(1);
  }
}

// Main
const logLines = fetchLogs();
console.log(`Fetched ${logLines.length} log lines`);

const signals = [];
for (const line of logLines) {
  try {
    const obj = JSON.parse(line);
    const msg = obj.message || '';
    const idx = msg.indexOf(SIGNAL_PREFIX);
    if (idx === -1) continue;
    const json = msg.slice(idx + SIGNAL_PREFIX.length);
    const entry = JSON.parse(json);
    signals.push(entry);
  } catch {}
}

if (signals.length === 0) {
  console.log('No signals found. Is the bot running? Has any volume spike triggered?');
  process.exit(0);
}

const existingKeys = loadExistingKeys();
let newCount = 0;
let dupCount = 0;

const fd = fs.openSync(ARCHIVE_FILE, 'a');
for (const entry of signals) {
  const key = `${entry.time}|${entry.symbol}`;
  if (existingKeys.has(key)) {
    dupCount++;
    continue;
  }
  existingKeys.add(key);
  fs.writeSync(fd, JSON.stringify(entry) + '\n');
  newCount++;
}
fs.closeSync(fd);

console.log(`${signals.length} signals extracted, ${newCount} new (${dupCount} duplicates skipped)`);
