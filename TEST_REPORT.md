# Pour Decisions — Verification report

## Current status — October 15, 2026

- **Version:** 1.0.0
- **Current automated suite:** **39 passing tests on both Node.js 20 and Node.js 22**, measured in [GitHub Actions run 38758169524](https://github.com/erasmorivas3540/pour-decisions/actions/runs/38758169524) on October 15, 2026.
- **Syntax validation:** `npm run check` also checks `server.js`, `game.js`, and `public/app.js` with `node --check`.
- **Coverage:** Room creation, authorization, 2–8 player seating, spectators, hidden jinxes, all 13 jinx definitions and effects, server-side water and scoring, timers, spills, sudden-death ties, rematches, disconnections, two- and three-client live HTTP/SSE integration, stream-ticket security and shared-IP/player throttling, tutorial readiness, sprite/camera behavior, replay secrecy and capacity, bots, and complete three-spill bot games.
- **Deployment:** The game has a public Render address: https://pour-decisions-ozbh.onrender.com.
- **Load testing:** Separate [measured 20-room HTTP/SSE run](docs/LOAD_TEST.md) completed 20/20 games with 0 reported errors on a GitHub-hosted Linux runner; it is not part of the 39 tests.
- **Boundaries:** This test count is automated verification, not physical-device acceptance. Open rooms are in memory and are lost on server restart. Optional Chromium/Playwright scripts are outside `npm test`.

## Dated changelog (historical releases)

### October 15, 2026 — Engineering phases 1–5

- Added Prettier and explanatory comments; fixed documentation and spacing-sensitive tests.
- Replaced biased shuffling with injected-RNG Fisher–Yates; added single-use SSE tickets and per-player rate limiting.
- Enabled CI on Node 20 and 22 for formatting, syntax and regression checks.
- Added hidden-until-reveal spill replays (at most 400 samples) and side-view playback.
- Added host-managed bots and verified full games with one human and two bots; separated the standalone HTTP/SSE load harness and report from the main test suite.

### October 15, 2026 — Final documentation pass (phase 6)

- Updated README engineering highlights, architecture diagram, and the current test count; corrected old token-in-SSE-URL documentation and linked engineering/load-test reports.

### October 14, 2026 — Initial multiplayer engine and regression review

- Added server-owned room state, authentication, water physics, scoring, multiplayer jinx guessing, rematches, host transfer, and pause/reconnect logic.
- Fixed unused code reservation after failed creation, mandatory-drip completion, wrong-guess scoring, out-of-order control messages, host-refresh grace, rematch ordering, sudden-death parity, inline-style CSP, and screenshot toast artifacts.
- Earlier 12-jinx and test counts refer to an older build; they are not current results.

### October 14, 2026 — Two-player support

- Reduced minimum connected seats from three to two. Two-player matches skip guessing and alternate jinx/pour roles; larger rooms still include guessing.
- Added two-player HTTP/SSE and disconnect/pause tests.

### October 14, 2026 — Patient tutorial and slower pouring

- Removed the rule-screen countdown; connected seated players must each press Ready.
- Reduced standard flow to 3 units/second and increased ordinary maximum pour duration to 12 seconds.
- Added illustrated tutorial cards, richer water effects, and optional visual-review scripts.

### October 14, 2026 — Overhead photography and 16-frame animation

- Added **5 Feet Above**, bringing the jinx total to **13**.
- Split cameras: overhead for the active pourer and side view for everyone watching, without numerical fullness indicators during pouring.
- Added the user-provided 4×4 photographic atlas with level-based frame blending and a separate settled-water atlas.
- Added regression checks for camera assignment, sprite assets, and frame progression.

## Testing boundaries

`npm test` includes Node engine tests and actual HTTP/SSE integration tests. Optional browser scripts in `tests/browser_smoke.py` and `tests/render_preview.py` require Chromium/Playwright; they are not in the 39-test total. Real-device multiplayer play remains a separate acceptance check.
