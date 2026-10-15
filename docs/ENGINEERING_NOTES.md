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
