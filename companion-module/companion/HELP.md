# JC - AV Timer · Companion v0.9.5

## Preset groups
01 Start/Pause/Stop · 02 Set Time · 03 Add (+) · 04 Remove (-) · 05 Live Timer
06 Clock · 07 Cue Queue · 08 Add To Queue · 09 Messages · 10 Appearance · 11 Feedbacks/Status.

Add time is green, remove time red; pause amber, stop red, clock blue.

## Live timer buttons
Drag the live timer, DD, HH, MM, SS or totals buttons straight onto your Companion
button grid. They carry the required live variable expression and colour feedback.
- DD: number of whole days remaining/elapsed
- HH: **total hours** (can be over 24); Hours in day is 00-23
- MM: minutes portion of the current hour (00-59)
- SS: seconds portion of current minute (00-59)
- Total minutes / total seconds: whole totals, not the minute/second component
- Clock time: local computer clock in 12h or 24h format with seconds

Existing buttons remain intact. To get revised formatting, drag the new presets
on top of your old ones. The original module ID is jc-av-timer.

Companion and browser are designed for the same computer, via localhost port 3210.
A browser on another laptop does not talk directly to this localhost connection.
