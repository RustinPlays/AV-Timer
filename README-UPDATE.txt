JC AV Timer v5 rebuild - replacement files

Replace these files in RustinPlays/AV-Timer:
- index.html
- output.html
- css/app.css
- css/output.css
- js/app.js
- js/timer.js
- js/output.js
- js/cloud-sync.js

Keep the existing assets, icons, js/sync.js, js/remote.js and js/desktop.js.

Implemented in this rebuild:
- Compact current-style UI rather than a redesign
- Clear grouped top bar
- Start/Pause toggle, Reset, Stop, permanent Next Cue button
- Duration input accepts : or . separators
- Set Timer and Adjust Running Timer clearly separated
- Queue labels, per-cue Play, manual Next Cue, no Auto Next
- Countdown continues negative and stays red when overtime
- Presenter free-text messages, presets, Show/Hide, Clear and Flash Message
- Flash Timer toggle
- Warning defaults: Please wrap up soon / Please wrap up now
- Warning banner priority under manual presenter messages
- Appearance refinements: Light, Minimal preset, Chroma, progress, gradient, shadow
- Chroma flat colour, no gradient/shadow, white text/black outline + invert option
- Built-in font dropdown, weight and custom font upload
- Output PiP retained; external display selector removed
- Open / Focus / Close external timer window
- Remote Viewer panel simplified to username/password and viewer count
- Main Help index plus per-panel ? help
- Keyboard shortcut mini panel
- Crash recovery via localStorage
- Companion command hooks added for new actions (existing module still needs its v0.8 preset/action update)

Current download links intentionally still point to the existing offline v4.9.2 package and Companion v0.7.0 so the website does not contain broken download links before those packages are rebuilt.
