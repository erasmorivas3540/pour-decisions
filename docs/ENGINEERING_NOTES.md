# Engineering notes

For each fixed bug, record **Symptom / Root cause / Fix / How it is tested**.

## October 14, 2026 — Documentation drift (Phase 1, task 3)

- **Symptom:** `SUBMISSION.md` still had a placeholder project URL and 12-jinx references. `README.md` listed 19 Node tests, and `TEST_REPORT.md` mixed earlier counts with the current release and stated that deployment had not occurred.
- **Root cause:** Release-specific documentation was appended without keeping the current headline status synchronized.
- **Fix:** Updated the live URL and jinx count, reconciled the README with the current feature set, and separated current verified results from dated changes.
- **How it is tested:** Ran `npm test` with 28 passing tests and `npm run check` with successful syntax checks; cross-checked the deployed Render URL already recorded in the repository.

## October 14, 2026 — Source-sensitive regression tests after Prettier (Phase 1, task 1)

- **Symptom:** Prettier formatted the JavaScript successfully, but camera and sprite tests failed on source-text matches even though the runtime syntax checks passed.
- **Root cause:** Tests located JavaScript functions by exact whitespace (for example, a closing parenthesis immediately followed by an opening brace), and asserted exact spacing in the WebP MIME mapping and animation ternary.
- **Fix:** Changed the camera test's source-section markers to locate the same function and variable declarations independently of whitespace. Changed sprite assertions to tolerate whitespace while still requiring the exact MIME type and animation frame limits. Kept the existing VM-based behavior checks.
- **How it is tested:** Ran Prettier formatting and its check, then `npm run check` in an isolated GitHub Actions run; all 28 tests passed.

## October 14, 2026 — Opposite Controls integration scenario (Phase 1, task 1)

- **Symptom:** The three-client integration test sometimes timed out waiting for the guess phase after the pourer released the button.
- **Root cause:** The randomly selected Opposite Controls jinx intentionally resumes pouring when the player releases. The test did not use the separate Stop control required by that jinx.
- **Fix:** When the test's chosen jinx is Opposite Controls, it now sends the real `stop` action after the release, without changing the engine, scoring, or any gameplay timer.
- **How it is tested:** The same live HTTP/SSE three-client integration assertions and the full 28-test regression suite passed in the isolated formatting run.

## October 14, 2026 — Shuffle fairness (Phase 2, task 4)

- **Symptom:** Turn order and jinx cards relied on `sort(() => Math.random() - 0.5)`, which samples permutations unevenly and ignores the seeded engine RNG.
- **Root cause:** Comparator-based shuffling and module-level global randomness.
- **Fix:** Copy-preserving Fisher–Yates and sampling methods that consume `this.random` for all shuffle and selection paths.
- **How it is tested:** Seeded 20,000-trial position-frequency checks (23–27% per cell), deterministic replay checks and immutability assertion, plus `npm run check`.

## October 14, 2026 — Reusable session token in SSE URL (Phase 2, task 5)

- **Symptom:** The EventSource GET URL contained a player's durable seat token, which can be retained in HTTP/proxy access logs.
- **Root cause:** EventSource cannot set a custom Authorization header, so the client embedded the credential into the query string.
- **Fix:** Authenticated POST `/api/stream-ticket` issues an unpredictable, one-time 30-second capability (test-only TTL override). GET `/api/stream?ticket=` consumes it before establishing SSE, rejects legacy query credentials, and the browser fetches a fresh ticket after every reconnection.
- **How it is tested:** Ticket endpoint test covers valid stream, replay/reuse, expiry, missing ticket, old token URL rejection, unauthorized issuance, and fresh reconnect; existing two-/three-player SSE integration tests use tickets.

## October 14, 2026 — Shared Wi-Fi request throttling (Phase 2, task 6)

- **Symptom:** A single 200/minute IP-wide limit could return 429 to an entire dorm, classroom, or shared connection even when individual players were within normal usage.
- **Root cause:** The rate bucket was indexed only by `req.socket.remoteAddress` for every POST route.
- **Fix:** Use 600/minute per IP for anonymous create/join endpoints only; rate-limit authenticated `/api/action` and `/api/stream-ticket` requests at 120/minute per player ID. Both maps are bounded by periodic stale-bucket eviction.
- **How it is tested:** An eight-player HTTP/SSE test sends over 200 combined requests from one loopback IP without a 429, then shows that only a single player exceeding 120/minute is blocked while another player's actions remain permitted.

## October 14, 2026 — Sprite CSS test survives style formatting (Phase 3, task 7)

