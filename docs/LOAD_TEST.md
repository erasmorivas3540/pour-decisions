# Pour Decisions — measured load test

## Latest completed run — October 15, 2026 (UTC)

**Exact command executed:** `npm run loadtest`

**Source:** [GitHub Actions temporary measurement run](https://github.com/erasmorivas3540/pour-decisions/actions/runs/38757020224), completed at `2026-10-15T15:05:45.814Z`.

The test launched `server.js` on an ephemeral localhost port with `GAME_TIME_SCALE=0.05` (test-only acceleration), then concurrently created **20 rooms**, each with **two real HTTP/SSE clients and two engine-owned bots**. All rooms completed full games ending at **three spills**. The test was run against the local server inside the GitHub Actions runner, not against the production Render URL.

### Measured results

| Measurement | Observed value |
|---|---:|
| Rooms requested / completed | 20 / 20 |
| Human HTTP/SSE clients | 40 |
| Engine bot seats | 40 |
| Completed game spills per room | 3 |
| HTTP `POST /api/action` requests | 1,554 |
| Failed room runs / request errors | 0 |
| SSE state messages observed | 33,094 |
| Action-to-matching-SSE latency samples | 1,554 |
| Latency p50 | 1.43 ms |
| Latency p95 | 13.33 ms |
| Latency max | 35.14 ms |
| Server peak resident memory (Linux `VmHWM`) | 101.22 MiB |
| Load-harness peak resident memory | 128.83 MiB |
| Elapsed runtime | 48.18 seconds |

Percentiles use the nearest-rank method on **successful HTTP action → matching SSE state update** measurements. Bots act inside the engine without HTTP requests, so the action count and latency measurements cover the human clients only. The memory measurements are for the server process and load harness respectively, not combined system memory.

### Measured runner environment

- Operating system: Linux `6.17.0-1022-azure` (x64)
- Processor: AMD EPYC 7763 64-Core Processor
- Logical CPUs visible: 4
- Reported installed memory: 15.61 GiB
- Node.js: v22.23.3

The same workflow also executed a separate one-room smoke test with `npm run loadtest -- --rooms=1 --timeout-ms=90000`; it completed successfully. This report focuses on the default 20-room measurement.

### Reproduce

Run `npm ci` and `npm run loadtest` on a machine with Node.js 20 or newer. Use `npm run loadtest -- --rooms=N` to change the room count, or `--timeout-ms=N` to increase a per-room deadline. This test is intentionally excluded from `npm test` and `npm run check`.

Results vary by machine, load, operating system, and scheduling. The localhost latency measurements are not predictions for real-world Internet clients.
