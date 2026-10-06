(() => {
  const $ = id => document.getElementById(id);
  const T = window.AVTimer;
  const R = window.AVRemote;
  const S = window.AVSync;

  const ADJUST_PRESETS = [60, 120, 300, 600, 900, 1200, 1800, 2700, 3600];
  const SETTINGS_KEY = 'jocAvTimerSettingsV4';
  const DEFAULT_BG = '#00324b';

  let outputWindow = null;
  let screenDetails = null;
  let companionIsOnline = false;
  let autoNextQueued = false;

  const els = {
    input: $('timeInput'), operatorTimer: $('operatorTimer'), operatorState: $('operatorStateText'), operatorWarning: $('operatorWarning'), runStatus: $('runStatus'),
    start: $('startBtn'), pause: $('pauseBtn'), reset: $('resetRunBtn'), stop: $('stopBtn'), next: $('nextTimerButton'),
    countUp: $('countUpToggle'), autostart: $('autostartToggle'), showProgress: $('showProgressCheckbox'), gradient: $('gradientToggle'), warningsToggle: $('warningsToggle'),
    queueToggle: $('queueToggle'), queueBody: $('queueBody'), queueHint: $('queueDisabledHint'), queueInput: $('queueTimeInput'), queueList: $('queueList'), autoNext: $('autoNextToggle'),
    bridge: $('bridgeStatus'), companionPort: $('companionPort'), bridgeHint: $('bridgeConnectionHint'), quickPort: $('quickPortLabel'),
    outputStatus: $('outputWindowStatus'), preview: $('previewFrame'), overlay: $('localOutputOverlay'),
    warningRules: $('warningRulesList'), displaySelect: $('displaySelect'), displayHint: $('displayHint'),
    helpModal: $('helpModal')
  };

  const freshWarnings = () => [
    { id: 'five-min', enabled: true, threshold: 300, label: '5 MINUTES', color: '#f59e0b' },
    { id: 'two-min', enabled: true, threshold: 120, label: '2 MINUTES', color: '#ff3030' }
  ];

  const defaults = () => ({
    bg: DEFAULT_BG,
    fg: '#f5f5f5',
    progress: '#ff4b4b',
    timeColor: '#ff0000',
    scale: 1,
    light: false,
    chroma: false,
    minimal: false,
    gradient: true,
    showProgress: false,
    chromaColor: '#00ff00',
    warningsEnabled: true,
    queueEnabled: false,
    autoNext: false,
    countUp: false,
    autostart: true,
    warningRules: freshWarnings()
  });

  const settings = defaults();
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const uid = () => (crypto?.randomUUID?.() || `warning-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  function formatPreset(seconds) {
    if (seconds === 3600) return '1h';
    if (seconds < 60) return `${seconds}s`;
    return `${seconds / 60}m`;
  }

  function displaySeconds(seconds) { return T.formatTime(Math.round(seconds || 0)); }
  function inputSeconds() { return T.parseTime(els.input.value); }
  function setInputSeconds(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    els.input.value = value > 0 ? T.formatTime(value) : '';
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
      if (saved) Object.assign(settings, saved);
    } catch {}

    if (!Array.isArray(settings.warningRules)) settings.warningRules = freshWarnings();
    settings.warningRules = settings.warningRules.map(r => ({
      id: r.id || uid(),
      enabled: r.enabled !== false,
      threshold: Math.max(0, Number(r.threshold) || 0),
      label: String(r.label ?? ''),
      color: r.color || '#ff0000'
    }));
    applySettingsToControls();
    renderWarningRules();
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }

  function applySettingsToControls() {
    $('bgColor').value = settings.bg || DEFAULT_BG;
    $('fgColor').value = settings.fg || '#f5f5f5';
    $('accentColor').value = settings.progress || '#ff4b4b';
    $('timeColor').value = settings.timeColor || '#ff0000';
    $('timerSizeSlider').value = Math.round((Number(settings.scale) || 1) * 100);
    els.gradient.checked = settings.gradient !== false;
    els.showProgress.checked = !!settings.showProgress;
    els.warningsToggle.checked = settings.warningsEnabled !== false;
    els.queueToggle.checked = !!settings.queueEnabled;
    els.autoNext.checked = !!settings.autoNext;
    els.countUp.checked = !!settings.countUp;
    els.autostart.checked = settings.autostart !== false;
    $('modeToggle').textContent = settings.light ? 'Dark Output' : 'Light Output';
    $('minimalModeToggle').classList.toggle('active', !!settings.minimal);
    $('chromaModeToggle').classList.toggle('active', !!settings.chroma);
    updateQueueEnabledUI();
  }

  function warningRemaining(state) {
    if (state.countUp) return state.duration > 0 ? Math.max(0, state.duration - state.elapsed) : Infinity;
    return Math.max(0, state.remaining);
  }

  function activeWarning(state) {
    if (!settings.warningsEnabled || state.finished) return null;
    const remaining = warningRemaining(state);
    if (!Number.isFinite(remaining)) return null;
    const matches = settings.warningRules
      .filter(r => r.enabled && Number(r.threshold) > 0 && remaining <= Number(r.threshold))
      .sort((a, b) => Number(a.threshold) - Number(b.threshold));
    return matches[0] || null;
  }

  function renderWarningRules() {
    els.warningRules.innerHTML = '';
    els.warningRules.classList.toggle('rules-disabled', !settings.warningsEnabled);
    if (!settings.warningRules.length) {
      const empty = document.createElement('div');
      empty.className = 'warning-empty';
      empty.textContent = 'No custom warnings. Add one if this show needs it.';
      els.warningRules.append(empty);
      return;
    }

    settings.warningRules.forEach(rule => {
      const row = document.createElement('div');
      row.className = 'warning-rule';
      row.dataset.id = rule.id;

      const enabled = document.createElement('input');
      enabled.type = 'checkbox'; enabled.checked = rule.enabled; enabled.title = 'Enable this warning';
      const threshold = document.createElement('input');
      threshold.type = 'text'; threshold.value = T.formatTime(rule.threshold); threshold.placeholder = '5:00'; threshold.className = 'warning-time'; threshold.title = 'Time remaining threshold';
      const label = document.createElement('input');
      label.type = 'text'; label.value = rule.label; label.placeholder = 'Warning label'; label.className = 'warning-label-input';
      const color = document.createElement('input');
      color.type = 'color'; color.value = rule.color; color.title = 'Warning colour';
      const del = document.createElement('button');
      del.type = 'button'; del.textContent = '×'; del.className = 'warning-delete'; del.title = 'Delete warning';

      enabled.onchange = () => { rule.enabled = enabled.checked; settingsChanged(); };
      threshold.onchange = () => { const sec = T.parseTime(threshold.value); rule.threshold = sec; threshold.value = T.formatTime(sec); settingsChanged(); };
      label.oninput = () => { rule.label = label.value; settingsChanged(); };
      color.oninput = () => { rule.color = color.value; settingsChanged(); };
      del.onclick = () => { settings.warningRules = settings.warningRules.filter(r => r.id !== rule.id); renderWarningRules(); settingsChanged(); };
      row.append(enabled, threshold, label, color, del);
      els.warningRules.append(row);
    });
  }

  $('addWarningRuleBtn').onclick = () => {
    settings.warningRules.push({ id: uid(), enabled: true, threshold: 60, label: '1 MINUTE', color: '#ff3030' });
    renderWarningRules();
    settingsChanged();
  };

  function updateQueueEnabledUI() {
    const enabled = !!settings.queueEnabled;
    els.queueBody.classList.toggle('hidden', !enabled);
    els.queueHint.classList.toggle('hidden', enabled);
    els.queueToggle.checked = enabled;
  }

  function renderQueue() {
    els.queueList.innerHTML = '';
    if (!T.state.queue.length) {
      const li = document.createElement('li');
      li.className = 'queue-empty';
      li.textContent = 'No queued timers';
      els.queueList.append(li);
      return;
    }
    T.state.queue.forEach((sec, i) => {
      const li = document.createElement('li'); li.className = 'queue-item';
      const index = document.createElement('span'); index.className = 'queue-index'; index.textContent = String(i + 1).padStart(2, '0');
      const time = document.createElement('strong'); time.textContent = displaySeconds(sec);
      const remove = document.createElement('button'); remove.textContent = '×'; remove.title = 'Remove timer'; remove.onclick = () => T.queueRemove(i);
      li.append(index, time, remove); els.queueList.append(li);
    });
  }

  function timeParts(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    return {
      hours: String(Math.floor(total / 3600)).padStart(2, '0'),
      minutes: String(Math.floor((total % 3600) / 60)).padStart(2, '0'),
      seconds: String(total % 60).padStart(2, '0')
    };
  }

  function buildLivePayload(state) {
    const seconds = state.countUp ? state.elapsed : state.remaining;
    const warning = activeWarning(state);
    const parts = timeParts(seconds);
    const progressPercent = state.duration > 0 ? (state.countUp ? state.elapsed / state.duration : state.remaining / state.duration) * 100 : 0;
    const status = state.finished ? 'TIME' : state.paused ? 'PAUSED' : state.running ? (state.countUp ? 'COUNTING UP' : 'RUNNING') : state.duration > 0 ? 'ARMED' : 'READY';

    return {
      version: 4,
      sentAt: Date.now(),
      state: {
        running: state.running,
        paused: state.paused,
        finished: state.finished,
        countUp: state.countUp,
        clockAnchorMs: Number(state.clockAnchorMs || 0),
        anchorRemaining: Number(state.anchorRemaining || state.remaining || 0),
        anchorElapsed: Number(state.anchorElapsed || state.elapsed || 0),
        seconds: Math.round(seconds),
        formatted: displaySeconds(seconds),
        displayTime: displaySeconds(seconds),
        hours: parts.hours,
        minutes: parts.minutes,
        secondsPart: parts.seconds,
        duration: Math.round(state.duration),
        status,
        pauseResumeLabel: state.paused ? 'RESUME' : 'PAUSE',
        progressPercent: Math.max(0, Math.min(100, progressPercent)),
        warningActive: !!warning,
        warningId: warning?.id || '',
        warningLabel: warning?.label || '',
        warningColor: warning?.color || '',
        warningRemaining: Number.isFinite(warningRemaining(state)) ? Math.round(warningRemaining(state)) : 0,
        queueLength: state.queue.length,
        queueActive: state.queueActive,
        queueAwaitingNext: state.queueAwaitingNext,
        queueEnabled: !!settings.queueEnabled,
        warningsEnabled: !!settings.warningsEnabled,
        progressEnabled: !!settings.showProgress,
        gradientEnabled: settings.gradient !== false,
        minimalEnabled: !!settings.minimal,
        chromaEnabled: !!settings.chroma,
        lightEnabled: !!settings.light,
        autoNext: !!settings.autoNext,
        autostart: settings.autostart !== false,
        outputScale: Number(settings.scale) || 1
      },
      display: { ...settings, warningRules: clone(settings.warningRules) }
    };
  }

  function publish(state = T.state) {
    const payload = buildLivePayload(state);
    S.publish(payload);
    R.publishState({ ...payload.state, display: payload.display, updatedAt: Date.now() });
  }

  function sync(state) {
    const payload = buildLivePayload(state);
    const seconds = state.countUp ? state.elapsed : state.remaining;

    els.operatorTimer.textContent = displaySeconds(seconds);
    els.operatorTimer.style.color = payload.state.warningActive ? payload.state.warningColor : '';
    els.operatorWarning.textContent = payload.state.warningLabel;
    els.operatorWarning.style.setProperty('--warning-chip', payload.state.warningColor || '#ff3030');
    els.operatorWarning.classList.toggle('hidden', !payload.state.warningActive || !payload.state.warningLabel);

    const statusClass = state.finished ? 'finished' : state.paused ? 'paused' : state.running ? 'running' : 'idle';
    els.operatorState.textContent = payload.state.status;
    els.runStatus.textContent = payload.state.status;
    els.runStatus.className = `status-pill ${statusClass}`;
    els.pause.textContent = state.paused ? 'Resume' : 'Pause';
    els.start.disabled = state.running && !state.paused;
    els.pause.disabled = !state.running;
    els.reset.disabled = !state.running && !state.finished && state.duration <= 0;
    els.stop.disabled = !state.running && !state.finished && !state.queueActive && !state.queueAwaitingNext && state.duration <= 0;
    els.next.classList.toggle('hidden', !state.queueAwaitingNext);

    if (!state.running && document.activeElement !== els.input) {
      if (state.duration > 0) setInputSeconds(state.duration);
      else if (!state.finished) els.input.value = '';
    }

    renderQueue();

    if (state.queueAwaitingNext && settings.autoNext && !autoNextQueued) {
      autoNextQueued = true;
      setTimeout(() => {
        autoNextQueued = false;
        if (T.state.queueAwaitingNext && settings.autoNext) T.queueNext();
      }, 50);
    }

    publish(state);
  }

  T.onChange(sync);
  S.onStateRequest(() => publish());

  function startConfigured(forceRunning = false) {
    const typed = inputSeconds();
    if (!T.state.running && typed > 0 && typed !== Math.round(T.state.duration)) T.setTime(typed);
    const paused = forceRunning ? false : !settings.autostart;
    if (T.state.paused) return T.resume();
    return T.start(null, { countUp: !!settings.countUp, paused });
  }

  function adjust(seconds) { T.adjust(seconds); }
  function setTime(seconds) { T.setTime(seconds); }
  function stop() { T.stop(); }

  function operationValue(current, op) {
    if (op === 'on') return true;
    if (op === 'off') return false;
    return !current;
  }

  function setFeature(feature, op = 'toggle') {
    const f = String(feature || '').toLowerCase();
    if (f === 'queue') settings.queueEnabled = operationValue(!!settings.queueEnabled, op);
    else if (f === 'warnings' || f === 'warning') settings.warningsEnabled = operationValue(!!settings.warningsEnabled, op);
    else if (f === 'progress') settings.showProgress = operationValue(!!settings.showProgress, op);
    else if (f === 'gradient') settings.gradient = operationValue(settings.gradient !== false, op);
    else if (f === 'minimal') settings.minimal = operationValue(!!settings.minimal, op);
    else if (f === 'chroma') settings.chroma = operationValue(!!settings.chroma, op);
    else if (f === 'light') settings.light = operationValue(!!settings.light, op);
    else if (f === 'auto_next') settings.autoNext = operationValue(!!settings.autoNext, op);
    else if (f === 'autostart') settings.autostart = operationValue(settings.autostart !== false, op);
    else if (f === 'count_up') {
      settings.countUp = operationValue(!!settings.countUp, op);
      T.state.countUp = settings.countUp;
    } else return;

    applySettingsToControls();
    renderWarningRules();
    settingsChanged();
  }

  function setOutputScale(scale) {
    settings.scale = Math.max(0.6, Math.min(2, Number(scale) || 1));
    applySettingsToControls();
    settingsChanged();
  }

  function setOutputColor(target, color) {
    const value = String(color || '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(value)) return;
    const map = { background: 'bg', timer: 'fg', progress: 'progress', time: 'timeColor', chroma: 'chromaColor' };
    const key = map[String(target || '').toLowerCase()];
    if (!key) return;
    settings[key] = value;
    applySettingsToControls();
    settingsChanged();
  }

  function remoteCommand(evt) {
    const c = evt.command;
    const a = evt.args || {};
    const seconds = Number(a.seconds ?? a.value ?? 0);

    if (c === 'add') adjust(Math.abs(seconds));
    else if (c === 'subtract') adjust(-Math.abs(seconds));
    else if (c === 'set' || c === 'preset') setTime(seconds);
    else if (c === 'start') startConfigured(true);
    else if (c === 'pause') T.pause();
    else if (c === 'resume') T.resume();
    else if (c === 'toggle') T.togglePause();
    else if (c === 'reset') T.reset();
    else if (c === 'stop') stop();
    else if (c === 'queue_next') T.queueNext();
    else if (c === 'queue_add') { settings.queueEnabled = true; applySettingsToControls(); T.queueAdd(seconds); settingsChanged(); }
    else if (c === 'queue_clear') T.queueClear();
    else if (c === 'queue_remove_last') T.queueRemoveLast();
    else if (c === 'queue_start') { settings.queueEnabled = true; applySettingsToControls(); T.queueStart(); settingsChanged(); }
    else if (c === 'feature') setFeature(a.feature, a.op || 'toggle');
    else if (c === 'size') setOutputScale(a.scale);
    else if (c === 'color') setOutputColor(a.target, a.color);
  }

  function updateRemoteStatus() {
    if (!companionIsOnline) {
      els.bridge.textContent = 'Companion offline';
      els.bridge.className = 'status-pill offline';
      return;
    }
    els.bridge.textContent = 'Companion connected';
    els.bridge.className = 'status-pill online';
  }

  R.onCommand(remoteCommand);
  R.onStatus(ok => {
    companionIsOnline = ok;
    updateRemoteStatus();
    if (ok) publish();
  });

  if (els.companionPort) els.companionPort.value = String(R.getPort());
  if (els.quickPort) els.quickPort.textContent = String(R.getPort());

  $('saveCompanionBtn').onclick = () => {
    const saved = R.setPort(els.companionPort.value);
    els.companionPort.value = String(saved);
    if (els.quickPort) els.quickPort.textContent = String(saved);
    els.bridgeHint.textContent = `Saved local Companion API port ${saved}. Testing…`;
    R.test().then(() => {
      els.bridgeHint.textContent = 'Connected. The JC Companion module can now control this timer.';
      publish();
    }).catch(err => {
      els.bridgeHint.textContent = `Companion connection failed: ${err.message}. Make sure the JC module is installed, enabled, and using this same port.`;
    });
  };

  $('testCompanionBtn').onclick = () => {
    els.bridgeHint.textContent = 'Testing Companion…';
    R.test().then(() => {
      els.bridgeHint.textContent = 'Connected. The JC Companion module can now control this timer.';
      publish();
    }).catch(err => {
      els.bridgeHint.textContent = `Companion connection failed: ${err.message}. Open Help and check the setup steps.`;
    });
  };

  R.start();

  function buildAdjustButtons(container, direction) {
    ADJUST_PRESETS.forEach(seconds => {
      const b = document.createElement('button');
      b.textContent = `${direction > 0 ? '+' : '−'}${formatPreset(seconds)}`;
      b.onclick = () => adjust(seconds * direction);
      container.append(b);
    });
  }

  buildAdjustButtons($('addButtons'), 1);
  buildAdjustButtons($('subtractButtons'), -1);

  els.start.onclick = () => startConfigured(false);
  els.pause.onclick = () => T.togglePause();
  els.reset.onclick = () => T.reset();
  els.stop.onclick = stop;
  els.next.onclick = () => T.queueNext();

  document.querySelectorAll('#presetTimes button').forEach(b => b.onclick = () => setTime(Number(b.dataset.seconds)));
  document.querySelectorAll('[data-output-scale]').forEach(b => b.onclick = () => setOutputScale(Number(b.dataset.outputScale)));

  els.input.addEventListener('input', () => {
    if (!T.state.running) {
      const seconds = inputSeconds();
      T.setTime(seconds);
    }
  });

  els.queueToggle.onchange = () => {
    settings.queueEnabled = els.queueToggle.checked;
    updateQueueEnabledUI();
    settingsChanged();
  };
  els.autoNext.onchange = () => { settings.autoNext = els.autoNext.checked; settingsChanged(); };
  els.warningsToggle.onchange = () => { settings.warningsEnabled = els.warningsToggle.checked; renderWarningRules(); settingsChanged(); };
  els.countUp.onchange = () => { settings.countUp = els.countUp.checked; T.state.countUp = settings.countUp; settingsChanged(); };
  els.autostart.onchange = () => { settings.autostart = els.autostart.checked; settingsChanged(); };

  $('queueAddBtn').onclick = () => {
    const s = T.parseTime(els.queueInput.value);
    if (s) { T.queueAdd(s); els.queueInput.value = ''; }
  };
  $('removeLastQueueBtn').onclick = () => T.queueRemoveLast();
  $('clearQueueBtn').onclick = () => T.queueClear();
  $('startQueueBtn').onclick = () => { if (T.state.queue.length) T.queueStart(); };
  els.queueInput.onkeydown = e => { if (e.key === 'Enter') $('queueAddBtn').click(); };

  function settingsChanged() {
    saveSettings();
    sync(T.state);
  }

  $('bgColor').oninput = e => { settings.bg = e.target.value; settingsChanged(); };
  $('fgColor').oninput = e => { settings.fg = e.target.value; settingsChanged(); };
  $('accentColor').oninput = e => { settings.progress = e.target.value; settingsChanged(); };
  $('timeColor').oninput = e => { settings.timeColor = e.target.value; settingsChanged(); };
  $('timerSizeSlider').oninput = e => { settings.scale = Number(e.target.value) / 100; settingsChanged(); };
  els.gradient.onchange = () => { settings.gradient = els.gradient.checked; settingsChanged(); };
  els.showProgress.onchange = () => { settings.showProgress = els.showProgress.checked; settingsChanged(); };
  $('modeToggle').onclick = () => setFeature('light', 'toggle');
  $('minimalModeToggle').onclick = () => setFeature('minimal', 'toggle');
  $('chromaModeToggle').onclick = () => setFeature('chroma', 'toggle');

  $('resetDefaultsBtn').onclick = () => {
    Object.assign(settings, defaults());
    try { localStorage.removeItem(SETTINGS_KEY); } catch {}
    T.stop();
    T.queueClear();
    els.input.value = '';
    applySettingsToControls();
    renderWarningRules();
    saveSettings();
    sync(T.state);
  };

  function openHelp() {
    els.helpModal.classList.remove('hidden');
    document.body.classList.add('modal-open');
    setTimeout(() => $('helpCloseBtn').focus(), 0);
  }
  function closeHelp() {
    els.helpModal.classList.add('hidden');
    document.body.classList.remove('modal-open');
  }
  $('helpBtn').onclick = openHelp;
  $('companionHelpBtn').onclick = openHelp;
  $('helpCloseBtn').onclick = closeHelp;
  els.helpModal.addEventListener('click', e => { if (e.target === els.helpModal) closeHelp(); });

  function screenLabel(screen, index) {
    const label = screen.label?.trim();
    if (label) return label;
    if (screen.isPrimary) return `Display ${index + 1} · Primary`;
    return `Display ${index + 1} · ${screen.width}×${screen.height}`;
  }

  function selectedScreen() {
    const screens = screenDetails?.screens || [];
    const val = els.displaySelect.value;
    if (val !== 'auto' && screens[Number(val)]) return screens[Number(val)];
    return screens.find(s => !s.isPrimary) || screens.find(s => s !== screenDetails?.currentScreen) || screens[0] || null;
  }

  function populateScreens() {
    const previous = els.displaySelect.value;
    els.displaySelect.innerHTML = '<option value="auto">Auto / secondary display</option>';
    (screenDetails?.screens || []).forEach((s, i) => {
      const o = document.createElement('option'); o.value = String(i); o.textContent = screenLabel(s, i); els.displaySelect.append(o);
    });
    if ([...els.displaySelect.options].some(o => o.value === previous)) els.displaySelect.value = previous;
  }

  async function detectDisplays() {
    if (!('getScreenDetails' in window)) {
      els.displayHint.textContent = 'Display detection is not available in this browser. Open the output, drag it to the required screen, then use the hover Fullscreen button there.';
      return null;
    }
    try {
      screenDetails = await window.getScreenDetails();
      populateScreens();
      els.displayHint.textContent = `Detected ${screenDetails.screens.length} display${screenDetails.screens.length === 1 ? '' : 's'}. Choose one or leave Auto.`;
      return screenDetails;
    } catch {
      els.displayHint.textContent = 'Display permission was not granted. Open the output and move it manually; fullscreen is controlled from the output window.';
      return null;
    }
  }

  function boundsFor(targetScreen) {
    if (!targetScreen) {
      const current = window.screen;
      return { left: window.screenX + 60, top: window.screenY + 60, width: Math.min(1280, current.availWidth || 1280), height: Math.min(720, current.availHeight || 720) };
    }
    return { left: targetScreen.availLeft, top: targetScreen.availTop, width: targetScreen.availWidth, height: targetScreen.availHeight };
  }

  function applyWindowBounds(bounds) {
    if (!outputWindow || outputWindow.closed) return false;
    try {
      outputWindow.moveTo(Math.round(bounds.left), Math.round(bounds.top));
      outputWindow.resizeTo(Math.round(bounds.width), Math.round(bounds.height));
      outputWindow.focus();
      return true;
    } catch { return false; }
  }

  async function openOutputWindow() {
    if (outputWindow && !outputWindow.closed) { outputWindow.focus(); return outputWindow; }
    if (!screenDetails && 'getScreenDetails' in window) await detectDisplays();
    const b = boundsFor(selectedScreen());
    const features = `popup=yes,left=${Math.round(b.left)},top=${Math.round(b.top)},width=${Math.round(b.width)},height=${Math.round(b.height)}`;
    outputWindow = window.open('output.html', 'jocAvTimerOutput', features);
    if (outputWindow) {
      els.outputStatus.textContent = 'Output open';
      els.outputStatus.className = 'status-pill online';
      setTimeout(() => { applyWindowBounds(b); publish(); }, 250);
    } else {
      els.outputStatus.textContent = 'Popup blocked';
      els.outputStatus.className = 'status-pill offline';
    }
    return outputWindow;
  }

  function focusOutput() { if (outputWindow && !outputWindow.closed) outputWindow.focus(); else openOutputWindow(); }
  function closeOutput() {
    if (outputWindow && !outputWindow.closed) { try { outputWindow.close(); } catch {} }
    outputWindow = null;
    els.outputStatus.textContent = 'Preview only';
    els.outputStatus.className = 'status-pill idle';
  }

  $('detectDisplaysBtn').onclick = detectDisplays;
  $('displayOpenBtn').onclick = openOutputWindow;
  $('openOutputBtn').onclick = openOutputWindow;
  $('focusOutputBtn').onclick = focusOutput;
  $('closeOutputBtn').onclick = closeOutput;
  $('refreshPreviewBtn').onclick = () => { els.preview.src = `output.html?preview=1&t=${Date.now()}`; setTimeout(() => publish(), 250); };

  $('outputHereBtn').onclick = async () => {
    els.overlay.classList.remove('hidden');
    setTimeout(() => publish(), 80);
    try { await els.overlay.requestFullscreen?.(); } catch {}
  };
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && !els.overlay.classList.contains('hidden')) els.overlay.classList.add('hidden');
  });

  setInterval(() => {
    if (outputWindow && outputWindow.closed) {
      outputWindow = null;
      els.outputStatus.textContent = 'Preview only';
      els.outputStatus.className = 'status-pill idle';
    }
  }, 1000);

  document.addEventListener('keydown', e => {
    const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    if (e.key === 'Escape' && !els.helpModal.classList.contains('hidden')) { closeHelp(); return; }
    if (e.key === 'Escape' && !typing) {
      if (!els.overlay.classList.contains('hidden')) { els.overlay.classList.add('hidden'); return; }
      e.preventDefault(); stop(); return;
    }
    if (e.key === 'Enter' && !T.state.running && !typing) { e.preventDefault(); startConfigured(false); return; }
    if (e.key === ' ' && T.state.running && !typing) { e.preventDefault(); T.togglePause(); return; }
    if (!typing && e.key.toLowerCase() === 'r') { e.preventDefault(); T.reset(); }
  });

  loadSettings();
  renderQueue();
  sync(T.state);
  setTimeout(() => publish(), 150);
})();
