(() => {
  const state = {
    duration: 0,
    remaining: 0,
    elapsed: 0,
    running: false,
    paused: false,
    countUp: false,
    finished: false,
    startedAt: 0,

    // Wall-clock anchors. These make the timer independent of setInterval
    // accuracy, browser focus and background-tab throttling.
    clockAnchorMs: 0,
    anchorRemaining: 0,
    anchorElapsed: 0,

    queue: [],
    queueActive: false,
    queueAwaitingNext: false,
    currentQueueDuration: null,
    interval: null
  };

  const listeners = new Set();

  function parseTime(value) {
    if (typeof value === 'number') return Math.max(0, Math.round(value));
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    if (/^\d+$/.test(raw)) {
      if (raw.length <= 2) return Number(raw);
      if (raw.length <= 4) return Number(raw.slice(0, -2)) * 60 + Number(raw.slice(-2));
      const s = raw.padStart(6, '0');
      return Number(s.slice(0, -4)) * 3600 + Number(s.slice(-4, -2)) * 60 + Number(s.slice(-2));
    }
    const parts = raw.split(':').map(Number);
    if (parts.some(Number.isNaN)) return 0;
    if (parts.length === 2) return Math.max(0, parts[0] * 60 + parts[1]);
    if (parts.length === 3) return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
    return 0;
  }

  function formatTime(seconds) {
    seconds = Math.max(0, Math.round(seconds || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function liveValues(now = Date.now()) {
    let remaining = Number(state.remaining || 0);
    let elapsed = Number(state.elapsed || 0);

    if (state.running && !state.paused && state.clockAnchorMs > 0) {
      const delta = Math.max(0, (now - state.clockAnchorMs) / 1000);
      if (state.countUp) elapsed = Math.max(0, Number(state.anchorElapsed || 0) + delta);
      else remaining = Math.max(0, Number(state.anchorRemaining || 0) - delta);
    }

    return { remaining, elapsed };
  }

  function snapshot(now = Date.now()) {
    const live = liveValues(now);
    return {
      ...state,
      remaining: live.remaining,
      elapsed: live.elapsed,
      queue: [...state.queue],
      interval: null
    };
  }

  function emit() {
    const snap = snapshot();
    listeners.forEach(fn => {
      try { fn(snap); } catch (err) { console.error('AVTimer listener error', err); }
    });
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function reanchor(now = Date.now()) {
    state.clockAnchorMs = now;
    state.anchorRemaining = Number(state.remaining || 0);
    state.anchorElapsed = Number(state.elapsed || 0);
  }

  function syncClock(now = Date.now()) {
    if (!state.running || state.paused) return false;
    const live = liveValues(now);
    state.remaining = live.remaining;
    state.elapsed = live.elapsed;
    if (!state.countUp && state.remaining <= 0) {
      state.remaining = 0;
      finish();
      return true;
    }
    return false;
  }

  function clearTicker() {
    if (state.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }
  }

  function startTicker() {
    clearTicker();
    state.interval = setInterval(tick, 100);
  }

  function tick() {
    if (!state.running || state.paused) return;
    if (syncClock()) return;
    emit();
  }

  function refresh() {
    if (state.running && !state.paused) {
      if (syncClock()) return;
    }
    emit();
  }

  function arm(seconds, opts = {}) {
    const target = Math.max(0, Number(seconds) || 0);
    clearTicker();
    state.duration = target;
    state.remaining = target;
    state.elapsed = 0;
    state.countUp = opts.countUp ?? state.countUp;
    state.running = false;
    state.paused = false;
    state.finished = false;
    state.startedAt = 0;
    reanchor();
    if (!opts.keepQueueState) {
      state.queueActive = false;
      state.queueAwaitingNext = false;
      state.currentQueueDuration = null;
    }
    emit();
    return target;
  }

  function start(seconds = null, opts = {}) {
    const countUp = opts.countUp ?? state.countUp;
    let target = seconds === null || seconds === undefined || seconds === ''
      ? Number(state.duration || state.remaining || 0)
      : Math.max(0, Number(seconds) || 0);

    if (!countUp && target <= 0) return false;
    if (countUp && target < 0) target = 0;

    state.duration = target;
    state.remaining = target;
    state.elapsed = 0;
    state.countUp = !!countUp;
    state.running = true;
    state.paused = !!opts.paused;
    state.finished = false;
    state.startedAt = Date.now();
    reanchor(state.startedAt);

    if (!opts.fromQueue) {
      state.queueActive = false;
      state.currentQueueDuration = null;
      state.queueAwaitingNext = false;
    }

    if (!state.paused) startTicker();
    else clearTicker();
    emit();
    return true;
  }

  function pause() {
    if (!state.running || state.paused) return false;
    syncClock();
    if (!state.running) return false; // may have reached TIME while syncing
    state.paused = true;
    reanchor();
    clearTicker();
    emit();
    return true;
  }

  function resume() {
    if (!state.running || !state.paused) return false;
    state.paused = false;
    reanchor();
    startTicker();
    emit();
    return true;
  }

  function togglePause() {
    if (!state.running) return false;
    return state.paused ? resume() : pause();
  }

  function reset() {
    if (!state.running && !state.finished && state.duration <= 0) return false;
    clearTicker();
    state.remaining = state.duration;
    state.elapsed = 0;
    state.finished = false;
    state.running = true;
    state.paused = false;
    state.startedAt = Date.now();
    reanchor(state.startedAt);
    startTicker();
    emit();
    return true;
  }

  function stop() {
    clearTicker();
    Object.assign(state, {
      duration: 0,
      remaining: 0,
      elapsed: 0,
      running: false,
      paused: false,
      finished: false,
      countUp: false,
      startedAt: 0,
      clockAnchorMs: 0,
      anchorRemaining: 0,
      anchorElapsed: 0,
      queueActive: false,
      queueAwaitingNext: false,
      currentQueueDuration: null
    });
    emit();
  }

  function finish() {
    clearTicker();
    state.remaining = 0;
    state.running = false;
    state.paused = false;
    state.finished = true;
    state.clockAnchorMs = 0;
    state.anchorRemaining = 0;
    state.anchorElapsed = state.elapsed;
    emit();

    if (state.queueActive) {
      state.currentQueueDuration = null;
      if (state.queue.length) {
        state.queueAwaitingNext = true;
        emit();
      } else {
        state.queueActive = false;
        state.queueAwaitingNext = false;
        emit();
      }
    }
  }

  function adjust(seconds) {
    seconds = Number(seconds) || 0;
    if (state.running && !state.paused) syncClock();

    if (state.countUp && state.running) {
      state.elapsed = Math.max(0, state.elapsed + seconds);
      reanchor();
      emit();
      return state.elapsed;
    }

    const basis = state.running || state.finished ? state.remaining : state.duration;
    const next = Math.max(0, basis + seconds);
    state.duration = Math.max(0, state.duration + seconds);
    if (!state.running && !state.finished) state.duration = next;
    state.remaining = next;
    state.elapsed = 0;

    if (state.finished && next > 0) {
      state.finished = false;
      state.running = true;
      state.paused = false;
      state.startedAt = Date.now();
      reanchor(state.startedAt);
      startTicker();
    } else {
      reanchor();
    }

    if (state.running && !state.countUp && state.remaining <= 0) {
      finish();
      return 0;
    }

    emit();
    return next;
  }

  function setTime(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    if (state.running && !state.paused) syncClock();
    state.duration = seconds;
    state.remaining = seconds;
    state.elapsed = 0;
    state.finished = false;
    reanchor();
    if (state.running && !state.paused) startTicker();
    emit();
    return true;
  }

  function queueAdd(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds) || 0));
    if (seconds) {
      state.queue.push(seconds);
      emit();
    }
  }

  function queueRemove(index) {
    if (index >= 0 && index < state.queue.length) {
      state.queue.splice(index, 1);
      emit();
    }
  }

  function queueRemoveLast() {
    if (state.queue.length) {
      state.queue.pop();
      emit();
    }
  }

  function queueClear() {
    state.queue = [];
    state.queueAwaitingNext = false;
    emit();
  }

  function queueStart() {
    if (!state.queue.length) return false;
    state.queueActive = true;
    state.queueAwaitingNext = false;
    queueNext();
    return true;
  }

  function queueNext() {
    if (!state.queue.length) {
      state.queueActive = false;
      state.queueAwaitingNext = false;
      emit();
      return false;
    }
    const next = state.queue.shift();
    state.currentQueueDuration = next;
    state.queueActive = true;
    state.queueAwaitingNext = false;
    start(next, { fromQueue: true, paused: false, countUp: false });
    return true;
  }

  // Resync immediately whenever a throttled/backgrounded page becomes active again.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);

  window.AVTimer = {
    state,
    onChange,
    parseTime,
    formatTime,
    snapshot,
    liveValues,
    refresh,
    arm,
    start,
    pause,
    resume,
    togglePause,
    reset,
    stop,
    adjust,
    setTime,
    queueAdd,
    queueRemove,
    queueRemoveLast,
    queueClear,
    queueStart,
    queueNext
  };
})();
