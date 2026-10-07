import { DurableObject } from "cloudflare:workers";

const SERVICE_NAME = "av-timer-relay";
const PROTOCOL_VERSION = 1;
const MAX_MESSAGE_BYTES = 256 * 1024;
const ROOM_RE = /^[A-Z0-9][A-Z0-9_-]{3,63}$/;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders,
    },
  });
}

function normalizeRoom(value) {
  return (value || "").trim().toUpperCase();
}

function normalizeRole(value) {
  return value === "host" ? "host" : "client";
}

function normalizeName(value, fallback) {
  const cleaned = (value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return (cleaned || fallback).slice(0, 64);
}

function isAllowedOrigin(origin) {
  if (!origin || origin === "null") return true; // Native desktop clients often send no Origin.

  if (origin === "https://timer.justincreative.tech") return true;
  if (origin === "https://av-timer.pages.dev") return true;
  if (/^https:\/\/[a-z0-9-]+\.av-timer\.pages\.dev$/i.test(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;

  return false;
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeSend(ws, value) {
  try {
    ws.send(typeof value === "string" ? value : JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({
        service: SERVICE_NAME,
        status: "ok",
        protocol: PROTOCOL_VERSION,
        websocket: "/ws?room=ROOM&role=host|client&token=ROOM_TOKEN&name=DISPLAY_NAME",
      });
    }

    if (url.pathname !== "/ws") {
      return json({ error: "Not found" }, 404);
    }

    if (request.method !== "GET") {
      return json({ error: "Method not allowed" }, 405, { allow: "GET" });
    }

    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
      return json({ error: "WebSocket upgrade required" }, 426, { upgrade: "websocket" });
    }

    const origin = request.headers.get("Origin");
    if (!isAllowedOrigin(origin)) {
      return json({ error: "Origin not allowed" }, 403);
    }

    const room = normalizeRoom(url.searchParams.get("room"));
    if (!ROOM_RE.test(room)) {
      return json(
        { error: "Invalid room. Use 4-64 letters, numbers, underscores, or hyphens." },
        400,
      );
    }

    const token = url.searchParams.get("token") || "";
    if (token.length < 16 || token.length > 256) {
      return json({ error: "A room token of 16-256 characters is required." }, 400);
    }

    const role = normalizeRole(url.searchParams.get("role"));
    const name = normalizeName(url.searchParams.get("name"), role === "host" ? "Host" : "Client");

    const id = env.TIMER_ROOMS.idFromName(room);
    const roomStub = env.TIMER_ROOMS.get(id);

    const upstreamUrl = new URL(request.url);
    upstreamUrl.searchParams.set("room", room);
    upstreamUrl.searchParams.set("role", role);
    upstreamUrl.searchParams.set("name", name);

    return roomStub.fetch(new Request(upstreamUrl.toString(), request));
  },
};

export class TimerRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;

    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );
  }

  async fetch(request) {
    const url = new URL(request.url);
    const room = normalizeRoom(url.searchParams.get("room"));
    const role = normalizeRole(url.searchParams.get("role"));
    const name = normalizeName(url.searchParams.get("name"), role === "host" ? "Host" : "Client");
    const token = url.searchParams.get("token") || "";
    const suppliedTokenHash = await sha256Hex(token);

    const storedTokenHash = await this.ctx.storage.get("roomTokenHash");

    if (!storedTokenHash) {
      if (role !== "host") {
        return json({ error: "Room has not been created by a host yet." }, 404);
      }
      await this.ctx.storage.put({
        roomTokenHash: suppliedTokenHash,
        roomCreatedAt: Date.now(),
      });
    } else if (storedTokenHash !== suppliedTokenHash) {
      return json({ error: "Invalid room token." }, 403);
    }

    if (role === "host") {
      for (const existing of this.ctx.getWebSockets()) {
        const attachment = existing.deserializeAttachment();
        if (attachment?.role === "host") {
          try {
            existing.close(4001, "Host replaced by a newer host connection");
          } catch {
            // Socket is already closing/closed.
          }
        }
      }
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    this.ctx.acceptWebSocket(server);

    const attachment = {
      sessionId: crypto.randomUUID(),
      role,
      name,
      connectedAt: Date.now(),
    };
    server.serializeAttachment(attachment);

    const snapshot = await this.ctx.storage.get("latestState");

    safeSend(server, {
      type: "welcome",
      protocol: PROTOCOL_VERSION,
      room,
      sessionId: attachment.sessionId,
      role,
      name,
      serverTime: Date.now(),
      connections: this.connectionCount(),
      hasState: Boolean(snapshot),
    });

    if (snapshot) {
      safeSend(server, {
        type: "state",
        ...snapshot,
        restored: true,
      });
    }

    this.broadcast(
      {
        type: "presence",
        action: "join",
        peer: attachment,
        connections: this.connectionCount(),
        serverTime: Date.now(),
      },
      server,
    );

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string") {
      safeSend(ws, { type: "error", code: "TEXT_ONLY", message: "Binary messages are not supported." });
      return;
    }

    if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      try {
        ws.close(1009, "Message too large");
      } catch {
        // Ignore close races.
      }
      return;
    }

    let packet;
    try {
      packet = JSON.parse(message);
    } catch {
      safeSend(ws, { type: "error", code: "INVALID_JSON", message: "Messages must be valid JSON." });
      return;
    }

    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
      safeSend(ws, { type: "error", code: "INVALID_MESSAGE", message: "Message must be a JSON object." });
      return;
    }

    const sender = ws.deserializeAttachment() || {
      sessionId: "unknown",
      role: "client",
      name: "Unknown",
    };

    if (packet.type === "ping") {
      safeSend(ws, { type: "pong", serverTime: Date.now() });
      return;
    }

    if (packet.type === "request_state") {
      const snapshot = await this.ctx.storage.get("latestState");
      if (snapshot) {
        safeSend(ws, { type: "state", ...snapshot, restored: true });
      } else {
        safeSend(ws, { type: "state", revision: 0, data: null, serverTime: Date.now() });
      }
      return;
    }

    if (sender.role === "host") {
      await this.handleHostMessage(ws, sender, packet);
      return;
    }

    await this.handleClientMessage(ws, sender, packet);
  }

  async handleHostMessage(ws, sender, packet) {
    if (packet.type === "state") {
      const previous = await this.ctx.storage.get("latestState");
      const revision = (previous?.revision || 0) + 1;
      const snapshot = {
        revision,
        data: packet.data ?? null,
        updatedAt: Date.now(),
        serverTime: Date.now(),
      };

      await this.ctx.storage.put("latestState", snapshot);
      this.broadcast({ type: "state", ...snapshot }, ws);
      safeSend(ws, { type: "ack", for: "state", revision, serverTime: Date.now() });
      return;
    }

    if (packet.type === "event") {
      this.broadcast(
        {
          type: "event",
          event: packet.event ?? null,
          data: packet.data ?? null,
          from: sender.sessionId,
          serverTime: Date.now(),
        },
        ws,
      );
      return;
    }

    if (packet.type === "reset") {
      await this.ctx.storage.delete("latestState");
      this.broadcast({ type: "reset", serverTime: Date.now() }, ws);
      safeSend(ws, { type: "ack", for: "reset", serverTime: Date.now() });
      return;
    }

    safeSend(ws, {
      type: "error",
      code: "UNSUPPORTED_HOST_MESSAGE",
      message: "Host messages must be state, event, reset, request_state, or ping.",
    });
  }

  async handleClientMessage(ws, sender, packet) {
    if (packet.type === "command") {
      const hosts = this.broadcast(
        {
          type: "command",
          command: packet.command ?? null,
          data: packet.data ?? null,
          from: {
            sessionId: sender.sessionId,
            name: sender.name,
          },
          serverTime: Date.now(),
        },
        null,
        "host",
      );

      safeSend(ws, {
        type: "ack",
        for: "command",
        deliveredToHost: hosts > 0,
        serverTime: Date.now(),
      });
      return;
    }

    safeSend(ws, {
      type: "error",
      code: "UNSUPPORTED_CLIENT_MESSAGE",
      message: "Client messages must be command, request_state, or ping.",
    });
  }

  webSocketClose(ws, code, reason, wasClean) {
    const peer = ws.deserializeAttachment();
    this.broadcast(
      {
        type: "presence",
        action: "leave",
        peer,
        code,
        reason,
        wasClean,
        connections: this.connectionCount(),
        serverTime: Date.now(),
      },
      ws,
    );
  }

  webSocketError(ws, error) {
    const peer = ws.deserializeAttachment();
    this.broadcast(
      {
        type: "presence",
        action: "error",
        peer,
        message: error?.message || "WebSocket error",
        connections: this.connectionCount(),
        serverTime: Date.now(),
      },
      ws,
    );
  }

  connectionCount() {
    return this.ctx.getWebSockets().length;
  }

  broadcast(value, except = null, targetRole = null) {
    const payload = typeof value === "string" ? value : JSON.stringify(value);
    let delivered = 0;

    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;

      const attachment = socket.deserializeAttachment();
      if (targetRole && attachment?.role !== targetRole) continue;

      if (safeSend(socket, payload)) delivered += 1;
    }

    return delivered;
  }
}
