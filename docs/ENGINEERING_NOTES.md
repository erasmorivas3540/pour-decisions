# Engineering notes

For each fixed bug, record **Symptom / Root cause / Fix / How it is tested**.

## October 14, 2026 — Documentation drift (Phase 1, task 3)

- **Symptom:** `SUBMISSION.md` still had a placeholder project URL and 12-jinx references. `README.md` listed 19 Node tests, and `TEST_REPORT.md` mixed earlier counts with the current release and stated that deployment had not occurred.
- **Root cause:** Release-specific documentation was appended without keeping the current headline status synchronized.
- **Fix:** Updated the live URL and jinx count, reconciled the README with the current feature set, and separated current verified results from dated changes.
- **How it is tested:** Ran `npm test` with 28 passing tests and `npm run check` with successful syntax checks; cross-checked the deployed Render URL already recorded in the repository.
