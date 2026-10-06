# v4.9.2

- Rebranded the timer and Companion integration to **JC** / **J Creative** and added the supplied JC logo to the operator header and app icons.
- Reworked countdown/count-up timing around wall-clock anchors so changing focus, minimising, delayed ticks and background throttling do not make the timer run slow or pause unintentionally.
- Output windows derive their live display from the same clock anchors, so the secondary display can keep accurate time independently of operator render ticks.
- Companion v0.7.0 derives live TIMER / HH / MM / SS inside Companion and refreshes feedback every second without depending on continual browser timer posts.
- Added immediate optimistic Companion state for Pause / Resume and feature toggles so feedback changes as soon as a Stream Deck button is pressed.
- Replaced rapid 500 ms command polling with long-poll command delivery for better behaviour while the operator page is unfocused.
- Companion connected/offline heartbeat now stays valid across the 20-second long-poll wait, with a 45-second grace period, preventing false offline flicker while idle.
- Companion categories renamed to `JC · ...` and toggle presets remain one-button toggles with live ON/OFF feedback.
- Offline download no longer contains EXE/CMD/MSI files. It is plain web files plus the Companion `.tgz`, avoiding Windows unsigned-executable blocking/unblock steps.

## v4.9.2
- Fixed Download App being incorrectly hidden when the GitHub-ready build is opened locally with `file://`.
- Only the explicitly-marked offline package hides Download App now.
