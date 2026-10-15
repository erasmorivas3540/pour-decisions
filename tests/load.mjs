import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const match = /^--([a-z-]+)=(\d+)$/.exec(arg);
  if (!match) throw new Error('Expected --rooms=N or --timeout-ms=N, received ' + arg);
  return [match[1], Number(match[2])];
}));
const roomCount = options.rooms ?? 20;
const timeoutMs = options['timeout-ms'] ?? 180000;
assert.ok(Number.isInteger(roomCount) && roomCount >= 1 && roomCount <= 100, 'rooms must be 1–100');
assert.ok(Number.isInteger(timeoutMs) && timeoutMs >= 30000, 'timeout must be >= 30000 ms');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stats = { actions: 0, errors: 0, sseMessages: 0, latencies: [], completed: 0 };
const machine = {
  operatingSystem: os.type() + ' ' + os.release(),
  architecture: os.arch(),
  processor: os.cpus()[0]?.model || 'unknown',
  logicalCpus: os.cpus().length,
  installedMemoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
  node: process.version,
};
let base;
let peakServerRssMiB = 0;
let peakHarnessRssMiB = 0;
function sampleMemory(pid) {
  peakHarnessRssMiB = Math.max(peakHarnessRssMiB, process.memoryUsage().rss / 1024 ** 2);
  if (process.platform !== 'linux') return;
  try {
    const status = readFileSync('/proc/' + pid + '/status', 'utf8');
    const hwm = /^VmHWM:\s*(\d+)\s*kB/m.exec(status);
    if (hwm) peakServerRssMiB = Math.max(peakServerRssMiB, Number(hwm[1]) / 1024);
  } catch {
    // Optional /proc measurement: never substitute an invented number.
  }
}
function percentile(values, pct) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1)].toFixed(2));
}
async function api(route, payload) {
  const response = await fetch(base + '/api/' + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(route + ' failed HTTP ' + response.status + ': ' + data.error);
  return data;
}
