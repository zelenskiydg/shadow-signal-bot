const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARCHIVE_FILE = path.join(__dirname, '../signals-archive.jsonl');

// Load existing entries as map: "time|symbol" -> entry
function loadExisting() {
  const map = new Map();
  if (fs.existsSync(ARCHIVE_FILE)) {
    const content = fs.readFileSync(ARCHIVE_FILE, 'utf-8').trim();
    if (content) {
      for (const line of content.split('\n')) {
        try {
          const entry = JSON.parse(line);
          const key = `${entry.time}|${entry.symbol}`;
          map.set(key, entry);
        } catch {}
      }
    }
  }
  return map;
}

// Fetch signals from Railway Volume
function fetchSignals() {
  try {
    const output = execSync('railway run cat /data/signals.log', {
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
    if (msg.includes('No such file')) {
      console.log('No signals file on Volume yet. Is the bot running? Has any signal triggered?');
      process.exit(0);
    }
    console.error('ERROR: Failed to fetch signals from Volume:', msg);
    process.exit(1);
  }
}

// Main
const lines = fetchSignals();
console.log(`Fetched ${lines.length} signal lines from Volume`);

const signals = [];
for (const line of lines) {
  try {
    const entry = JSON.parse(line);
    signals.push(entry);
  } catch {}
}

if (signals.length === 0) {
  console.log('No valid signals found in /data/signals.log');
  process.exit(0);
}

const existing = loadExisting();
let newCount = 0;
let updatedCount = 0;
let dupCount = 0;

for (const entry of signals) {
  const key = `${entry.time}|${entry.symbol}`;
  const prev = existing.get(key);

  if (!prev) {
    existing.set(key, entry);
    newCount++;
  } else if (entry.stage === 'result' && prev.stage === 'initial') {
    existing.set(key, entry);
    updatedCount++;
  } else {
    dupCount++;
  }
}

// Rewrite archive with merged data
const output = Array.from(existing.values())
  .map(e => JSON.stringify(e))
  .join('\n') + '\n';
fs.writeFileSync(ARCHIVE_FILE, output);

console.log(`${signals.length} signals parsed, ${newCount} new, ${updatedCount} updated with results (${dupCount} duplicates skipped)`);