- **Symptom:** A repository-wide Prettier check correctly reported unformatted CSS; after formatting, a sprite asset test failed even though the photographic animation rules remained present.
- **Root cause:** The test used spacing-sensitive regular expressions for the CSS selector, asset URL, and sprite dimensions.
- **Fix:** Match the same selector, precise 16-frame asset path, and 400% × 400% sprite grid while tolerating Prettier-generated whitespace. Kept all existing asset and no-volume-marker assertions.
- **How it is tested:** Run `npx prettier --check .` and `npm run check` on the Node.js 20 and 22 CI matrix.

## October 14, 2026 — CI runner timing margins (Phase 3, task 7)

- **Symptom:** HTTP/SSE integration tests previously allowed short server-start windows (as low as 2.4 seconds) and 14–25-second overall test budgets, which could cause timeouts on busy CI runners.
- **Root cause:** The test harness made fixed startup and phase-wait assumptions despite variable process scheduling. The stream-ticket expiry test also used a 120-millisecond test-only TTL, leaving little room for ordinary scheduling delays.
- **Fix:** Preserved ephemeral ports (`PORT=0`) and gameplay clocks, increased only test startup, phase, and per-test wait limits, and tested ticket expiration with a one-second test-only TTL and a longer expiry wait.
- **How it is tested:** Run `npm run check` in GitHub Actions on both Node 20 and Node 22; the same SSE and security assertions must pass without altering production behavior.

## October 14, 2026 — Spill replay visibility and bounded recording (Phase 4, task 8)

- **Symptom:** Spill reveals showed only the final cup and could not replay how the overflow happened. Exposing an entire active turn timeline to clients would reveal secret jinx information before guessing ended.
- **Root cause:** The 20 Hz physics tick only retained a short private level history for Lag Goggles; no replay record, limited event feed, or phase-gated playback existed.
- **Fix:** Record bounded per-turn time/level/pouring samples at the existing tick cadence, plus pour inputs, glugs, splashes, bursts, and spill events. Keep at most 400 frames and 64 events per turn, retain only the most recent spill in each room, and project replay to client state only during that spill's reveal phase. The independent, accessible side-camera playback overlay supports 1×/2× while the game continues and shows the exact final level; reduced-motion mode shows the final frame.
- **How it is tested:** `tests/replay.test.js` asserts privacy in jinx/pour/guess, availability at reveal, 400-sample cap, exact final level, recorded special events, rematch clearing, and client playback interpolation. The camera VM test isolates unrelated replay update work; run `npm run check` and `npx prettier --check .` under both Node.js 20 and 22 CI before merging.

## October 15, 2026 — Engine-owned bot seats (Phase 5, task 9)

- **Symptom:** Solo players could not start a multiplayer room without another human, and tests could not exercise simulated opponents.
- **Root cause:** Only human players could occupy connected seats, choose jinxes, pour, guess, or acknowledge the guide.
- **Fix:** Added three host-controlled bot seats for the lobby. Bots are visibly identified as 🤖, instantly ready during onboarding, choose random offered jinx cards, aim for an absolute 70–97 target adjusted for their known handicap, and guess correctly with 40% probability. They use existing validated game actions and run inside the server's 20 Hz tick without HTTP/SSE clients or runtime dependencies.
- **How it is tested:** Tests cover host-only bot management, player caps, readiness, turn permissions, and completion of a 1-human + 2-bot game; full `npm run check` and Node 20/22 CI matrix must pass.

## October 15, 2026 — Bot seats and idle-room cleanup (Phase 5, task 9)

- **Symptom:** Once bots were represented as connected engine seats, an abandoned room with bots could remain in memory indefinitely.
- **Root cause:** The original room expiry check tested whether every seat was disconnected, and bot actions refreshed the room's last-activity clock.
- **Fix:** Expiration considers only connected human seats, and only human actions or connection changes refresh activity. Bots may finish a game normally but cannot hold an empty room forever.
- **How it is tested:** A fake-clock regression confirms a bot-filled room survives a short human disconnect but expires after the existing 30-minute inactivity threshold; the full engine and integration suite is re-run.

## October 15, 2026 — HTTP/SSE load-measurement coverage (Phase 5, task 10)

- **Symptom:** The project had integration tests but no reproducible measurement of multiple concurrent complete games, HTTP-to-SSE propagation delay, or server memory high-water mark.
- **Root cause:** Existing tests focused on individual room correctness rather than concurrent end-to-end workload and telemetry.
- **Fix:** Added a standalone, zero-dependency `tests/load.mjs` runner, exposed by `npm run loadtest`. It uses a fresh ephemeral server, ticketed SSE clients, real HTTP actions, two engine bots per room, per-action matching SSE latency tracking, and Linux process high-water-mark memory sampling. Performance results are recorded in `docs/LOAD_TEST.md` only after executing the benchmark.
- **How it is tested:** The GitHub Actions measurement run completed a one-room smoke game and 20/20 concurrent three-spill games with 0 reported errors. The normal `npm run check` suite passed 39 tests. Recorded measurements, date, hardware and exact command are preserved in the load-test report.
