(() => {
  const DEFAULT_PORT = 3210;
  const OFFLINE_GRACE_MS = 15000;
  const REQUEST_TIMEOUT_MS = 5000;
  const LONG_POLL_TIMEOUT_MS = 25000;
  const LONG_POLL_WAIT_MS = 20000;

  let port = normalizePort(localStorage.getItem('jocCompanionPort') || DEFAULT_PORT);
  let base = `http://127.0.0.1:${port}`;
  let lastId = Number(sessionStorage.getItem('jocAvTimerRemoteLastId') || 0);
  let initialized = false;
  let online = false;
  let stateTimer = null;
  let pendingState = null;
  let sendingState = false;
  let lastSuccessAt = 0;
  let loopGeneration = 0;

  const listeners = new Set();
  const statusListeners = new Set();

  function normalizePort(value) {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 && n <= 65535 ? n : DEFAULT_PORT;
  }

  function requestOptions(extra = {}) {
    return { cache: 'no-store', targetAddressSpace: 'loopback', ...extra };
  }

  async function fetchTimed(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function notify(value) {
    value = !!value;
    if (value === online) return;
    online = value;
    statusListeners.forEach(fn => { try { fn(value); } catch {} });
  }

  function markSuccess() {
    lastSuccessAt = Date.now();
    notify(true);
  }

  function markFailure() {
    if (!lastSuccessAt || Date.now() - lastSuccessAt > OFFLINE_GRACE_MS) {
      notify(false);
      initialized = false;
    }
  }

  async function bootstrap() {
    const r = await fetchTimed(`${base}/api/status`, requestOptions());
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (!initialized) {
      if (!lastId) lastId = Number(data.latestId || 0);
      initialized = true;
      sessionStorage.setItem('jocAvTimerRemoteLastId', String(lastId));
    }
    markSuccess();
    return data;
  }

  async function pollForever(generation) {
    while (generation === loopGeneration) {
      try {
        if (!initialized) await bootstrap();
        const r = await fetchTimed(
          `${base}/api/events?since=${lastId}&wait=${LONG_POLL_WAIT_MS}`,
          requestOptions(),
          LONG_POLL_TIMEOUT_MS
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (generation !== loopGeneration) return;
        markSuccess();
        for (const evt of data.events || []) {
          lastId = Math.max(lastId, Number(evt.id || 0));
          listeners.forEach(fn => {
            try { fn(evt); } catch (err) { console.error('Companion command error', err); }
          });
        }
        sessionStorage.setItem('jocAvTimerRemoteLastId', String(lastId));
      } catch {
        if (generation !== loopGeneration) return;
        markFailure();
        await sleep(750);
      }
    }
  }

  async function flushState() {
    if (sendingState || !pendingState) return;
    const state = pendingState;
    pendingState = null;
    sendingState = true;
    try {
      const r = await fetchTimed(`${base}/api/state`, requestOptions({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(state),
        keepalive: true
      }));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      markSuccess();
    } catch {
      // Keep only the newest state. The next successful request will resync it.
      if (!pendingState) pendingState = state;
      markFailure();
    } finally {
      sendingState = false;
    }
  }

  function start() {
    const generation = ++loopGeneration;
    pollForever(generation);
    if (!stateTimer) {
      flushState();
      stateTimer = setInterval(flushState, 750);
    }
  }

  function restart() {
    ++loopGeneration;
    if (stateTimer) clearInterval(stateTimer);
    stateTimer = null;
    initialized = false;
    lastId = 0;
    lastSuccessAt = 0;
    sessionStorage.setItem('jocAvTimerRemoteLastId', '0');
    notify(false);
    start();
  }

  function getPort() { return port; }

  function setPort(value) {
    port = normalizePort(value);
    base = `http://127.0.0.1:${port}`;
    try { localStorage.setItem('jocCompanionPort', String(port)); } catch {}
    restart();
    return port;
  }

  async function test() {
    const data = await bootstrap();
    await flushState();
    return data;
  }

  function onCommand(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function onStatus(fn) { statusListeners.add(fn); fn(online); return () => statusListeners.delete(fn); }

  function publishState(state) {
    pendingState = state;
    // Send important state changes immediately; the timer's wall-clock anchors
    // mean Companion does not need a browser POST every second to keep counting.
    flushState();
  }

  window.addEventListener('focus', () => { bootstrap().catch(markFailure); flushState(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { bootstrap().catch(markFailure); flushState(); }
  });

  window.AVRemote = { start, restart, onCommand, onStatus, publishState, getPort, setPort, test };
})();
