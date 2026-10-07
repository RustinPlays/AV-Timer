(() => {
  'use strict';

  const S = window.AVSync;
  if (!S) return;

  const ENDPOINT = 'wss://relay.justincreative.tech/ws';
  const VIEWER_BASE = 'https://relay.justincreative.tech/';
  const PREFS_KEY = 'jcAvTimerRemoteLoginV2';
  const PASS_KEY = 'jcAvTimerRemotePasswordV2';
  const SEND_INTERVAL_MS = 300;
  const RECONNECT_MAX_MS = 10000;

  const state = {
    mode: 'standalone',
    username: '',
    password: '',
    room: '',
    token: '',
    socket: null,
    socketState: 'offline',
    connections: 0,
    reconnectAttempt: 0,
    reconnectTimer: null,
    manualClose: true,
    pendingPayload: null,
    sendTimer: null,
    lastSendAt: 0,
    lastError: '',
  };

  const el = {};

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      state.username = String(saved?.username || '').slice(0, 64);
      state.password = String(sessionStorage.getItem(PASS_KEY) || '').slice(0, 128);
    } catch {}
  }

  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ username: state.username }));
      if (state.password) sessionStorage.setItem(PASS_KEY, state.password);
      else sessionStorage.removeItem(PASS_KEY);
    } catch {}
  }

  function canonicalUsername(value) {
    return String(value || '').normalize('NFKC').trim().toLowerCase();
  }

  async function sha256Hex(value) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function deriveCredentials(username, password) {
    const user = canonicalUsername(username);
    const pass = String(password || '');
    if (user.length < 3) throw new Error('Username must be at least 3 characters.');
    if (pass.length < 4) throw new Error('Password must be at least 4 characters.');
    if (user.length > 64 || pass.length > 128) throw new Error('Username or password is too long.');

    // The plain password never goes into the URL or Cloudflare storage. Both the
    // room ID and relay token are deterministic hashes so the viewer can derive
    // exactly the same connection details from the friendly username/password.
    const roomHash = await sha256Hex(`jc-av-timer-room-v2\u0000${user}\u0000${pass}`);
    const token = await sha256Hex(`jc-av-timer-token-v2\u0000${user}\u0000${pass}`);
    return {
      room: `VIEW-${roomHash.slice(0, 24).toUpperCase()}`,
      token,
    };
  }

  function viewerLink() {
    const user = state.username.trim();
    if (!user) return VIEWER_BASE;
    const url = new URL(VIEWER_BASE);
    url.searchParams.set('user', user);
    return url.toString();
  }

  function injectStyles() {
    if (document.getElementById('cloudSyncStyles')) return;
    const style = document.createElement('style');
    style.id = 'cloudSyncStyles';
    style.textContent = `
      .cloud-sync-panel .panel-title-row{align-items:flex-start}
      .cloud-mode-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
      .cloud-mode-tabs button{min-width:0;padding:8px 6px;font-size:.7rem;font-weight:850}
      .cloud-mode-tabs button.active{background:#164b70;border-color:#4bb7ff;color:#fff;box-shadow:inset 0 0 0 1px rgba(75,183,255,.24)}
      .cloud-mode-tabs button[disabled]{opacity:.48;cursor:not-allowed}
      .cloud-sync-body{margin-top:10px;display:flex;flex-direction:column;gap:8px}
      .cloud-status-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;border:1px solid var(--line);background:#0b1726;border-radius:9px;padding:9px 10px}
      .cloud-status-main{display:flex;align-items:center;gap:8px;min-width:0}
      .cloud-dot{width:8px;height:8px;border-radius:50%;background:#64748b;box-shadow:0 0 0 3px rgba(100,116,139,.12)}
      .cloud-dot.online{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.14)}
      .cloud-dot.connecting{background:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.14)}
      .cloud-dot.offline{background:#ef4444;box-shadow:0 0 0 3px rgba(239,68,68,.12)}
      .cloud-status-text{min-width:0}.cloud-status-text strong{display:block;font-size:.76rem}.cloud-status-text span{display:block;color:var(--muted);font-size:.68rem;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .cloud-peer-count{font-size:.68rem;color:#b8daf1;white-space:nowrap}
      .cloud-field{display:flex;flex-direction:column;gap:5px}.cloud-field>span{font-size:.7rem;color:var(--muted);font-weight:800}
      .cloud-field input{width:100%;background:#0a1422;border:1px solid #30445f;color:var(--fg);border-radius:8px;padding:9px 10px;outline:none;font:inherit}
      .cloud-field input:focus{border-color:#4bb7ff;box-shadow:0 0 0 3px rgba(75,183,255,.12)}
      .cloud-password-wrap,.cloud-copy-wrap{display:grid;grid-template-columns:1fr auto;gap:6px}.cloud-copy-wrap input{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.68rem}
      .cloud-action-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.cloud-action-row.single{grid-template-columns:1fr}
      .cloud-connect-btn{background:#138a4e;border-color:#22c55e;font-weight:850}.cloud-disconnect-btn{background:#53262c;border-color:#8a3942}
      .cloud-note{font-size:.7rem;line-height:1.45;color:var(--muted);margin:0}.cloud-note strong{color:#dceafe}
      .cloud-credentials-card{border:1px solid rgba(75,183,255,.28);background:rgba(14,49,75,.32);border-radius:10px;padding:9px;display:flex;flex-direction:column;gap:7px}
      .cloud-credentials-card.hidden{display:none}
      @media(max-width:520px){.cloud-mode-tabs{grid-template-columns:1fr}.cloud-action-row{grid-template-columns:1fr}.cloud-password-wrap,.cloud-copy-wrap{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function patchHelpCopy() {
    const sections = Array.from(document.querySelectorAll('.help-section'));
    sections.forEach(section => {
      section.querySelectorAll('p,li').forEach(node => {
        if (node.innerHTML.includes('The webpage can still come directly from GitHub.')) {
          node.innerHTML = node.innerHTML.replace('The webpage can still come directly from GitHub.', 'Use <b>timer.justincreative.tech</b> for the normal online operator.');
        }
        if (node.innerHTML.includes('The GitHub page is the normal online version.')) {
          node.innerHTML = node.innerHTML.replace('The GitHub page is the normal online version.', '<b>timer.justincreative.tech</b> is the normal online operator.');
        }
      });
    });

    const helpScroll = document.querySelector('.help-scroll');
    if (helpScroll && !document.getElementById('cloudSyncHelpSection')) {
      const remoteHelp = document.createElement('section');
      remoteHelp.id = 'cloudSyncHelpSection';
      remoteHelp.className = 'help-section';
      remoteHelp.innerHTML = `
        <h3>Remote Viewer</h3>
        <p>On <b>timer.justincreative.tech</b>, open <b>Timer Sync</b>, choose <b>Remote · Internet</b>, then choose your own viewer username and password and press <b>Start Remote Host</b>.</p>
        <p>Viewers go to <b>relay.justincreative.tech</b>, enter that username and password, and they immediately get the clean timer output. They do not need the operator page or an invite code.</p>
        <p>The password is converted into a one-way browser-derived relay token before it is sent. Changing the password automatically creates a different remote session. Standalone mode does not require internet; LAN sync is reserved for the installed desktop app.</p>`;
      const external = sections.find(section => section.querySelector('h3')?.textContent?.trim() === 'External Display');
      if (external) helpScroll.insertBefore(remoteHelp, external);
      else helpScroll.appendChild(remoteHelp);
    }
  }

  function injectUI() {
    injectStyles();
    patchHelpCopy();

    const topbarActions = document.querySelector('.topbar-actions');
    if (topbarActions && !document.getElementById('cloudTopStatus')) {
      const pill = document.createElement('span');
      pill.id = 'cloudTopStatus';
      pill.className = 'status-pill idle';
      pill.textContent = 'Standalone';
      const bridge = document.getElementById('bridgeStatus');
      if (bridge) topbarActions.insertBefore(pill, bridge);
      else topbarActions.prepend(pill);
      el.topStatus = pill;
    }

    const rightStack = document.querySelector('.right-stack');
    if (!rightStack || document.getElementById('cloudSyncPanel')) return;

    const panel = document.createElement('section');
    panel.id = 'cloudSyncPanel';
    panel.className = 'panel cloud-sync-panel';
    panel.innerHTML = `
      <div class="panel-title-row">
        <div><div class="panel-kicker">NETWORK / SYNC</div><h2>Timer Sync</h2></div>
        <span id="cloudPanelPill" class="status-pill idle">Standalone</span>
      </div>
      <div class="cloud-mode-tabs" role="group" aria-label="Timer sync mode">
        <button id="cloudStandaloneBtn" type="button" class="active">Standalone</button>
        <button id="cloudLanBtn" type="button" disabled title="LAN host/client sync will be available in the installed desktop app">LAN · Desktop</button>
        <button id="cloudRemoteBtn" type="button">Remote · Internet</button>
      </div>
      <div id="cloudRemoteBody" class="cloud-sync-body hidden">
        <div class="cloud-status-row">
          <div class="cloud-status-main"><span id="cloudStatusDot" class="cloud-dot offline"></span><div class="cloud-status-text"><strong id="cloudStatusTitle">Remote offline</strong><span id="cloudStatusDetail">Not connected</span></div></div>
          <span id="cloudPeerCount" class="cloud-peer-count">0 devices</span>
        </div>
        <label class="cloud-field"><span>Viewer username</span><input id="cloudUsername" type="text" maxlength="64" autocomplete="username" spellcheck="false" placeholder="e.g. XeroRoad"></label>
        <label class="cloud-field"><span>Viewer password</span><div class="cloud-password-wrap"><input id="cloudPassword" type="password" maxlength="128" autocomplete="new-password" placeholder="e.g. Roadshow"><button id="cloudShowPassword" type="button">Show</button></div></label>
        <div class="cloud-action-row single"><button id="cloudStartHost" type="button" class="cloud-connect-btn">Start Remote Host</button></div>
        <div id="cloudShareCard" class="cloud-credentials-card hidden">
          <label class="cloud-field"><span>Viewer link</span><div class="cloud-copy-wrap"><input id="cloudViewerLink" type="text" readonly><button id="cloudCopyLink" type="button">Copy Link</button></div></label>
          <div class="cloud-action-row"><button id="cloudCopyLogin" type="button">Copy Login Details</button><button id="cloudDisconnect" type="button" class="cloud-disconnect-btn">Stop Hosting</button></div>
        </div>
        <p id="cloudModeHint" class="cloud-note">Viewers open <strong>relay.justincreative.tech</strong> and enter the same username/password. No long room code is needed.</p>
      </div>`;

    const companion = rightStack.querySelector('.companion-quick-panel');
    rightStack.insertBefore(panel, companion || rightStack.firstChild);

    el.panel = panel;
    el.panelPill = document.getElementById('cloudPanelPill');
    el.standalone = document.getElementById('cloudStandaloneBtn');
    el.remote = document.getElementById('cloudRemoteBtn');
    el.remoteBody = document.getElementById('cloudRemoteBody');
    el.username = document.getElementById('cloudUsername');
    el.password = document.getElementById('cloudPassword');
    el.showPassword = document.getElementById('cloudShowPassword');
    el.startHost = document.getElementById('cloudStartHost');
    el.shareCard = document.getElementById('cloudShareCard');
    el.viewerLink = document.getElementById('cloudViewerLink');
    el.copyLink = document.getElementById('cloudCopyLink');
    el.copyLogin = document.getElementById('cloudCopyLogin');
    el.disconnect = document.getElementById('cloudDisconnect');
    el.dot = document.getElementById('cloudStatusDot');
    el.statusTitle = document.getElementById('cloudStatusTitle');
    el.statusDetail = document.getElementById('cloudStatusDetail');
    el.peerCount = document.getElementById('cloudPeerCount');

    el.username.value = state.username;
    el.password.value = state.password;

    el.standalone.onclick = setStandalone;
    el.remote.onclick = () => { state.mode = 'remote'; render(); };
    el.startHost.onclick = startHost;
    el.disconnect.onclick = setStandalone;
    el.showPassword.onclick = () => {
      const show = el.password.type === 'password';
      el.password.type = show ? 'text' : 'password';
      el.showPassword.textContent = show ? 'Hide' : 'Show';
    };
    el.username.oninput = () => {
      state.username = el.username.value.trim().slice(0, 64);
      savePrefs();
      if (el.viewerLink) el.viewerLink.value = viewerLink();
    };
    el.password.oninput = () => {
      state.password = el.password.value.slice(0, 128);
      savePrefs();
    };
    el.copyLink.onclick = () => copyText(viewerLink(), el.copyLink, 'Copied');
    el.copyLogin.onclick = () => {
      const text = `AV Timer Viewer\n${viewerLink()}\nUsername: ${state.username}\nPassword: ${state.password}`;
      copyText(text, el.copyLogin, 'Copied');
    };

    render();
  }

  function statusClass() {
    if (state.socketState === 'online') return 'online';
    if (state.socketState === 'connecting' || state.socketState === 'reconnecting') return 'paused';
    return state.mode === 'standalone' ? 'idle' : 'offline';
  }

  function isConnected() {
    return state.socket && state.socket.readyState === WebSocket.OPEN && state.socketState === 'online';
  }

  function render() {
    if (!el.panel) return;
    const remoteMode = state.mode === 'remote';
    const connected = isConnected();
    const busy = ['connecting', 'reconnecting'].includes(state.socketState);
    const cls = statusClass();

    el.standalone.classList.toggle('active', !remoteMode);
    el.remote.classList.toggle('active', remoteMode);
    el.remoteBody.classList.toggle('hidden', !remoteMode);
    el.shareCard.classList.toggle('hidden', !remoteMode || (!connected && !busy));
    el.username.disabled = connected || busy;
    el.password.disabled = connected || busy;
    el.showPassword.disabled = connected || busy;
    el.startHost.disabled = connected || busy;
    el.startHost.textContent = connected ? 'Remote Host Running' : busy ? 'Connecting…' : 'Start Remote Host';
    el.viewerLink.value = viewerLink();

    let short = 'Standalone';
    let title = 'Remote offline';
    let detail = 'Enter a viewer login and start hosting';
    if (remoteMode) {
      if (state.socketState === 'online') {
        short = 'Remote Host';
        title = 'Remote host connected';
        detail = state.username ? `Login: ${state.username}` : 'Connected';
      } else if (state.socketState === 'connecting') {
        short = 'Connecting'; title = 'Connecting to relay'; detail = 'Opening secure WebSocket…';
      } else if (state.socketState === 'reconnecting') {
        short = 'Reconnecting'; title = 'Connection interrupted'; detail = 'Trying to reconnect automatically…';
      } else if (state.lastError) {
        short = 'Remote Offline'; title = 'Remote offline'; detail = state.lastError;
      }
    }

    if (el.topStatus) { el.topStatus.textContent = short; el.topStatus.className = `status-pill ${cls}`; }
    el.panelPill.textContent = short;
    el.panelPill.className = `status-pill ${cls}`;
    el.statusTitle.textContent = title;
    el.statusDetail.textContent = detail;
    el.dot.className = `cloud-dot ${state.socketState === 'online' ? 'online' : busy ? 'connecting' : 'offline'}`;
    el.peerCount.textContent = `${state.connections} device${state.connections === 1 ? '' : 's'}`;
  }

  async function startHost() {
    state.mode = 'remote';
    state.username = el.username.value.trim().slice(0, 64);
    state.password = el.password.value.slice(0, 128);
    savePrefs();
    state.lastError = '';
    render();

    try {
      const derived = await deriveCredentials(state.username, state.password);
      connectHost(derived.room, derived.token);
    } catch (err) {
      state.socketState = 'offline';
      state.lastError = err?.message || 'Could not create remote login.';
      render();
    }
  }

  function connectHost(room, token) {
    disconnect(false);
    state.mode = 'remote';
    state.room = room;
    state.token = token;
    state.manualClose = false;
    state.socketState = 'connecting';
    state.lastError = '';
    render();

    const url = new URL(ENDPOINT);
    url.searchParams.set('room', room);
    url.searchParams.set('role', 'host');
    url.searchParams.set('token', token);
    url.searchParams.set('name', state.username || 'Host');

    let socket;
    try { socket = new WebSocket(url.toString()); }
    catch (err) {
      state.socketState = 'offline';
      state.lastError = err?.message || 'Could not open WebSocket.';
      render();
      return;
    }

    state.socket = socket;
    socket.onopen = () => {
      if (state.socket !== socket) return;
      state.socketState = 'online';
      state.reconnectAttempt = 0;
      state.lastError = '';
      render();
      queueHostPayload(S.getCached(), true);
    };

    socket.onmessage = event => {
      if (state.socket !== socket) return;
      let packet;
      try { packet = JSON.parse(event.data); } catch { return; }
      handlePacket(packet);
    };

    socket.onerror = () => {
      if (state.socket !== socket) return;
      state.lastError = 'Relay connection error';
    };

    socket.onclose = event => {
      if (state.socket !== socket) return;
      state.socket = null;
      state.connections = 0;
      if (state.manualClose || state.mode !== 'remote') {
        state.socketState = 'offline';
        render();
        return;
      }
      if (event.code === 4001) {
        state.manualClose = true;
        state.socketState = 'offline';
        state.lastError = 'Another host signed in with the same username/password.';
        render();
        return;
      }
      scheduleReconnect();
    };
  }

  function disconnect(manual = true) {
    if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
    state.manualClose = manual;
    const socket = state.socket;
    state.socket = null;
    state.connections = 0;
    state.socketState = 'offline';
    if (socket) {
      try { socket.close(1000, 'Disconnected'); } catch {}
    }
    if (state.sendTimer) clearTimeout(state.sendTimer);
    state.sendTimer = null;
    state.pendingPayload = null;
    if (manual) state.lastError = '';
  }

  function setStandalone() {
    state.mode = 'standalone';
    disconnect(true);
    render();
  }

  function scheduleReconnect() {
    state.socketState = 'reconnecting';
    render();
    const delay = Math.min(RECONNECT_MAX_MS, 1000 * Math.pow(1.7, state.reconnectAttempt++));
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      if (state.mode === 'remote' && !state.manualClose && state.room && state.token) connectHost(state.room, state.token);
    }, delay);
  }

  function safeSend(packet) {
    if (!isConnected()) return false;
    try { state.socket.send(JSON.stringify(packet)); return true; } catch { return false; }
  }

  function handlePacket(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'welcome' || packet.type === 'presence') {
      state.connections = Math.max(0, Number(packet.connections || 1));
      render();
      if (packet.type === 'welcome') queueHostPayload(S.getCached(), true);
      return;
    }
    if (packet.type === 'error') {
      state.lastError = packet.message || packet.code || 'Relay error';
      render();
    }
  }

  function queueHostPayload(payload, immediate = false) {
    if (state.mode !== 'remote' || !payload) return;
    state.pendingPayload = payload;
    if (!isConnected()) return;
    if (state.sendTimer) return;
    const elapsed = Date.now() - state.lastSendAt;
    const wait = immediate ? 0 : Math.max(0, SEND_INTERVAL_MS - elapsed);
    state.sendTimer = setTimeout(flushHostPayload, wait);
  }

  function flushHostPayload() {
    state.sendTimer = null;
    if (!state.pendingPayload || !isConnected()) return;
    const payload = state.pendingPayload;
    state.pendingPayload = null;
    if (safeSend({ type: 'state', data: payload })) state.lastSendAt = Date.now();
    if (state.pendingPayload) queueHostPayload(state.pendingPayload);
  }

  async function copyText(text, button, doneLabel) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const old = button.textContent;
      button.textContent = doneLabel;
      setTimeout(() => { button.textContent = old; }, 1200);
    } catch {
      window.prompt('Copy this:', text);
    }
  }

  // Every meaningful timer/output change already flows through AVSync.
  S.onState(payload => {
    if (state.mode === 'remote') queueHostPayload(payload);
  }, false);

  window.addEventListener('online', () => {
    if (state.mode === 'remote' && !isConnected() && !state.manualClose && state.room && state.token) scheduleReconnect();
  });
  window.addEventListener('beforeunload', () => disconnect(true));

  loadPrefs();
  injectUI();

  window.AVCloudSync = {
    endpoint: ENDPOINT,
    startHost,
    disconnect: setStandalone,
    deriveCredentials,
    getState: () => ({
      mode: state.mode,
      username: state.username,
      status: state.socketState,
      connections: state.connections,
      connected: isConnected(),
      viewerLink: viewerLink(),
    }),
  };
})();
