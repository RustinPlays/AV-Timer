AV Timer Queue Fix v5.0.3

Replace these files in GitHub:
- index.html
- js/app.js
- js/timer.js
- css/app.css

Changes:
- Drag and drop queue reordering.
- Individual cue delete button.
- Deleting the cue currently playing no longer stops/resets/restarts the live timer.
- Play button hard-cuts atomically to any selected cue, even while another cue is running.
- Queue UI no longer rebuilds 10 times per second during timer ticks, which stabilises play/delete/drag interactions.
- Next Cue remains sensible after deleting the currently playing cue.
- Cache version bumped to v5.0.3.
