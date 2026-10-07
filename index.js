import { DurableObject } from "cloudflare:workers";

const SERVICE_NAME = "av-timer-relay";
const PROTOCOL_VERSION = 2;
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
  if (!origin || origin === "null") return true;
  if (origin === "https://timer.justincreative.tech") return true;
  if (origin === "https://relay.justincreative.tech") return true;
  if (origin === "https://av-timer.pages.dev") return true;
  if (origin === "https://rustinplays.github.io") return true;
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

function viewerHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#08111f">
  <title>JC AV Timer — Viewer</title>
  <style>
    :root{color-scheme:dark;--bg:#08111f;--panel:#111c2d;--line:#2a3b51;--fg:#f8fafc;--muted:#91a4bd;--blue:#4bb7ff;--red:#ef4444;--green:#22c55e}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--fg)}
    body{overflow:hidden}.hidden{display:none!important}
    .login-screen{position:fixed;inset:0;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 50% 0,rgba(75,183,255,.13),transparent 45%),linear-gradient(180deg,#0d1726,#08111f)}
    .card{width:min(460px,100%);background:linear-gradient(180deg,#111c2d,#0d1726);border:1px solid var(--line);border-radius:18px;padding:22px;box-shadow:0 28px 80px rgba(0,0,0,.48)}
    .brand{font-size:.7rem;font-weight:900;letter-spacing:.18em;color:#78bde9}.card h1{font-size:1.55rem;margin:5px 0 8px}.card p{margin:0 0 18px;color:var(--muted);font-size:.86rem;line-height:1.5}
    label{display:flex;flex-direction:column;gap:6px;margin-top:10px;font-size:.75rem;font-weight:800;color:#cbd7e5}input{width:100%;padding:12px 13px;border-radius:10px;border:1px solid #30445f;background:#091421;color:var(--fg);font:inherit;outline:none}input:focus{border-color:var(--blue);box-shadow:0 0 0 3px rgba(75,183,255,.12)}
    .pass{display:grid;grid-template-columns:1fr auto;gap:7px}.pass button,button.primary{border:1px solid var(--line);border-radius:10px;background:#17263a;color:var(--fg);padding:10px 13px;font:inherit;cursor:pointer}.pass button:hover{background:#21344d}.primary{width:100%;margin-top:14px!important;background:#1478b8!important;border-color:#2498dc!important;font-weight:850!important}.primary:disabled{opacity:.55;cursor:wait}.error{min-height:20px;margin-top:10px;color:#ff9797;font-size:.76rem;line-height:1.4}.hint{margin-top:12px!important;margin-bottom:0!important;font-size:.72rem!important}
    .viewer{position:fixed;inset:0;background:#000}.viewer iframe{width:100%;height:100%;border:0;display:block;background:#000}.viewer-status{position:fixed;top:12px;left:12px;z-index:5;display:flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(8,17,31,.72);backdrop-filter:blur(9px);font-size:.7rem;color:#d8e6f4;opacity:.22;transition:opacity .15s}.viewer:hover .viewer-status,.viewer-status:focus-within{opacity:1}.dot{width:7px;height:7px;border-radius:50%;background:var(--green)}
    .viewer-controls{position:fixed;right:12px;top:12px;z-index:6;display:flex;gap:7px}.viewer-action{border:1px solid rgba(255,255,255,.2);border-radius:9px;background:rgba(8,17,31,.78);backdrop-filter:blur(9px);color:#fff;padding:8px 10px;font:inherit;font-size:.72rem;font-weight:800;cursor:pointer;opacity:.78;transition:opacity .15s,background .15s}.viewer-action:hover,.viewer-action:focus{opacity:1;background:rgba(20,120,184,.82);outline:none}.viewer-action.logout:hover,.viewer-action.logout:focus{background:rgba(149,46,53,.88)}
    .fullscreen-exit-hotspot{position:fixed;right:0;bottom:0;width:150px;height:110px;z-index:9;display:none;align-items:flex-end;justify-content:flex-end;padding:14px}.fullscreen-exit-button{border:1px solid rgba(255,255,255,.24);border-radius:10px;background:rgba(8,17,31,.82);backdrop-filter:blur(10px);color:#fff;padding:10px 13px;font:inherit;font-size:.72rem;font-weight:850;cursor:pointer;opacity:0;pointer-events:none;transform:translateY(5px);transition:opacity .15s,transform .15s}
    .viewer:fullscreen .viewer-status,.viewer:fullscreen .viewer-controls{display:none!important}.viewer:fullscreen .fullscreen-exit-hotspot{display:flex}.viewer:fullscreen .fullscreen-exit-hotspot:hover .fullscreen-exit-button,.viewer:fullscreen .fullscreen-exit-hotspot:focus-within .fullscreen-exit-button,.viewer:fullscreen .fullscreen-exit-hotspot.reveal .fullscreen-exit-button{opacity:1;pointer-events:auto;transform:none}
    .reconnect{position:fixed;inset:0;z-index:4;display:grid;place-items:center;background:rgba(0,0,0,.48);font-weight:800;letter-spacing:.04em}.reconnect.hidden{display:none}
    @media(max-width:600px){.viewer-status{opacity:.5}.viewer-action{opacity:.9}.card{padding:18px}.fullscreen-exit-hotspot{width:130px;height:100px}}
  </style>
</head>
<body>
  <section id="loginScreen" class="login-screen">
    <form id="loginForm" class="card">
      <div class="brand">JC · AV TIMER</div>
      <h1>Remote Viewer</h1>
      <p>Enter the viewer login set by the operator on timer.justincreative.tech.</p>
      <label>Username<input id="username" type="text" maxlength="64" autocomplete="username" spellcheck="false" placeholder="User" required></label>
      <label>Password<div class="pass"><input id="password" type="password" maxlength="128" autocomplete="current-password" placeholder="Password" required><button id="showPass" type="button">Show</button></div></label>
      <button id="loginBtn" class="primary" type="submit">View Timer</button>
      <div id="error" class="error" role="status"></div>
      <p class="hint">The password is converted into a derived relay token in your browser; it is not placed in the viewer URL.</p>
    </form>
  </section>

  <section id="viewer" class="viewer hidden">
    <iframe id="timerFrame" src="https://timer.justincreative.tech/output.html?relayViewer=1" title="AV Timer remote output" allow="fullscreen" allowfullscreen></iframe>
    <div class="viewer-status"><span class="dot"></span><span id="viewerLabel">Connected</span></div>
    <div class="viewer-controls">
      <button id="fullscreenBtn" class="viewer-action" type="button">Fullscreen</button>
      <button id="logout" class="viewer-action logout" type="button">Log out</button>
    </div>
    <div id="fullscreenExitHotspot" class="fullscreen-exit-hotspot" aria-label="Fullscreen exit controls">
      <button id="exitFullscreenBtn" class="fullscreen-exit-button" type="button">Exit Fullscreen</button>
    </div>
    <div id="reconnect" class="reconnect hidden">Reconnecting…</div>
  </section>

<script>
(() => {
  'use strict';
  const WS_PATH = '/ws';
  const PREFS_KEY = 'jcAvTimerViewerUserV2';
  const PASS_KEY = 'jcAvTimerViewerPassV2';
  const $ = id => document.getElementById(id);
  const loginScreen = $('loginScreen');
  const viewer = $('viewer');
  const form = $('loginForm');
  const username = $('username');
  const password = $('password');
  const error = $('error');
  const loginBtn = $('loginBtn');
  const frame = $('timerFrame');
  const reconnect = $('reconnect');
  const viewerLabel = $('viewerLabel');
  const fullscreenBtn = $('fullscreenBtn');
  const exitFullscreenBtn = $('exitFullscreenBtn');
  const fullscreenExitHotspot = $('fullscreenExitHotspot');
  let fullscreenRevealTimer = null;
  let socket = null;
  let creds = null;
  let welcomed = false;
  let manualClose = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let lastPayload = null;

  function canonicalUsername(value){ return String(value||'').normalize('NFKC').trim().toLowerCase(); }
  async function sha256Hex(value){
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,'0')).join('');
  }
  async function deriveCredentials(userValue, passValue){
    const user = canonicalUsername(userValue);
    const pass = String(passValue||'');
    if(user.length < 3) throw new Error('Username must be at least 3 characters.');
    if(pass.length < 4) throw new Error('Password must be at least 4 characters.');
    const roomHash = await sha256Hex('jc-av-timer-room-v2\\u0000'+user+'\\u0000'+pass);
    const token = await sha256Hex('jc-av-timer-token-v2\\u0000'+user+'\\u0000'+pass);
    return {room:'VIEW-'+roomHash.slice(0,24).toUpperCase(),token};
  }
  function postPayload(payload){
    if(!payload) return;
    lastPayload = payload;
    try{ frame.contentWindow?.postMessage({type:'av-timer-state',source:'relay-viewer',payload}, 'https://timer.justincreative.tech'); }catch{}
  }
  frame.addEventListener('load',()=>{ if(lastPayload) setTimeout(()=>postPayload(lastPayload),80); });

  function setLogin(message=''){
    loginScreen.classList.remove('hidden'); viewer.classList.add('hidden'); reconnect.classList.add('hidden');
    error.textContent = message; loginBtn.disabled = false; loginBtn.textContent = 'View Timer';
  }
  function setViewer(){
    loginScreen.classList.add('hidden'); viewer.classList.remove('hidden'); reconnect.classList.add('hidden');
    viewerLabel.textContent = username.value.trim() ? 'Connected · '+username.value.trim() : 'Connected';
  }
  function savePrefs(){
    try{ localStorage.setItem(PREFS_KEY, username.value.trim()); sessionStorage.setItem(PASS_KEY,password.value); }catch{}
  }
  function loadPrefs(){
    try{
      const queryUser = new URL(location.href).searchParams.get('user');
      username.value = queryUser || localStorage.getItem(PREFS_KEY) || '';
      password.value = sessionStorage.getItem(PASS_KEY) || '';
    }catch{}
  }

  async function login(){
    if(socket){manualClose=true;try{socket.close(1000,'New login');}catch{}socket=null;}
    welcomed=false; manualClose=false; error.textContent=''; loginBtn.disabled=true; loginBtn.textContent='Connecting…';
    try{ creds = await deriveCredentials(username.value,password.value); savePrefs(); }
    catch(err){ setLogin(err.message||'Invalid login.'); return; }
    connect(false);
  }

  function connect(isReconnect){
    if(!creds) return;
    const url = new URL(WS_PATH, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('room',creds.room); url.searchParams.set('role','client'); url.searchParams.set('token',creds.token); url.searchParams.set('name',username.value.trim()||'Viewer');
    let ws;
    try{ ws = new WebSocket(url.toString()); }catch{ setLogin('Could not connect to the relay.'); return; }
    socket=ws;
    if(isReconnect) reconnect.classList.remove('hidden');
    ws.onopen=()=>{ if(socket!==ws)return; welcomed=true; reconnectAttempt=0; setViewer(); try{ws.send(JSON.stringify({type:'request_state'}));}catch{} };
    ws.onmessage=e=>{ if(socket!==ws)return; let packet;try{packet=JSON.parse(e.data)}catch{return} if(packet.type==='state'&&packet.data)postPayload(packet.data); if(packet.type==='welcome')setViewer(); };
    ws.onerror=()=>{};
    ws.onclose=()=>{
      if(socket!==ws)return; socket=null;
      if(manualClose)return;
      if(!welcomed){ setLogin('Login failed. Check the username/password and make sure the host has started Remote mode.'); return; }
      reconnect.classList.remove('hidden');
      const delay=Math.min(10000,1000*Math.pow(1.7,reconnectAttempt++));
      reconnectTimer=setTimeout(()=>connect(true),delay);
    };
  }

  async function enterFullscreen(){
    try{ await viewer.requestFullscreen?.(); }catch{}
  }
  async function leaveFullscreen(){
    try{ if(document.fullscreenElement) await document.exitFullscreen?.(); }catch{}
  }
  function revealFullscreenExit(){
    if(document.fullscreenElement !== viewer) return;
    fullscreenExitHotspot.classList.add('reveal');
    if(fullscreenRevealTimer) clearTimeout(fullscreenRevealTimer);
    fullscreenRevealTimer=setTimeout(()=>fullscreenExitHotspot.classList.remove('reveal'),2200);
  }

  form.addEventListener('submit',e=>{e.preventDefault();login();});
  $('showPass').onclick=()=>{const show=password.type==='password';password.type=show?'text':'password';$('showPass').textContent=show?'Hide':'Show'};
  fullscreenBtn.onclick=enterFullscreen;
  exitFullscreenBtn.onclick=leaveFullscreen;
  fullscreenExitHotspot.addEventListener('pointerdown',e=>{ if(e.target!==exitFullscreenBtn) revealFullscreenExit(); });
  fullscreenExitHotspot.addEventListener('mouseenter',revealFullscreenExit);
  document.addEventListener('fullscreenchange',()=>{
    if(document.fullscreenElement!==viewer){
      fullscreenExitHotspot.classList.remove('reveal');
      if(fullscreenRevealTimer) clearTimeout(fullscreenRevealTimer);
      fullscreenRevealTimer=null;
    }
  });
  $('logout').onclick=async()=>{manualClose=true;if(reconnectTimer)clearTimeout(reconnectTimer);try{socket?.close(1000,'Logout')}catch{}socket=null;creds=null;lastPayload=null;password.value='';try{sessionStorage.removeItem(PASS_KEY)}catch{}await leaveFullscreen();setLogin('');};
  window.addEventListener('online',()=>{if(creds&&!socket&&!manualClose)connect(true)});
  loadPrefs();
})();
</script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(viewerHtml(), {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src https://timer.justincreative.tech; connect-src 'self' wss://relay.justincreative.tech; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        service: SERVICE_NAME,
        status: "ok",
        protocol: PROTOCOL_VERSION,
        viewer: "https://relay.justincreative.tech/",
        operator: "https://timer.justincreative.tech/",
        websocket: "/ws",
      });
    }

    if (url.pathname !== "/ws") return json({ error: "Not found" }, 404);
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, { allow: "GET" });
    if ((request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
      return json({ error: "WebSocket upgrade required" }, 426, { upgrade: "websocket" });
    }

    const origin = request.headers.get("Origin");
    if (!isAllowedOrigin(origin)) return json({ error: "Origin not allowed" }, 403);

    const room = normalizeRoom(url.searchParams.get("room"));
    if (!ROOM_RE.test(room)) {
      return json({ error: "Invalid room." }, 400);
    }

    const token = url.searchParams.get("token") || "";
    if (token.length < 16 || token.length > 256) {
      return json({ error: "A valid room token is required." }, 400);
    }

    const role = normalizeRole(url.searchParams.get("role"));
    const name = normalizeName(url.searchParams.get("name"), role === "host" ? "Host" : "Viewer");
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
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    const url = new URL(request.url);
    const room = normalizeRoom(url.searchParams.get("room"));
    const role = normalizeRole(url.searchParams.get("role"));
    const name = normalizeName(url.searchParams.get("name"), role === "host" ? "Host" : "Viewer");
    const token = url.searchParams.get("token") || "";
    const suppliedTokenHash = await sha256Hex(token);
    const storedTokenHash = await this.ctx.storage.get("roomTokenHash");

    if (!storedTokenHash) {
      if (role !== "host") return json({ error: "Host is not online yet." }, 404);
      await this.ctx.storage.put({ roomTokenHash: suppliedTokenHash, roomCreatedAt: Date.now() });
    } else if (storedTokenHash !== suppliedTokenHash) {
      return json({ error: "Invalid viewer login." }, 403);
    }

    if (role === "host") {
      for (const existing of this.ctx.getWebSockets()) {
        const attachment = existing.deserializeAttachment();
        if (attachment?.role === "host") {
          try { existing.close(4001, "Host replaced by a newer host connection"); } catch {}
        }
      }
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);
    this.ctx.acceptWebSocket(server);
    const attachment = { sessionId: crypto.randomUUID(), role, name, connectedAt: Date.now() };
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

    if (snapshot) safeSend(server, { type: "state", ...snapshot, restored: true });
    this.broadcast({ type: "presence", action: "join", peer: attachment, connections: this.connectionCount(), serverTime: Date.now() }, server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string") {
      safeSend(ws, { type: "error", code: "TEXT_ONLY", message: "Binary messages are not supported." });
      return;
    }
    if (new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      try { ws.close(1009, "Message too large"); } catch {}
      return;
    }

    let packet;
    try { packet = JSON.parse(message); }
    catch {
      safeSend(ws, { type: "error", code: "INVALID_JSON", message: "Messages must be valid JSON." });
      return;
    }
    if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
      safeSend(ws, { type: "error", code: "INVALID_MESSAGE", message: "Message must be a JSON object." });
      return;
    }

    const sender = ws.deserializeAttachment() || { sessionId: "unknown", role: "client", name: "Unknown" };
    if (packet.type === "ping") { safeSend(ws, { type: "pong", serverTime: Date.now() }); return; }
    if (packet.type === "request_state") {
      const snapshot = await this.ctx.storage.get("latestState");
      if (snapshot) safeSend(ws, { type: "state", ...snapshot, restored: true });
      else safeSend(ws, { type: "state", revision: 0, data: null, serverTime: Date.now() });
      return;
    }

    if (sender.role === "host") {
      if (packet.type === "state") {
        const previous = await this.ctx.storage.get("latestState");
        const revision = (previous?.revision || 0) + 1;
        const snapshot = { revision, data: packet.data ?? null, updatedAt: Date.now(), serverTime: Date.now() };
        await this.ctx.storage.put("latestState", snapshot);
        this.broadcast({ type: "state", ...snapshot }, ws);
        safeSend(ws, { type: "ack", for: "state", revision, serverTime: Date.now() });
        return;
      }
      if (packet.type === "event") {
        this.broadcast({ type: "event", event: packet.event ?? null, data: packet.data ?? null, from: sender.sessionId, serverTime: Date.now() }, ws);
        return;
      }
      if (packet.type === "reset") {
        await this.ctx.storage.delete("latestState");
        this.broadcast({ type: "reset", serverTime: Date.now() }, ws);
        safeSend(ws, { type: "ack", for: "reset", serverTime: Date.now() });
        return;
      }
      safeSend(ws, { type: "error", code: "UNSUPPORTED_HOST_MESSAGE", message: "Unsupported host message." });
      return;
    }

    if (packet.type === "command") {
      const hosts = this.broadcast({ type: "command", command: packet.command ?? null, data: packet.data ?? null, from: { sessionId: sender.sessionId, name: sender.name }, serverTime: Date.now() }, null, "host");
      safeSend(ws, { type: "ack", for: "command", deliveredToHost: hosts > 0, serverTime: Date.now() });
      return;
    }

    safeSend(ws, { type: "error", code: "UNSUPPORTED_CLIENT_MESSAGE", message: "Client messages must be request_state, ping, or command." });
  }

  webSocketClose(ws, code, reason, wasClean) {
    const peer = ws.deserializeAttachment();
    this.broadcast({ type: "presence", action: "leave", peer, code, reason, wasClean, connections: this.connectionCount(), serverTime: Date.now() }, ws);
  }

  webSocketError(ws, error) {
    const peer = ws.deserializeAttachment();
    this.broadcast({ type: "presence", action: "error", peer, message: error?.message || "WebSocket error", connections: this.connectionCount(), serverTime: Date.now() }, ws);
  }

  connectionCount() { return this.ctx.getWebSockets().length; }

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
