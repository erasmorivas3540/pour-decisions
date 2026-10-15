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
class Client {
  constructor(seat) {
    this.seat = seat;
    this.state = null;
    this.waiters = new Set();
    this.abort = new AbortController();
  }
  async connect() {
    const { ticket } = await api('stream-ticket', this.seat);
    const response = await fetch(base + '/api/stream?ticket=' + encodeURIComponent(ticket), {
      signal: this.abort.signal,
    });
    assert.equal(response.status, 200, 'ticketed SSE accepted');
    void this.read(response.body);
  }
  async read(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame.split('\n').find((line) => line.startsWith('data: '));
          if (!data) continue;
          const snapshot = JSON.parse(data.slice(6));
          this.state = snapshot;
          stats.sseMessages++;
          const receivedAt = performance.now();
          for (const waiter of [...this.waiters]) {
            if (waiter.predicate(snapshot)) {
              this.waiters.delete(waiter);
              clearTimeout(waiter.timer);
              waiter.resolve({ snapshot, receivedAt });
            }
          }
        }
      }
    } catch (error) {
      if (!this.abort.signal.aborted) console.error('SSE read interrupted:', error.message);
    } finally {
      reader.releaseLock();
    }
  }
  expect(predicate, ms = 7000) {
    let waiter;
    const promise = new Promise((resolve, reject) => {
      waiter = {
        predicate, resolve, reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error('Matching SSE state did not arrive within ' + ms + 'ms'));
        }, ms),
      };
      this.waiters.add(waiter);
    });
    return {
      promise,
      cancel: () => {
        if (this.waiters.delete(waiter)) {
          clearTimeout(waiter.timer);
          waiter.resolve(null);
        }
      },
    };
  }
  close() {
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.resolve(null);
    }
    this.waiters.clear();
    this.abort.abort();
  }
}
async function waitUntil(fn, ms = 10000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (fn()) return;
    await sleep(30);
  }
  throw new Error('Timed out waiting for connected SSE clients');
}
async function action(client, type, value, matches) {
  const startedAt = performance.now();
  const expected = client.expect(matches);
  try {
    stats.actions++;
    await api('action', { ...client.seat, type, value: value || {} });
  } catch (error) {
    expected.cancel();
    throw error;
  }
  const matched = await expected.promise;
  assert.ok(matched, 'action must have a matching SSE broadcast');
  const latency = matched.receivedAt - startedAt;
  assert.ok(latency >= 0, 'monotonic POST-to-SSE timing');
  stats.latencies.push(latency);
}
