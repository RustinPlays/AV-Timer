# JC AV Timer v5.0.0

This repository is the complete source for both:

- `timer.justincreative.tech` — operator + local output
- `relay.justincreative.tech` — internet Remote Viewer relay

It is designed to be uploaded into a completely empty GitHub repository. No old AV Timer files are required.

## Repository layout

```text
/
├─ index.html                     Operator UI
├─ output.html                    Clean timer output
├─ css/
│  ├─ app.css
│  └─ output.css
├─ js/
│  ├─ app.js                      Operator controls and UI logic
│  ├─ timer.js                    Timer + queue engine
│  ├─ output.js                   Clean output rendering
│  ├─ sync.js                     Local window/PiP synchronisation
│  ├─ remote.js                   Local Companion API bridge client
│  ├─ cloud-sync.js               Remote Viewer host client
│  └─ desktop.js                  Offline-package behaviour
├─ assets/
│  └─ jc-logo.png
├─ icons/
│  ├─ icon-192.png
│  └─ icon-512.png
├─ downloads/
│  ├─ JC-AV-Timer-Offline-v5.0.0.zip
│  └─ JC-AV-Timer-Companion-0.8.0.tgz
├─ src/
│  └─ index.js                    Cloudflare Worker/Durable Object relay
├─ package.json
└─ wrangler.jsonc
```

## timer.justincreative.tech

Serve the repository root as the static website. `index.html` is the operator and `output.html` is the timer output.

## relay.justincreative.tech

The Worker source is `src/index.js`. `wrangler.jsonc` contains the Durable Object binding and the `relay.justincreative.tech` custom-domain route.

Deploy with Cloudflare/Wrangler using:

```text
npm install
npm run deploy
```

## Remote Viewer

1. Open `timer.justincreative.tech`.
2. In Remote Viewer, enter any Username and Password and press **Start Remote Viewer**.
3. On another device, open `relay.justincreative.tech`.
4. Enter the same Username and Password.
5. The remote device receives the clean live output.

## Bitfocus Companion

Download/import `downloads/JC-AV-Timer-Companion-0.8.0.tgz` as a custom Companion module/package, then add **JC - AV Timer**.

Default local API port: `3210`.

The v0.8 module includes transport, timer presets, add/remove time, queue feedback, presenter messages, Flash Timer, Flash Message, appearance toggles, live cue information and viewer count.

## Offline package

`downloads/JC-AV-Timer-Offline-v5.0.0.zip` is the complete portable/offline copy. Extract it and open `JC AV Timer.html`.

The timer does not need internet to run. Companion is local. Remote Viewer needs internet.
