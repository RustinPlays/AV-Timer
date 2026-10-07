# AV Timer Relay

Cloudflare Worker + Durable Object relay for AV Timer remote/online sync.

This service is only for **Remote / Online** connections. AV Timer Desktop's Standalone and Local LAN modes should not depend on this Worker or on an internet connection.

## Cloudflare build settings

Connect the existing `av-timer-relay` Worker to the `RustinPlays/AV-Timer` repository using:

- Production branch: `main`
- Path: `/relay`
- Build command: leave blank
- Deploy command: `npx wrangler deploy`
- Preview command: `npx wrangler preview`

The Worker name in `wrangler.jsonc` is intentionally `av-timer-relay` so the Git deployment updates the Worker that already exists in Cloudflare.

After the first successful deployment, attach the custom domain:

- `relay.justincreative.tech`

The timer will then connect with `wss://relay.justincreative.tech/ws?...`.

## Endpoints

- `GET /` or `GET /health` - health/status JSON
- `GET /ws` - WebSocket upgrade endpoint

WebSocket parameters:

- `room` - 4-64 character room ID (`A-Z`, `0-9`, `_`, `-`)
- `role` - `host` or `client`
- `token` - 16-256 character room token
- `name` - optional display name

Example shape:

```text
wss://relay.justincreative.tech/ws?room=SHOW-ABC123&role=host&token=<random-room-token>&name=FOH
```

The first connection for a new room must be the host. Its token becomes the room token. Later host/client connections must present the same token.

## Relay protocol (v1)

Server messages include `welcome`, `state`, `event`, `presence`, `ack`, `pong`, `reset`, and `error`.

Host messages:

```json
{ "type": "state", "data": { "timer": {} } }
{ "type": "event", "event": "go", "data": {} }
{ "type": "reset" }
{ "type": "request_state" }
{ "type": "ping" }
```

Client messages:

```json
{ "type": "command", "command": "go", "data": {} }
{ "type": "request_state" }
{ "type": "ping" }
```

The latest host `state` packet is persisted in the room Durable Object so reconnecting clients can immediately receive the current timer state.

## Security / limits

- Room tokens are SHA-256 hashed before being stored in the Durable Object.
- Only one host is authoritative per room; a new valid host connection replaces the old host connection.
- WebSocket payloads are limited to 256 KiB.
- Browser origins are limited to the AV Timer Pages/custom domains plus localhost; native clients without an Origin header are allowed.
- Do not put permanent account secrets inside timer state or event payloads.
