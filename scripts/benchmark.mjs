// Benchmark traffic for the detector's 7-day test (ACESO NEXT_TASKS A1).
//
// Every 5 minutes, aligned to the clock (12:00, 12:05, ...), it runs all the
// Playwright journeys RUNS_PER_WINDOW times against production, then stops after
// --minutes. The detector compares each 5-minute slot with the same slot on the
// previous 7 days, so the traffic must be the same size at the same time daily.
//
// Why 12 runs per window: the detector scores a window only with at least 20
// events of each denominator (MIN_COUNT_SYNTHETIC in ACESO's packages/detector/gaps.py).
// One pass of the journeys sends 2 checkout_started events and 2 /checkout page
// views (the scarcest), so 12 passes give 24, with room for a failed journey.
//
// Usage (PowerShell, from this folder):
//   npm run benchmark                       # 60 minutes, production
//   npm run benchmark -- --minutes 15
//   npm run benchmark -- --runs 12 --workers 4 --url https://aceso-target-shop.vercel.app/

import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const WINDOW_MS = 5 * 60 * 1000;
// A batch is started this long after the window opens, so its first events are
// not stamped in the previous window by a slow clock.
const START_OFFSET_MS = 5 * 1000;
// A batch that runs past this point spills events into the next window.
const BATCH_BUDGET_MS = WINDOW_MS - START_OFFSET_MS - 15 * 1000;

function parseArgs(argv) {
  const opts = {
    minutes: 60,
    runs: 12,
    workers: 4,
    url: process.env.TARGET_SHOP_URL || "https://aceso-target-shop.vercel.app/",
  };
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, "");
    const value = argv[i + 1];
    if (!(key in opts) || value === undefined) {
      console.error(`Unknown or incomplete option: ${argv[i]}`);
      process.exit(2);
    }
    opts[key] = key === "url" ? value : Number(value);
    i++;
  }
  for (const key of ["minutes", "runs", "workers"]) {
    if (!Number.isInteger(opts[key]) || opts[key] < 1) {
      console.error(`--${key} must be a whole number of at least 1`);
      process.exit(2);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const require = createRequire(import.meta.url);
const playwrightCli = path.join(path.dirname(require.resolve("@playwright/test/package.json")), "cli.js");
const resultsDir = path.resolve("results", "benchmark");
mkdirSync(resultsDir, { recursive: true });

const hhmm = (d) => d.toTimeString().slice(0, 5);
const log = (msg) => console.log(`[benchmark ${new Date().toTimeString().slice(0, 8)}] ${msg}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

let child = null;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (child) child.kill();
    process.exit(130);
  });
}

function runBatch(windowStart) {
  const stamp = windowStart.toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const jsonFile = path.join(resultsDir, `window_${stamp}.json`);
  const args = [
    playwrightCli,
    "test",
    `--repeat-each=${opts.runs}`,
    `--workers=${opts.workers}`,
    // Overrides the config's html reporter, which opens a browser and waits on a failure.
    "--reporter=dot,json",
  ];
  return new Promise((resolve) => {
    child = spawn(process.execPath, args, {
      stdio: ["ignore", "inherit", "inherit"],
      env: { ...process.env, TARGET_SHOP_URL: opts.url, PLAYWRIGHT_JSON_OUTPUT_NAME: jsonFile },
    });
    child.on("close", (code) => {
      child = null;
      let stats = null;
      if (existsSync(jsonFile)) {
        try {
          stats = JSON.parse(readFileSync(jsonFile, "utf8")).stats;
        } catch {
          stats = null;
        }
      }
      resolve({ code, stats });
    });
  });
}

const firstWindow = Math.ceil(Date.now() / WINDOW_MS) * WINDOW_MS;
const stopAt = firstWindow + opts.minutes * 60 * 1000;
log(
  `${opts.runs} runs x all journeys per 5-min window, ${opts.workers} workers, ` +
    `${hhmm(new Date(firstWindow))} to ${hhmm(new Date(stopAt))}, target ${opts.url}`
);

let failedBatches = 0;
for (let windowStart = firstWindow; windowStart < stopAt; windowStart += WINDOW_MS) {
  const late = Date.now() - (windowStart + START_OFFSET_MS);
  if (late > WINDOW_MS / 2) {
    log(`window ${hhmm(new Date(windowStart))} skipped: the previous batch ran ${Math.round(late / 1000)} s into it`);
    continue;
  }
  await sleep(windowStart + START_OFFSET_MS - Date.now());
  const started = Date.now();
  const { code, stats } = await runBatch(new Date(windowStart));
  const seconds = Math.round((Date.now() - started) / 1000);
  const counts = stats
    ? `passed ${stats.expected}, failed ${stats.unexpected}, flaky ${stats.flaky}`
    : "no result file";
  if (code !== 0) failedBatches++;
  log(`window ${hhmm(new Date(windowStart))}: ${counts}, ${seconds} s`);
  if (Date.now() - started > BATCH_BUDGET_MS) {
    log(`  warning: the batch spilled into the next window; lower --runs or raise --workers`);
  }
}
log(`done: ${failedBatches} batch(es) had a failing journey`);
