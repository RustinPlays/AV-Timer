(() => {
  const CHANNEL_NAME = 'av-timer-live-v3';
  const STORAGE_KEY = 'avTimerLiveStateV3';
  const SOURCE = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const listeners = new Set();
  const requestListeners = new Set();
  const peers = new Set();
  let channel = null;

  try { channel = new BroadcastChannel(CHANNEL_NAME); } catch {}

  function safeParse(raw) {
    try { return JSON.parse(raw); } catch { return null; }
  }

  function cache(payload) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
  }

  function getCached() {
    try { return safeParse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }

  function notify(payload) {
    listeners.forEach(fn => {
      try { fn(payload); } catch (err) { console.error('AVSync listener error', err); }
    });
  }

  function sendPeer(target, message) {
    try { target?.postMessage?.(message, '*'); return true; } catch { return false; }
  }

  function publish(payload) {
    const envelope = { type: 'state', source: SOURCE, sentAt: Date.now(), payload };
    cache(payload);
    if (channel) channel.postMessage(envelope);
    for (const peer of [...peers]) {
      if (!sendPeer(peer, { type: 'av-timer-state', source: SOURCE, payload })) peers.delete(peer);
    }
    notify(payload);
  }

  function requestState() {
    if (channel) channel.postMessage({ type: 'request-state', source: SOURCE, sentAt: Date.now() });
    if (window.opener && !window.opener.closed) {
      sendPeer(window.opener, { type: 'av-timer-request-state', source: SOURCE });
      sendPeer(window.opener, { type: 'av-timer-subscribe', source: SOURCE });
    }
    if (window.parent && window.parent !== window) {
      sendPeer(window.parent, { type: 'av-timer-request-state', source: SOURCE });
      sendPeer(window.parent, { type: 'av-timer-subscribe', source: SOURCE });
    }
  }

  function onState(fn, immediate = true) {
    listeners.add(fn);
    if (immediate) {
      const cached = getCached();
      if (cached) fn(cached);
    }
    return () => listeners.delete(fn);
  }

  function onStateRequest(fn) {
    requestListeners.add(fn);
    return () => requestListeners.delete(fn);
  }

  if (channel) {
    channel.onmessage = event => {
      const msg = event.data || {};
      if (msg.source === SOURCE) return;
      if (msg.type === 'state' && msg.payload) {
        cache(msg.payload);
        notify(msg.payload);
      } else if (msg.type === 'request-state') {
        requestListeners.forEach(fn => {
          try { fn(); } catch (err) { console.error('AVSync request error', err); }
        });
      }
    };
  }

  // postMessage fallback keeps the PiP and external output synced even when the
  // offline portable app is opened from file:// and BroadcastChannel storage is restricted.
  window.addEventListener('message', event => {
    const msg = event.data || {};
    if (msg.source === SOURCE) return;
    if (msg.type === 'av-timer-subscribe') {
      if (event.source) peers.add(event.source);
      const cached = getCached();
      if (cached && event.source) sendPeer(event.source, { type: 'av-timer-state', source: SOURCE, payload: cached });
    } else if (msg.type === 'av-timer-request-state') {
      if (event.source) peers.add(event.source);
      requestListeners.forEach(fn => {
        try { fn(); } catch (err) { console.error('AVSync request error', err); }
      });
    } else if (msg.type === 'av-timer-state' && msg.payload) {
      cache(msg.payload);
      notify(msg.payload);
    }
  });

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY && event.newValue) {
      const payload = safeParse(event.newValue);
      if (payload) notify(payload);
    }
  });

  // Subscribe immediately if this is an output/preview child window.
  setTimeout(requestState, 0);

  window.AVSync = { publish, onState, requestState, onStateRequest, getCached };
})();
