(() => {
  'use strict';

  const T = window.AVTimer;
  const S = window.AVSync;
  const R = window.AVRemote;
  if (!T || !S) return;

  const ENDPOINT = 'wss://relay.justincreative.tech/ws';
  const SETTINGS_KEY = 'jcAvTimerCloudSyncV1';
  const SESSION_KEY = 'jcAvTimerCloudInviteV1';
  const SEND_INTERVAL_MS = 300;
  const RECONNECT_MAX_MS = 10000;

  const state = {
    mode: 'standalone',
    role: 'host',
    name: 'FOH',
    room: '',
    token: '',
    invite: '',
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
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (saved) {
        state.role = saved.role === 'client' ? 'client' : 'host';
        state.name = String(saved.name || 'FOH').slice(0, 64);
      }
      const invite = sessionStorage.getItem(SESSION_KEY) || '';
      if (invite) state.invite = invite;
    } catch {}
  }

  function savePrefs() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ role: state.role, name: state.name }));
      if (state.invite) sessionStorage.setItem(SESSION_KEY, state.invite);
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {}
  }

  function randomChars(length) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
  }

  function randomToken() {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function makeInvite(room, token) {
    return `${room}~${token}`;
  }

  function parseInvite(value) {
    const raw = String(value || '').trim();
    const split = raw.indexOf('~');
    if (split <= 0) return null;
    const room = raw.slice(0, split).trim().toUpperCase();
    const token = raw.slice(split + 1).trim();
    if (!/^[A-Z0-9][A-Z0-9_-]{3,63}$/.test(room)) return null;
    if (token.length < 16 || token.length > 256) return null;
    return { room, token };
  }

  function injectStyles() {
    if (document.getElementById('cloudSyncStyles')) return;
    const style = document.createElement('style');
    style.id = 'cloudSyncStyles';
    style.textContent = `
      .cloud-sync-panel .panel-title-row{align-items:flex-start}
      .cloud-mode-tabs,.cloud-role-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
      .cloud-role-tabs{grid-template-columns:1fr 1fr}
      .cloud-mode-tabs button,.cloud-role-tabs button{min-width:0;padding:8px 6px;font-size:.7rem;font-weight:850}
      .cloud-mode-tabs button.active,.cloud-role-tabs button.active{background:#164b70;border-color:#4bb7ff;color:#fff;box-shadow:inset 0 0 0 1px rgba(75,183,255,.24)}
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
      .cloud-invite-wrap{display:grid;grid-template-columns:1fr auto;gap:6px}.cloud-invite-wrap input{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.7rem}
      .cloud-action-row{display:grid;grid-template-columns:1fr 1fr;gap:7px}.cloud-action-row.single{grid-template-columns:1fr}
      .cloud-connect-btn{background:#1478b8;border-color:#2498dc;font-weight:850}.cloud-create-btn{background:#138a4e;border-color:#22c55e;font-weight:850}.cloud-disconnect-btn{background:#53262c;border-color:#8a3942}
      .cloud-note{font-size:.7rem;line-height:1.4;color:var(--muted);margin:0}
      .cloud-client-banner{position:sticky;top:72px;z-index:35;margin:0 12px 0;padding:8px 12px;border:1px solid rgba(75,183,255,.32);border-top:0;border-radius:0 0 10px 10px;background:rgba(10,39,62,.96);color:#c9eaff;font-size:.73rem;font-weight:750;text-align:center;backdrop-filter:blur(10px)}
      .cloud-client-locked{opacity:.58;filter:saturate(.75)}
      .cloud-client-locked .panel-title-row::after{content:'REMOTE CLIENT';font-size:.58rem;font-weight:900;letter-spacing:.1em;color:#69c4ff;border:1px solid rgba(75,183,255,.28);padding:4px 6px;border-radius:999px}
      @media(max-width:520px){.cloud-mode-tabs{grid-template-columns:1fr}.cloud-action-row{grid-template-columns:1fr}.cloud-invite-wrap{grid-template-columns:1fr}.cloud-client-banner{top:0;margin:0}}
    `;
    document.head.appendChild(style);
  }

  function patchHelpCopy() {
    const sections = Array.from(document.querySelectorAll('.help-section'));
    sections.forEach(section => {
      section.querySelectorAll('p,li').forEach(node => {
        if (node.innerHTML.includes('The webpage can still come directly from GitHub.')) {
          node.innerHTML = node.innerHTML.replace('The webpage can still come directly from GitHub.', 'Use <b>timer.justincreative.tech</b> for the normal online version.');
        }
        if (node.innerHTML.includes('The GitHub page is the normal online version.')) {
          node.innerHTML = node.innerHTML.replace('The GitHub page is the normal online version.', '<b>timer.justincreative.tech</b> is the normal online version.');
        }
      });
    });

    const helpScroll = document.querySelector('.help-scroll');
    if (helpScroll && !document.getElementById('cloudSyncHelpSection')) {
      const remoteHelp = document.createElement('section');
      remoteHelp.id = 'cloudSyncHelpSection';
      remoteHelp.className = 'help-section';
      remoteHelp.innerHTML = `
        <h3>Remote Timer Sync</h3>
        <p>Open <b>Timer Sync</b> on the operator page and choose <b>Remote · Internet</b>. On the controlling timer choose <b>Host</b> and create a room, then copy the invite code.</p>
        <p>On the other timer choose <b>Client</b>, paste the invite code, and join. The client follows the host and its timer-editing controls are locked while connected.</p>
        <p>Remote sync uses <b>relay.justincreative.tech</b>. Standalone mode and local output do not require the relay. LAN sync is reserved for the installed desktop app.</p>`;
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
        <div class="cloud-role-tabs" role="group" aria-label="Remote role">
          <button id="cloudHostRole" type="button" class="active">Host</button>
          <button id="cloudClientRole" type="button">Client</button>
        </div>
        <label class="cloud-field"><span>Display name</span><input id="cloudDisplayName" type="text" maxlength="64" autocomplete="off" value="FOH"></label>
        <div id="cloudHostControls">
          <div class="cloud-action-row single"><button id="cloudCreateRoom" type="button" class="cloud-create-btn">Create Remote Room</button></div>
          <label class="cloud-field" style="margin-top:8px"><span>Invite code</span><div class="cloud-invite-wrap"><input id="cloudHostInvite" type="text" readonly placeholder="Create a room first"><button id="cloudCopyInvite" type="button">Copy</button></div></label>
          <p class="cloud-note">Share the invite code with the other timer. The host is authoritative and publishes the live timer state.</p>
        </div>
        <div id="cloudClientControls" class="hidden">
          <label class="cloud-field"><span>Invite code</span><input id="cloudClientInvite" type="text" autocomplete="off" spellcheck="false" placeholder="SHOW-ABC123~…"></label>
          <div class="cloud-action-row single" style="margin-top:8px"><button id="cloudJoinRoom" type="button" class="cloud-connect-btn">Join Remote Room</button></div>
          <p class="cloud-note">Client mode follows the host. Timer editing controls are locked while connected.</p>
        </div>
        <div class="cloud-action-row single"><button id="cloudDisconnect" type="button" class="cloud-disconnect-btn hidden">Disconnect</button></div>
        <p id="cloudModeHint" class="cloud-note">Remote uses relay.justincreative.tech and requires internet. Standalone and local output still work without it.</p>
      </div>
    `;

    const companion = rightStack.querySelector('.companion-quick-panel');
    rightStack.insertBefore(panel, companion || rightStack.firstChild);

    el.panel = panel;
    el.panelPill = document.getElementById('cloudPanelPill');
    el.standalone = document.getElementById('cloudStandaloneBtn');
    el.remote = document.getElementById('cloudRemoteBtn');
    el.remoteBody = document.getElementById('cloudRemoteBody');
    el.hostRole = document.getElementById('cloudHostRole');
    el.clientRole = document.getElementById('cloudClientRole');
    el.name = document.getElementById('cloudDisplayName');
    el.hostControls = document.getElementById('cloudHostControls');
    el.clientControls = document.getElementById('cloudClientControls');
    el.hostInvite = document.getElementById('cloudHostInvite');
    el.clientInvite = document.getElementById('cloudClientInvite');
    el.create = document.getElementById('cloudCreateRoom');
    el.join = document.getElementById('cloudJoinRoom');
    el.copy = document.getElementById('cloudCopyInvite');
    el.disconnect = document.getElementById('cloudDisconnect');
    el.dot = document.getElementById('cloudStatusDot');
    el.statusTitle = document.getElementById('cloudStatusTitle');
    el.statusDetail = document.getElementById('cloudStatusDetail');
    el.peerCount = document.getElementById('cloudPeerCount');
    el.hint = document.getElementById('cloudModeHint');

    el.name.value = state.name;
    if (state.invite) {
      el.hostInvite.value = state.invite;
      el.clientInvite.value = state.invite;
    }

    el.standalone.onclick = setStandalone;
    el.remote.onclick = () => setMode('remote');
    el.hostRole.onclick = () => setRole('host');
    el.clientRole.onclick = () => setRole('client');
    el.name.oninput = () => { state.name = el.name.value.trim().slice(0, 64) || (state.role === 'host' ? 'Host' : 'Client'); savePrefs(); };
    el.create.onclick = createRoom;
    el.join.onclick = joinRoom;
    el.disconnect.onclick = setStandalone;
    el.copy.onclick = copyInvite;

    setRole(state.role, false);
    render();
  }

  function setMode(mode) {
    state.mode = mode === 'remote' ? 'remote' : 'standalone';
    if (state.mode === 'standalone') disconnect(true);
    render();
  }

  function setRole(role, renderNow = true) {
    if (isConnected() || state.socketState === 'connecting') disconnect(true);
    state.role = role === 'client' ? 'client' : 'host';
    savePrefs();
    if (renderNow) render();
  }

  function setStandalone() {
    state.mode = 'standalone';
    disconnect(true);
    setClientLock(false);
    render();
  }

  function statusClass() {
    if (state.socketState === 'online') return 'online';
    if (state.socketState === 'connecting' || state.socketState === 'reconnecting') return 'paused';
    return state.mode === 'standalone' ? 'idle' : 'offline';
  }

  function render() {
    if (!el.panel) return;
    const remoteMode = state.mode === 'remote';
    const connected = isConnected();
    const cls = statusClass();

    el.standalone.classList.toggle('active', !remoteMode);
    el.remote.classList.toggle('active', remoteMode);
    el.remoteBody.classList.toggle('hidden', !remoteMode);
    el.hostRole.classList.toggle('active', state.role === 'host');
    el.clientRole.classList.toggle('active', state.role === 'client');
    el.hostControls.classList.toggle('hidden', state.role !== 'host');
    el.clientControls.classList.toggle('hidden', state.role !== 'client');
    el.disconnect.classList.toggle('hidden', !remoteMode || (!connected && state.socketState === 'offline'));

    let short = 'Standalone';
    let title = 'Remote offline';
    let detail = 'Not connected';
    if (remoteMode) {
      if (state.socketState === 'online') {
        short = state.role === 'host' ? 'Remote Host' : 'Remote Client';
        title = state.role === 'host' ? 'Remote host connected' : 'Following remote host';
        detail = state.room ? `Room ${state.room}` : 'Connected';
      } else if (state.socketState === 'connecting') {
        short = 'Connecting'; title = 'Connecting to relay'; detail = 'Opening secure WebSocket…';
      } else if (state.socketState === 'reconnecting') {
        short = 'Reconnecting'; title = 'Connection interrupted'; detail = 'Trying to reconnect automatically…';
      } else {
        short = 'Remote Offline'; title = 'Remote offline'; detail = state.lastError || 'Create or join a room';
      }
    }

    if (el.topStatus) { el.topStatus.textContent = short; el.topStatus.className = `status-pill ${cls}`; }
    el.panelPill.textContent = short;
    el.panelPill.className = `status-pill ${cls}`;
    el.statusTitle.textContent = title;
    el.statusDetail.textContent = detail;
    el.dot.className = `cloud-dot ${state.socketState === 'online' ? 'online' : (state.socketState === 'connecting' || state.socketState === 'reconnecting') ? 'connecting' : 'offline'}`;
    el.peerCount.textContent = `${state.connections} device${state.connections === 1 ? '' : 's'}`;

    if (state.invite) {
      el.hostInvite.value = state.invite;
      if (!el.clientInvite.value) el.clientInvite.value = state.invite;
    }

    setClientLock(remoteMode && state.role === 'client' && connected);
  }

  function isConnected() {
    return state.socket && state.socket.readyState === WebSocket.OPEN && state.socketState === 'online';
  }

  function connect(role, room, token, name) {
    disconnect(false);
    state.mode = 'remote';
    state.role = role === 'client' ? 'client' : 'host';
    state.room = room;
    state.token = token;
    state.name = String(name || (state.role === 'host' ? 'Host' : 'Client')).trim().slice(0, 64) || (state.role === 'host' ? 'Host' : 'Client');
    state.invite = makeInvite(room, token);
    state.manualClose = false;
    state.lastError = '';
    state.socketState = 'connecting';
    savePrefs();
    render();

    const url = new URL(ENDPOINT);
    url.searchParams.set('room', state.room);
    url.searchParams.set('role', state.role);
    url.searchParams.set('token', state.token);
    url.searchParams.set('name', state.name);

    let socket;
    try { socket = new WebSocket(url.toString()); }
    catch (err) {
      state.lastError = err?.message || 'Could not open WebSocket';
      state.socketState = 'offline';
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
      if (state.role === 'host') {
        queueHostPayload(S.getCached(), true);
      } else {
        // A client is a follower. Stop any local timer that may have been running
        // before the join so it cannot fight the incoming host state.
        try { T.stop(); } catch {}
        safeSend({ type: 'request_state' });
      }
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
      if (event.code === 4001 && state.role === 'host') {
        state.manualClose = true;
        state.socketState = 'offline';
        state.lastError = 'This host was replaced by another host connection.';
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
    setClientLock(false);
  }

  function scheduleReconnect() {
    state.socketState = 'reconnecting';
    render();
    const delay = Math.min(RECONNECT_MAX_MS, 1000 * Math.pow(1.7, state.reconnectAttempt++));
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      if (state.mode === 'remote' && !state.manualClose && state.room && state.token) {
        connect(state.role, state.room, state.token, state.name);
      }
    }, delay);
  }

  function safeSend(packet) {
    if (!isConnected()) return false;
    try { state.socket.send(JSON.stringify(packet)); return true; } catch { return false; }
  }

  function handlePacket(packet) {
    if (!packet || typeof packet !== 'object') return;
    if (packet.type === 'welcome') {
      state.connections = Number(packet.connections || 1);
      render();
      if (state.role === 'host') queueHostPayload(S.getCached(), true);
      return;
    }
    if (packet.type === 'presence') {
      state.connections = Math.max(0, Number(packet.connections || 0));
      render();
      return;
    }
    if (packet.type === 'state' && state.role === 'client' && packet.data) {
      applyRemotePayload(packet.data);
      return;
    }
    if (packet.type === 'error') {
      state.lastError = packet.message || packet.code || 'Relay error';
      render();
    }
  }

  function queueHostPayload(payload, immediate = false) {
    if (state.mode !== 'remote' || state.role !== 'host' || !payload) return;
    state.pendingPayload = payload;
    if (!isConnected()) return;
    if (state.sendTimer) return;
    const elapsed = Date.now() - state.lastSendAt;
    const wait = immediate ? 0 : Math.max(0, SEND_INTERVAL_MS - elapsed);
    state.sendTimer = setTimeout(flushHostPayload, wait);
  }

  function flushHostPayload() {
    state.sendTimer = null;
    if (!state.pendingPayload || !isConnected() || state.role !== 'host') return;
    const payload = state.pendingPayload;
    state.pendingPayload = null;
    if (safeSend({ type: 'state', data: payload })) state.lastSendAt = Date.now();
    if (state.pendingPayload) queueHostPayload(state.pendingPayload);
  }

  function createRoom() {
    state.name = el.name.value.trim().slice(0, 64) || 'Host';
    const room = `SHOW-${randomChars(6)}`;
    const token = randomToken();
    state.invite = makeInvite(room, token);
    el.hostInvite.value = state.invite;
    el.clientInvite.value = state.invite;
    connect('host', room, token, state.name);
  }

  function joinRoom() {
    state.name = el.name.value.trim().slice(0, 64) || 'Client';
    const parsed = parseInvite(el.clientInvite.value);
    if (!parsed) {
      state.lastError = 'Invalid invite code. Paste the full code from the host.';
      state.mode = 'remote';
      state.role = 'client';
      state.socketState = 'offline';
      render();
      return;
    }
    state.invite = makeInvite(parsed.room, parsed.token);
    connect('client', parsed.room, parsed.token, state.name);
  }

  async function copyInvite() {
    if (!state.invite) return;
    try {
      await navigator.clipboard.writeText(state.invite);
      const old = el.copy.textContent;
      el.copy.textContent = 'Copied';
      setTimeout(() => { el.copy.textContent = old; }, 1200);
    } catch {
      el.hostInvite.focus();
      el.hostInvite.select();
    }
  }

  function applyRemotePayload(payload) {
    if (!payload || !payload.state) return;

    // Push the exact host payload to preview/output windows on this client.
    S.publish(payload);

    // Keep the local Companion module's variables/state useful on a remote client.
    try { R?.publishState?.({ ...payload.state, display: payload.display, updatedAt: Date.now() }); } catch {}

    const p = payload.state;
    const display = payload.display || {};
    const timer = document.getElementById('operatorTimer');
    const opState = document.getElementById('operatorStateText');
    const runStatus = document.getElementById('runStatus');
    const warning = document.getElementById('operatorWarning');
    const input = document.getElementById('timeInput');

    if (timer) {
      timer.textContent = p.displayTime || p.formatted || '00:00';
      timer.style.color = p.warningActive ? (p.warningColor || '') : '';
    }
    if (opState) opState.textContent = p.status || 'REMOTE';
    if (runStatus) {
      const statusClass = p.finished ? 'finished' : p.paused ? 'paused' : p.running ? 'running' : 'idle';
      runStatus.textContent = p.status || 'REMOTE';
      runStatus.className = `status-pill ${statusClass}`;
    }
    if (warning) {
      warning.textContent = p.warningLabel || '';
      warning.style.setProperty('--warning-chip', p.warningColor || '#ff3030');
      warning.classList.toggle('hidden', !p.warningActive || !p.warningLabel);
    }
    if (input && document.activeElement !== input) input.value = p.duration > 0 ? T.formatTime(p.duration) : '';

    const mapValue = [
      ['bgColor', display.bg], ['fgColor', display.fg], ['accentColor', display.progress], ['timeColor', display.timeColor]
    ];
    mapValue.forEach(([id, value]) => { const node = document.getElementById(id); if (node && value) node.value = value; });
    const size = document.getElementById('timerSizeSlider');
    if (size && display.scale) size.value = Math.round(Number(display.scale) * 100);
    const setCheck = (id, value) => { const node = document.getElementById(id); if (node) node.checked = !!value; };
    setCheck('countUpToggle', p.countUp);
    setCheck('autostartToggle', p.autostart);
    setCheck('showProgressCheckbox', p.progressEnabled);
    setCheck('gradientToggle', p.gradientEnabled);
    setCheck('warningsToggle', p.warningsEnabled);
    setCheck('queueToggle', p.queueEnabled);
    setCheck('autoNextToggle', p.autoNext);
  }

  let lockedControls = [];
  function setClientLock(lock) {
    const shouldLock = !!lock;
    document.body.classList.toggle('cloud-client-active', shouldLock);
    const bannerId = 'cloudClientBanner';
    let banner = document.getElementById(bannerId);

    if (shouldLock) {
      if (!banner) {
        banner = document.createElement('div');
        banner.id = bannerId;
        banner.className = 'cloud-client-banner';
        banner.textContent = 'REMOTE CLIENT · Following host · Timer controls are locked on this device';
        const topbar = document.querySelector('.topbar');
        topbar?.insertAdjacentElement('afterend', banner);
      }
      if (!lockedControls.length) {
        const controls = document.querySelectorAll('.left-stack button,.left-stack input,.left-stack select,.center-stack button,.center-stack input,.center-stack select');
        lockedControls = Array.from(controls).map(node => ({ node, disabled: !!node.disabled }));
        lockedControls.forEach(({ node }) => { node.disabled = true; });
        document.querySelectorAll('.left-stack .panel,.center-stack .panel').forEach(p => p.classList.add('cloud-client-locked'));
      }
    } else {
      banner?.remove();
      lockedControls.forEach(({ node, disabled }) => { if (node?.isConnected) node.disabled = disabled; });
      lockedControls = [];
      document.querySelectorAll('.cloud-client-locked').forEach(p => p.classList.remove('cloud-client-locked'));
    }
  }

  // Block timer keyboard shortcuts while this page is a remote client.
  window.addEventListener('keydown', event => {
    if (!(state.mode === 'remote' && state.role === 'client' && isConnected())) return;
    if (el.panel?.contains(event.target)) return;
    const key = String(event.key || '').toLowerCase();
    if (['enter', ' ', 'r', 'escape'].includes(key)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  // The existing app already publishes every meaningful timer/settings change
  // to AVSync. Use that as the single source of truth for cloud sync too.
  S.onState(payload => {
    if (state.mode === 'remote' && state.role === 'host') queueHostPayload(payload);
  }, false);

  window.addEventListener('online', () => {
    if (state.mode === 'remote' && !isConnected() && !state.manualClose && state.room && state.token) scheduleReconnect();
  });

  window.addEventListener('beforeunload', () => disconnect(true));

  loadPrefs();
  injectUI();

  // Public API for diagnostics / future desktop app integration.
  window.AVCloudSync = {
    endpoint: ENDPOINT,
    createRoom,
    joinRoom,
    disconnect: setStandalone,
    connect,
    parseInvite,
    getState: () => ({
      mode: state.mode,
      role: state.role,
      room: state.room,
      name: state.name,
      status: state.socketState,
      connections: state.connections,
      connected: isConnected(),
    }),
  };
})();
