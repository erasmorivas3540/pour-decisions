# Pour Decisions — Verification report

**Build:** 1.0.0 · October 14, 2026

## Completed checks

- `npm run check`: Node syntax checks plus **13 passing automated tests**.
- Core engine: room creation, names and tokens; host authorization; starting with 3 people; settings 3/5/7; mandatory 6 units; synchronized scoring and guesses; spilling and cup resets; sabotage bonus; late spectator joins; rematch; host transfer; pause/reconnect; ties with same-jinx sudden death.
- Tested **all 12 jinx identifiers**: Fire Hose/ Eyedropper rates, Ketchup delay, Heavy Arm delayed presses, Opposite Day inverted input, Butterfingers splash, Shaky bursts, Fog/Tunnel blurred or clipped presentation values, Lag Goggles history, Lights Out blacked-out cup, Soda Can foam flag.
- HTTP integration: launched a real local service with **three concurrent independent streaming connections**; started a room, began a round, poured over the network, verified snapshots and minimum filling, checked guesser state does not expose secret jinx data, submitted a valid guess, verified +5 score, rejected repeated guesses and forged authentication.
- Headless Chromium **offline visual rendering** of the production HTML/CSS/JS: home, invite lobby, pourer, guessing, reveal, game over. Eight screenshot assets generated. Checked 390px mobile and 1200px desktop layouts; no horizontal overflow. UI navigation and help modal were exercised in the offline preview.
- Source scan: no external packages, no remote dependencies, and all game actions validated server-side.

## Fixes made during review

1. Prevented failed room creation from reserving an unused room code.
2. Fixed mandatory-drip completion after the standard pour duration expires.
3. Corrected scoring of wrong guesses (including spills), delayed-vision rendering, and dynamic visual feedback.
4. Prevented fast tap/release requests from arriving out of order over real networks.
5. Added a short refresh grace period before host handoff, preserving the host when reconnecting quickly.
6. Kept original join order for host handoff while reshuffling independent turn order on rematch.
7. Restricted sudden-death jinx selection to fair, normal-rate effects and preserved the same effect for all finalists.
8. Fixed the CSP to permit the game's inline element styles, and removed a hidden toast artifact from full-page screenshots.

## What was *not* verified from this environment

- No public deployment URL was created: user-owned hosting account/connection required.
- Browser policy blocked `http://localhost` navigation in Chromium; therefore, a genuine 3-browser, full-UI end-to-end run in this container was not possible. The game protocol **was** tested end-to-end using 3 live HTTP/SSE clients. UI was separately rendered and reviewed in Chromium from the shipped files.
- No physical iPhone or Android was connected; run the checklist in `SUBMISSION.md` after deployment.
- Because room data is in memory, durability across server restarts and multi-instance scaling is not supported (not required for a short live party game, but relevant to hosting).

**Conclusion:** Source is launchable on a single Node service and passed the automated tests above. Internet deployment and device playtesting remain external steps.
