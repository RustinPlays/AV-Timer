JC AV Timer - Clock Update (website v5.0.8; Companion v0.9.2)

WHAT IS NEW
- Switch the operator's output between Countdown Timer and Current Time.
- Current Time in 24-hour HH:MM:SS or 12-hour hh:mm:ss AM/PM (seconds always shown).
- Output PiP, external window, full-screen and internet Remote Viewer follow the same source.
- Clock displays the operator computer's local timezone, including in remote viewer.
- Timer/queue carry on running behind the clock until you switch back to Timer.
- Companion actions + presets: Clock/Timer toggle, Show Clock, Show Timer, Clock 24H,
  Clock 12H, live clock variable, clock-mode feedback.

HOW TO INSTALL THE WEBSITE
1. Extract this ZIP.
2. Upload its CONTENTS (not a new parent folder) to the existing RustinPlays/AV-Timer
   GitHub repository root, preserving js/, css/, downloads/, companion-module/ and .github/.
3. Commit changes. Cloudflare Pages should deploy from that repo if linked.
4. Refresh timer.justincreative.tech (hard refresh once to bypass cached JS/CSS).

COMPANION
- Website top button downloads downloads/JC-AV-Timer-Companion-v0.9.2.tgz.
- Use Companion 5.1.x: Modules -> Import custom module/package, select the .tgz.
- In Companion, add the JC AV Timer connection if needed; set Local API port 3210.
- Keep the timer operator webpage open on the SAME computer as Companion.
- Browse Companion presets for Clock / Timer and 12H / 24H.
- The GitHub Actions workflow also attempts to rebuild and republish this .tgz from
  companion-module/ when the source changes.
- This ZIP contains a prebuilt .tgz so the download URL works immediately, even
  before GitHub Actions finishes. This prebuilt uses the self-contained import layout
  of the earlier working JC AV Timer module. The module source is also included.

OFFLINE
- downloads/JC-AV-Timer-Offline-v5.0.8.zip includes these clock changes.
- If using the offline version, replace your old extracted folder with the new one.

Not changed: remote relay worker, cloud credentials, timer logic, cue queue mechanics.
Back up any custom module buttons before replacing an installed module if needed.
