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
    clockAnchorMs: 0,
    anchorRemaining: 0,
    anchorElapsed: 0,
    queue: [],
    queueActive: false,
    currentQueueId: null,
    currentQueueIndex: -1,
    interval: null
  };

  const listeners = new Set();
  const uid = () => crypto?.randomUUID?.() || `cue-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function parseTime(value) {
    if (typeof value === 'number') return Math.max(0, Math.round(value));
    let raw = String(value ?? '').trim();
    if (!raw) return 0;
    raw = raw.replace(/\./g, ':');
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
    let total = Math.round(Number(seconds) || 0);
    const negative = total < 0;
    total = Math.abs(total);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const body = h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return negative ? `-${body}` : body;
  }

  function liveValues(now = Date.now()) {
    let remaining = Number(state.remaining || 0);
    let elapsed = Number(state.elapsed || 0);
    if (state.running && !state.paused && state.clockAnchorMs > 0) {
      const delta = Math.max(0, (now - state.clockAnchorMs) / 1000);
      if (state.countUp) elapsed = Math.max(0, Number(state.anchorElapsed || 0) + delta);
      else remaining = Number(state.anchorRemaining || 0) - delta;
    }
    return { remaining, elapsed };
  }

  function snapshot(now = Date.now()) {
    const live = liveValues(now);
    return { ...state, remaining: live.remaining, elapsed: live.elapsed, queue: state.queue.map(c => ({...c})), interval: null };
  }

  function emit() {
    const snap = snapshot();
    listeners.forEach(fn => { try { fn(snap); } catch (err) { console.error('AVTimer listener error', err); } });
  }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  function reanchor(now = Date.now()) {
    state.clockAnchorMs = now;
    state.anchorRemaining = Number(state.remaining || 0);
    state.anchorElapsed = Number(state.elapsed || 0);
  }
  function syncClock(now = Date.now()) {
    if (!state.running || state.paused) return;
    const live = liveValues(now);
    state.remaining = live.remaining;
    state.elapsed = live.elapsed;
    state.finished = !state.countUp && state.remaining <= 0;
  }
  function clearTicker() { if (state.interval) { clearInterval(state.interval); state.interval = null; } }
  function startTicker() { clearTicker(); state.interval = setInterval(tick, 100); }
  function tick() { if (!state.running || state.paused) return; syncClock(); emit(); }
  function refresh() { if (state.running && !state.paused) syncClock(); emit(); }

  function arm(seconds, opts = {}) {
    const target = Math.max(0, Number(seconds) || 0);
    clearTicker();
    Object.assign(state, {
      duration: target, remaining: target, elapsed: 0,
      countUp: opts.countUp ?? state.countUp,
      running: false, paused: false, finished: false, startedAt: 0
    });
    reanchor();
    if (!opts.keepQueueState) { state.queueActive = false; state.currentQueueId = null; state.currentQueueIndex = -1; }
    emit();
    return target;
  }

  function start(seconds = null, opts = {}) {
    const countUp = opts.countUp ?? state.countUp;
    let target = seconds === null || seconds === undefined || seconds === '' ? Number(state.duration || 0) : Math.max(0, Number(seconds) || 0);
    if (!countUp && target <= 0) return false;
    if (countUp && target < 0) target = 0;
    Object.assign(state, {
      duration: target, remaining: target, elapsed: 0, countUp: !!countUp,
      running: true, paused: !!opts.paused, finished: false, startedAt: Date.now()
    });
    reanchor(state.startedAt);
    if (!opts.fromQueue) { state.queueActive = false; state.currentQueueId = null; state.currentQueueIndex = -1; }
    if (state.paused) clearTicker(); else startTicker();
    emit();
    return true;
  }

  function pause() {
    if (!state.running || state.paused) return false;
    syncClock(); state.paused = true; reanchor(); clearTicker(); emit(); return true;
  }
  function resume() {
    if (!state.running || !state.paused) return false;
    state.paused = false; reanchor(); startTicker(); emit(); return true;
  }
  function togglePause() { if (!state.running) return false; return state.paused ? resume() : pause(); }
  function startPause(seconds = null, opts = {}) {
    if (!state.running) return start(seconds, opts);
    return togglePause();
  }
  function reset() {
    if (state.duration <= 0) return false;
    clearTicker();
    state.remaining = state.duration; state.elapsed = 0; state.finished = false; state.running = true; state.paused = false; state.startedAt = Date.now();
    reanchor(state.startedAt); startTicker(); emit(); return true;
  }
  function stop() {
    clearTicker();
    Object.assign(state, { duration:0, remaining:0, elapsed:0, running:false, paused:false, finished:false, countUp:false, startedAt:0, clockAnchorMs:0, anchorRemaining:0, anchorElapsed:0, queueActive:false, currentQueueId:null, currentQueueIndex:-1 });
    emit();
  }

  function adjust(seconds) {
    seconds = Number(seconds) || 0;
    if (state.running && !state.paused) syncClock();
    if (state.countUp && state.running) {
      state.elapsed = Math.max(0, state.elapsed + seconds); reanchor(); emit(); return state.elapsed;
    }
    if (state.running || state.finished) {
      state.remaining += seconds;
      state.duration = Math.max(0, state.duration + seconds);
      state.finished = state.remaining <= 0;
      reanchor(); emit(); return state.remaining;
    }
    const next = Math.max(0, state.duration + seconds);
    state.duration = next; state.remaining = next; state.elapsed = 0; state.finished = false; reanchor(); emit(); return next;
  }

  function setTime(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);
    if (state.running && !state.paused) syncClock();
    state.duration = seconds; state.remaining = seconds; state.elapsed = 0; state.finished = false; reanchor(); emit(); return true;
  }

  function normalizeCue(cue) {
    if (typeof cue === 'number') return { id: uid(), seconds: Math.max(0, Math.round(cue)), label: '' };
    return { id: cue?.id || uid(), seconds: Math.max(0, Math.round(Number(cue?.seconds) || 0)), label: String(cue?.label || '').slice(0, 120) };
  }
  function queueAdd(seconds, label = '') {
    const cue = normalizeCue({seconds, label});
    if (!cue.seconds) return null;
    state.queue.push(cue); emit(); return cue;
  }
  function queueRemove(index) {
    if (index < 0 || index >= state.queue.length) return false;
    const [removed] = state.queue.splice(index, 1);
    if (removed?.id === state.currentQueueId) { state.currentQueueId = null; state.currentQueueIndex = -1; state.queueActive = false; }
    emit(); return true;
  }
  function queueClear() { state.queue = []; state.queueActive = false; state.currentQueueId = null; state.currentQueueIndex = -1; emit(); }
  function queuePlay(index) {
    const cue = state.queue[index];
    if (!cue) return false;
    state.currentQueueId = cue.id; state.currentQueueIndex = index; state.queueActive = true;
    return start(cue.seconds, { fromQueue:true, paused:false, countUp:false });
  }
  function queueNext() {
    if (!state.queue.length) return false;
    let nextIndex = 0;
    if (state.currentQueueId) {
      const current = state.queue.findIndex(c => c.id === state.currentQueueId);
      nextIndex = current >= 0 ? current + 1 : 0;
    }
    if (nextIndex >= state.queue.length) return false;
    return queuePlay(nextIndex);
  }
  function queueCurrent() { return state.queue.find(c => c.id === state.currentQueueId) || null; }
  function queueNextCue() {
    if (!state.queue.length) return null;
    if (!state.currentQueueId) return state.queue[0] || null;
    const current = state.queue.findIndex(c => c.id === state.currentQueueId);
    return current >= 0 ? state.queue[current + 1] || null : state.queue[0] || null;
  }

  function restore(saved) {
    if (!saved || typeof saved !== 'object') return false;
    clearTicker();
    const queue = Array.isArray(saved.queue) ? saved.queue.map(normalizeCue).filter(c => c.seconds > 0) : [];
    Object.assign(state, {
      duration: Number(saved.duration || 0), remaining: Number(saved.remaining || 0), elapsed: Number(saved.elapsed || 0),
      running: !!saved.running, paused: !!saved.paused, countUp: !!saved.countUp, finished: !!saved.finished,
      startedAt: Number(saved.startedAt || 0), clockAnchorMs: Number(saved.clockAnchorMs || 0),
      anchorRemaining: Number(saved.anchorRemaining ?? saved.remaining ?? 0), anchorElapsed: Number(saved.anchorElapsed ?? saved.elapsed ?? 0),
      queue, queueActive: !!saved.queueActive, currentQueueId: saved.currentQueueId || null,
      currentQueueIndex: Number.isInteger(saved.currentQueueIndex) ? saved.currentQueueIndex : queue.findIndex(c => c.id === saved.currentQueueId)
    });
    if (state.running && !state.paused) { syncClock(); reanchor(Date.now()); startTicker(); }
    emit(); return true;
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);

  window.AVTimer = { state,onChange,parseTime,formatTime,snapshot,liveValues,refresh,arm,start,pause,resume,togglePause,startPause,reset,stop,adjust,setTime,queueAdd,queueRemove,queueClear,queuePlay,queueNext,queueCurrent,queueNextCue,restore };
})();
