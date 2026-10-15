# Pour Decisions — measured load test

## Latest completed run — October 15, 2026 (UTC)

**Exact command executed:** `npm run loadtest`

**Source:** [GitHub Actions temporary measurement run](https://github.com/erasmorivas3540/pour-decisions/actions/runs/38759469486), completed at `2026-10-15T15:21:43.912Z`.

The test launched `server.js` on an ephemeral localhost port with `GAME_TIME_SCALE=0.05` (test-only acceleration), then concurrently created **20 rooms**, each with **two real HTTP/SSE clients and two engine-owned bots**. All rooms completed full games ending at **three spills**. The test was run against the local server inside the GitHub Actions runner, not against the production Render URL.

### Measured results

| Measurement                                 | Observed value |
| ------------------------------------------- | -------------: |
| Rooms requested / completed                 |        20 / 20 |
| Human HTTP/SSE clients                      |             40 |
| Engine bot seats                            |             40 |
| Completed game spills per room              |              3 |
| HTTP `POST /api/action` requests            |          1,551 |
| Failed room runs / request errors           |              0 |
| SSE state messages observed                 |         33,326 |
| Action-to-matching-SSE latency samples      |          1,551 |
| Latency p50                                 |        1.56 ms |
| Latency p95                                 |       11.30 ms |
| Latency max                                 |       46.14 ms |
| Server peak resident memory (Linux `VmHWM`) |     93.49 MiB |
| Load-harness peak resident memory           |     126.38 MiB |
| Elapsed runtime                             |  51.13 seconds |

Percentiles use the nearest-rank method on **successful HTTP action → matching SSE state update** measurements. Bots act inside the engine without HTTP requests, so the action count and latency measurements cover the human clients only. The memory measurements are for the server process and load harness respectively, not combined system memory.

### Measured runner environment

- Operating system: Linux `6.17.0-1022-azure` (x64)
- Processor: AMD EPYC 7763 64-Core Processor
- Logical CPUs visible: 4
- Reported installed memory: 15.61 GiB
- Node.js: v22.23.3

An [earlier measurement workflow](https://github.com/erasmorivas3540/pour-decisions/actions/runs/38757020224) also executed a separate one-room smoke test using `npm run loadtest -- --rooms=1 --timeout-ms=90000`; it completed successfully. This report focuses on the newer default 20-room measurement.


### Previous measured run — October 15, 2026 (UTC)

The earlier [GitHub Actions run 38757020224](https://github.com/erasmorivas3540/pour-decisions/actions/runs/38757020224) used the same `npm run loadtest` command and runner type before the Phase 6 rerun. It completed **20/20 rooms**, recorded **1,554 HTTP actions** and **0 errors**, with **1.43 ms p50**, **13.33 ms p95**, and **35.14 ms maximum** action-to-SSE latency. It observed **101.22 MiB server peak RSS**, **128.83 MiB harness peak RSS**, and **48.18 seconds** elapsed runtime. These are measured historical values, not projections.

### Reproduce

Run `npm ci` and `npm run loadtest` on a machine with Node.js 20 or newer. Use `npm run loadtest -- --rooms=N` to change the room count, or `--timeout-ms=N` to increase a per-room deadline. This test is intentionally excluded from `npm test` and `npm run check`.

Results vary by machine, load, operating system, and scheduling. The localhost latency measurements are not predictions for real-world Internet clients.
