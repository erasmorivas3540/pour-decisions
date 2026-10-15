# Pour Decisions — Verification report

## Current status — October 14, 2026

- **Version:** 1.0.0
- **Current automated suite:** **28 passing tests**, measured with `npm test` on Node.js 22.16.0 on October 14, 2026.
- **Syntax validation:** `npm run check` also checks `server.js`, `game.js`, and `public/app.js` with `node --check`.
- **Coverage:** Room creation, authorization, 2–8 player seating, spectators, hidden jinxes, all 13 jinx definitions and effects, server-side water and scoring, timers, spills, sudden-death ties, rematches, disconnections, two- and three-client live HTTP/SSE integration, tutorial readiness, and sprite/camera behavior.
- **Deployment:** The game has a public Render address: https://pour-decisions-ozbh.onrender.com.
- **Boundaries:** This test count is local automation, not physical-device acceptance. Open rooms are in memory and are lost on server restart. Optional Chromium/Playwright scripts are outside `npm test`.

## Dated changelog (historical releases)

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

`npm test` includes Node engine tests and actual HTTP/SSE integration tests. Optional browser scripts in `tests/browser_smoke.py` and `tests/render_preview.py` require Chromium/Playwright; they are not in the 28-test total. Real-device multiplayer play remains a separate acceptance check.
