(() => {
  const DEFAULT_PORT = 3210;
  const OFFLINE_GRACE_MS = 60000;
  const REQUEST_TIMEOUT_MS = 5000;
  const LONG_POLL_TIMEOUT_MS = 25000;
  const LONG_POLL_WAIT_MS = 20000;
  const STATE_SEND_INTERVAL_MS = 500;

  let port = normalizePort(localStorage.getItem('jcCompanionPort') || localStorage.getItem('jocCompanionPort') || DEFAULT_PORT);
  let base = `http://127.0.0.1:${port}`;
  let lastId = Number(sessionStorage.getItem('jcAvTimerRemoteLastId') || sessionStorage.getItem('jocAvTimerRemoteLastId') || 0);
  let initialized = false;
  let online = false;
  let stateTimer = null;
  let pendingState = null;
  let sendingState = false;
  let lastSuccessAt = 0;
  let loopGeneration = 0;
  let stateFlushTimer = null;
  let lastStateSendAt = 0;

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
      sessionStorage.setItem('jcAvTimerRemoteLastId', String(lastId));
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
        sessionStorage.setItem('jcAvTimerRemoteLastId', String(lastId));
      } catch {
        if (generation !== loopGeneration) return;
        markFailure();
        await sleep(750);
      }
    }
  }

  function scheduleStateFlush(delay = null) {
    if (stateFlushTimer) return;
    const elapsed = Date.now() - lastStateSendAt;
    const wait = delay === null ? Math.max(0, STATE_SEND_INTERVAL_MS - elapsed) : Math.max(0, delay);
    stateFlushTimer = setTimeout(() => {
      stateFlushTimer = null;
      flushState();
    }, wait);
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
      lastStateSendAt = Date.now();
      markSuccess();
    } catch {
      // Keep only the newest state. The next successful request will resync it.
      if (!pendingState) pendingState = state;
      markFailure();
    } finally {
      sendingState = false;
      if (pendingState) scheduleStateFlush();
    }
  }

  function start() {
    const generation = ++loopGeneration;
    pollForever(generation);
    if (!stateTimer) {
      scheduleStateFlush(0);
      stateTimer = setInterval(() => { if (pendingState) scheduleStateFlush(0); }, 1000);
    }
  }

  function restart() {
    ++loopGeneration;
    if (stateTimer) clearInterval(stateTimer);
    stateTimer = null;
    if (stateFlushTimer) clearTimeout(stateFlushTimer);
    stateFlushTimer = null;
    initialized = false;
    lastId = 0;
    lastSuccessAt = 0;
    sessionStorage.setItem('jcAvTimerRemoteLastId', '0');
    notify(false);
    start();
  }

  function getPort() { return port; }

  function setPort(value) {
    port = normalizePort(value);
    base = `http://127.0.0.1:${port}`;
    try { localStorage.setItem('jcCompanionPort', String(port)); } catch {}
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
    // Timer ticks can fire very frequently. Companion derives the live countdown
    // from the wall-clock anchor, so cap browser -> Companion state traffic.
    scheduleStateFlush();
  }

  window.addEventListener('focus', () => { bootstrap().catch(markFailure); flushState(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { bootstrap().catch(markFailure); flushState(); }
  });

  window.AVRemote = { start, restart, onCommand, onStatus, publishState, getPort, setPort, test };
})();
