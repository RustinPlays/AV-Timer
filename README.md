# JC AV Timer v4.8

A show timer for AV / live-event use, hosted directly from GitHub Pages with an optional offline package and native Bitfocus Companion control.

## Downloads

- **Offline App**: `downloads/JC-AV-Timer-Offline-v4.8.zip` — plain HTML/CSS/JS files, no EXE/CMD and no Windows Unblock step.
- **Companion Module**: `downloads/JC-AV-Timer-Companion-0.6.0.tgz` — ready to import into Bitfocus Companion.

## Companion

Open **Help** on the operator page for first-time setup. Search `JC` in Companion. Preset groups are Control, Add, Remove, Start, Set, Queue and Queue Add.

The v0.6.0 Companion module maintains live TIMER / HH / MM / SS and feedback from wall-clock anchors inside Companion, so the Stream Deck display keeps updating even when the browser window is unfocused.

## Background timing

The timer engine is wall-clock based rather than interval-delta based. Browser focus changes, tab throttling or a delayed JavaScript tick cannot make the countdown run slow; the next render catches up to the correct time immediately.
