# Handshake contest submission — Pour Decisions

**Project title:** Pour Decisions

**Project cover image:** `artwork/cover.png` (1200×820 game UI screenshot preview, generated using the real shipped interface and representative sample room state)

**Public project link:** `https://YOUR-DEPLOYED-HOSTNAME`  ← replace after deployment; this is NOT a live address.

## Project description (copy to Handshake)

**Pour Decisions** is a no-download, real-time multiplayer party game where 3–8 friends on separate devices take turns filling the same dangerously full cup. The twist? Your friends secretly jinx your controls, vision, or bottle before each pour. Everyone else gets one shot at guessing your handicap before the dramatic reveal.

**How to play:** (1) Secretly choose a jinx for the next player. (2) Pour at least six units without overflowing the shared cup. (3) Guess the jinx, earn points, and survive until the final spill. Nobody gets eliminated, so the entire group stays involved.

**Who it's for:** Friend groups, dorms, student clubs, remote hangouts, and anyone who wants a quick 5–10 minute game together without accounts or apps.

**How I guided and debugged the AI build:** I supplied a detailed multiplayer game specification, defined the role-specific gameplay rules and visual direction, and iterated through server-authority tests, all-12-jinx edge cases, a three-client live-sync integration test, and mobile/desktop screenshot review to fix bugs before packaging.

## Final submission checklist

- [x] Title, description, and cover image prepared.
- [x] Multiplayer source code created and locally tested with 3 simultaneous streaming clients.
- [x] Reconnection, scorekeeping, hidden jinxes, and all 12 jinx families have automated coverage.
- [ ] Deploy to a publicly accessible HTTPS URL and replace the placeholder above.
- [ ] Test on three physical devices (iPhone, Android, laptop) simultaneously.
- [ ] Ask someone new to follow the instructions without your assistance.
- [ ] Submit in Handshake's **Create a Multiplayer Game** mission by **October 30, 2026, 11:59 PM PT**.

*The public URL, physical-device check, and Handshake submission require actions outside the build container and are not represented as completed.*
