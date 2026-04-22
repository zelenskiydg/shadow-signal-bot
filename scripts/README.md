# Scripts

## export-logs.js

Exports signal logs from Railway to a local `signals-archive.jsonl` file.

### Prerequisites

- Railway CLI installed: `npm install -g @railway/cli`
- Logged in: `railway login`
- Project linked: `cd shadow-signal-bot && railway link`

### Usage

```bash
node scripts/export-logs.js
```

By default fetches last 10,000 log lines. To fetch more:

```bash
node scripts/export-logs.js --lines=50000
```

### Output

Signals are appended to `signals-archive.jsonl` in the repo root (JSONL format, one JSON object per line). Duplicate entries (same `time` + `symbol`) are automatically skipped.

### Recommended schedule

Run every 3-5 days. Railway keeps logs for 7 days — if you wait longer, older signals will be lost.
