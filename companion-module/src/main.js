const http = require('http')
const { InstanceBase, Regex, runEntrypoint, InstanceStatus } = require('@companion-module/base')
const UpdateActions = require('./actions')
const UpdateFeedbacks = require('./feedbacks')
const UpdateVariables = require('./variables')
const UpdatePresets = require('./presets')

class JCAVTimerInstance extends InstanceBase {
  async init(config) {
    this.config = config
    this.state = {}
    this.server = null
    this.events = []
    this.nextEventId = 1
    this.eventWaiters = new Set()
    this.browserLastSeen = 0
    this.browserOnline = false
    this.healthTimer = null
    this.liveTimer = null
    this.lastValues = {}
    this.lastFeedbackSignature = ''

    this.updateDefinitions()
    await this.startServer()

    // Health and derived-state loops run inside Companion, not in the browser.
    // This keeps TIMER / HH / MM / SS and feedback moving even if the browser
    // window is unfocused or Chrome throttles its background timers.
    this.healthTimer = setInterval(() => this.refreshBrowserStatus(), 1000)
    this.liveTimer = setInterval(() => this.publish(), 250)
    this.publish(true)
  }

  async destroy() {
    if (this.healthTimer) clearInterval(this.healthTimer)
    if (this.liveTimer) clearInterval(this.liveTimer)
    this.healthTimer = null
    this.liveTimer = null
    this.resolveEventWaiters()
    await this.stopServer()
  }

  async configUpdated(config) {
    const oldPort = this.port
    this.config = config
    if (oldPort !== this.port) {
      await this.stopServer()
      await this.startServer()
    }
    this.publish(true)
  }

  getConfigFields() {
    return [
      {
        type: 'textinput',
        id: 'port',
        label: 'Local timer API port',
        width: 4,
        default: '3210',
        regex: Regex.PORT,
        tooltip: 'JC AV Timer connects to Companion on 127.0.0.1 using this port.'
      }
    ]
  }

  get port() {
    return Number(this.config?.port || 3210)
  }

  updateDefinitions() {
    UpdateActions(this)
    UpdateFeedbacks(this)
    UpdateVariables(this)
    UpdatePresets(this)
  }

  async startServer() {
    await this.stopServer()
    this.server = http.createServer((req, res) => this.handleBrowserRequest(req, res))
    this.server.on('error', err => {
      this.log('error', `Local timer API error: ${err.message}`)
      this.updateStatus(InstanceStatus.ConnectionFailure, `Cannot listen on 127.0.0.1:${this.port}`)
    })

    await new Promise((resolve, reject) => {
      const onError = err => { this.server?.off('listening', onListening); reject(err) }
      const onListening = () => { this.server?.off('error', onError); resolve() }
      this.server.once('error', onError)
      this.server.once('listening', onListening)
      this.server.listen(this.port, '127.0.0.1')
    }).then(() => {
      this.updateStatus(InstanceStatus.Ok, `Timer API ready on 127.0.0.1:${this.port}`)
      this.log('info', `JC AV Timer API listening on http://127.0.0.1:${this.port}`)
    }).catch(err => {
      this.updateStatus(InstanceStatus.ConnectionFailure, `Port ${this.port}: ${err.message}`)
      this.log('error', `Unable to start local timer API: ${err.message}`)
    })
  }

  async stopServer() {
    const server = this.server
    this.server = null
    if (!server) return
    await new Promise(resolve => {
      try { server.close(() => resolve()) } catch { resolve() }
    })
  }

  setCors(req, res) {
    const origin = req.headers.origin || '*'
    res.setHeader('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    res.setHeader('Cache-Control', 'no-store')
  }

  json(req, res, status, value) {
    this.setCors(req, res)
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(value))
  }

  readJson(req) {
    return new Promise((resolve, reject) => {
      let body = ''
      req.setEncoding('utf8')
      req.on('data', chunk => {
        body += chunk
        if (body.length > 1024 * 1024) req.destroy(new Error('Request body too large'))
      })
      req.on('end', () => {
        if (!body) return resolve({})
        try { resolve(JSON.parse(body)) } catch (err) { reject(err) }
      })
      req.on('error', reject)
    })
  }

  touchBrowser() {
    this.browserLastSeen = Date.now()
    if (!this.browserOnline) {
      this.browserOnline = true
      this.publish(true)
    }
  }

  refreshBrowserStatus() {
    // Generous grace period avoids Connected/Offline flicker when a browser
    // briefly delays localhost requests while changing focus.
    const active = this.browserLastSeen > 0 && Date.now() - this.browserLastSeen < 60000
    if (active !== this.browserOnline) {
      this.browserOnline = active
      this.publish(true)
    }
  }

  async handleBrowserRequest(req, res) {
    this.setCors(req, res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      return res.end()
    }

    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`)
    try {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/api/status')) {
        this.touchBrowser()
        return this.json(req, res, 200, {
          ok: true,
          name: 'JC - AV Timer',
          version: '0.9.4',
          companionActive: true,
          browserActive: this.browserOnline,
          latestId: this.nextEventId - 1,
          port: this.port,
          network: this.network?.getStatus?.() || { ok: false, port: this.networkPort, viewerCount: 0 }
        })
      }

      if (req.method === 'GET' && url.pathname === '/api/events') {
        this.touchBrowser()
        const since = Math.max(0, Number(url.searchParams.get('since') || 0))
        const waitMs = Math.max(0, Math.min(25000, Number(url.searchParams.get('wait') || 0)))
        let events = this.events.filter(evt => evt.id > since)
        if (!events.length && waitMs > 0) {
          await this.waitForEvent(waitMs)
          events = this.events.filter(evt => evt.id > since)
          // A long-poll can legitimately sit open for 20 seconds. Refresh the
          // browser heartbeat when it completes so the connection never drops
          // merely because it was quietly waiting for a command.
          this.touchBrowser()
        }
        return this.json(req, res, 200, {
          ok: true,
          companionActive: true,
          latestId: this.nextEventId - 1,
          events
        })
      }

      if (req.method === 'POST' && url.pathname === '/api/state') {
        const state = await this.readJson(req)
        this.state = state && typeof state === 'object' ? state : {}
        this.touchBrowser()
        this.publish(true)
        return this.json(req, res, 200, { ok: true })
      }

      if (req.method === 'GET' && url.pathname === '/api/state') {
        return this.json(req, res, 200, this.getLiveState())
      }

      if (req.method === 'GET' && url.pathname.startsWith('/timer/')) {
        const result = this.enqueuePath(url.pathname)
        return this.json(req, res, result ? 200 : 404, result ? { ok: true } : { ok: false, error: 'Unknown timer command' })
      }

      return this.json(req, res, 404, { ok: false, error: 'Not found' })
    } catch (err) {
      this.log('warn', `Timer API request failed: ${err.message}`)
      return this.json(req, res, 400, { ok: false, error: err.message })
    }
  }

  waitForEvent(waitMs) {
    return new Promise(resolve => {
      const waiter = { resolve, timer: null }
      waiter.timer = setTimeout(() => {
        this.eventWaiters.delete(waiter)
        resolve()
      }, waitMs)
      this.eventWaiters.add(waiter)
    })
  }

  resolveEventWaiters() {
    for (const waiter of this.eventWaiters || []) {
      clearTimeout(waiter.timer)
      try { waiter.resolve() } catch {}
    }
    this.eventWaiters?.clear()
  }

  enqueue(command, args = {}) {
    const evt = { id: this.nextEventId++, ts: Date.now(), command, args }
    this.events.push(evt)
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500)
    this.resolveEventWaiters()
    return evt
  }

  command(command, args = {}) {
    this.enqueue(command, args)
    this.applyOptimisticCommand(command, args)
    this.publish(true)
  }

  parseSeconds(token) {
    const raw = String(token || '').toLowerCase()
    const m = raw.match(/^(\d+(?:\.\d+)?)(s|m|h)?$/)
    if (!m) return 0
    const value = Number(m[1])
    const unit = m[2] || 's'
    return Math.max(0, Math.round(value * (unit === 'h' ? 3600 : unit === 'm' ? 60 : 1)))
  }

  enqueuePath(path) {
    const parts = path.split('/').filter(Boolean)
    if (parts[0] !== 'timer') return false
    const op = parts[1] || ''

    if (op === 'add' || op === 'subtract' || op === 'set' || op === 'preset') {
      const seconds = this.parseSeconds(parts[2])
      this.command(op === 'preset' ? 'set' : op, { seconds })
      return true
    }

    if (op === 'queue') {
      const q = parts[2] || ''
      if (q === 'add') { this.command('queue_add', { seconds: this.parseSeconds(parts[3]) }); return true }
      if (q === 'start') { this.command('queue_start'); return true }
      if (q === 'next') { this.command('queue_next'); return true }
      if (q === 'clear') { this.command('queue_clear'); return true }
      if (q === 'remove-last') { this.command('queue_remove_last'); return true }
    }

    if (op === 'feature' && parts[2]) {
      this.command('feature', { feature: parts[2], op: parts[3] || 'toggle' })
      return true
    }

    if (op === 'size' && parts[2]) {
      const percent = Math.max(60, Math.min(200, Number(parts[2]) || 100))
      this.command('size', { scale: percent / 100 })
      return true
    }

    const map = {
      start: 'start', pause: 'pause', resume: 'resume', toggle: 'toggle',
      reset: 'reset', stop: 'stop', next: 'queue_next'
    }
    if (map[op]) {
      this.command(map[op])
      return true
    }
    return false
  }

  async send(path) {
    if (!this.enqueuePath(path)) this.log('warn', `Unknown AV Timer command path: ${path}`)
  }

  getLiveSeconds(now = Date.now(), source = this.state || {}) {
    let seconds = Number(source.seconds || 0)
    if (source.running && !source.paused && Number(source.clockAnchorMs) > 0) {
      const delta = Math.max(0, (now - Number(source.clockAnchorMs)) / 1000)
      if (source.countUp) seconds = Math.max(0, Number(source.anchorElapsed || 0) + delta)
      else seconds = Math.max(0, Number(source.anchorRemaining || source.seconds || 0) - delta)
    }
    return seconds
  }

  formatTime(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  getLiveState(now = Date.now()) {
    const source = this.state || {}
    const s = { ...source }
    const seconds = this.getLiveSeconds(now, source)
    const duration = Math.max(0, Number(source.duration || 0))

    s.seconds = seconds
    s.displayTime = this.formatTime(seconds)
    s.formatted = s.displayTime
    const total = Math.max(0, Math.round(seconds))
    s.hours = String(Math.floor(total / 3600)).padStart(2, '0')
    s.minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
    s.secondsPart = String(total % 60).padStart(2, '0')

    if (!source.countUp && source.running && seconds <= 0) {
      s.running = false
      s.paused = false
      s.finished = true
    }

    s.status = s.finished ? 'TIME' : s.paused ? 'PAUSED' : s.running ? (s.countUp ? 'COUNTING UP' : 'RUNNING') : duration > 0 ? 'ARMED' : 'READY'
    s.pauseResumeLabel = s.paused ? 'RESUME' : 'PAUSE'

    const display = source.display || {}
    const warningsEnabled = source.warningsEnabled !== false && display.warningsEnabled !== false
    if (warningsEnabled && !s.finished) {
      const warningRemaining = s.countUp && duration > 0 ? Math.max(0, duration - seconds) : Math.max(0, seconds)
      const rules = (display.warningRules || [])
        .filter(r => r && r.enabled !== false && Number(r.threshold) > 0 && warningRemaining <= Number(r.threshold))
        .sort((a, b) => Number(a.threshold) - Number(b.threshold))
      const warning = rules[0] || null
      s.warningActive = !!warning
      s.warningLabel = warning?.label || ''
      s.warningColor = warning?.color || ''
      s.warningRemaining = warningRemaining
    } else if (s.finished) {
      s.warningActive = false
      s.warningLabel = ''
    }

    const progressPercent = duration > 0 ? (seconds / duration) * 100 : 0
    s.progressPercent = Math.max(0, Math.min(100, progressPercent))
    return s
  }

  captureLiveToAnchors() {
    const live = this.getLiveState()
    const now = Date.now()
    this.state.seconds = live.seconds
    this.state.clockAnchorMs = now
    if (this.state.countUp) this.state.anchorElapsed = live.seconds
    else this.state.anchorRemaining = live.seconds
    return live
  }

  applyOptimisticCommand(command, args = {}) {
    const s = this.state || (this.state = {})
    const seconds = Math.max(0, Number(args.seconds || 0))
    const now = Date.now()
    const live = this.captureLiveToAnchors()

    if (command === 'set') {
      s.duration = seconds
      s.seconds = seconds
      s.anchorRemaining = seconds
      s.anchorElapsed = 0
      s.clockAnchorMs = now
      s.finished = false
      if (!s.running) s.paused = false
    } else if (command === 'add' || command === 'subtract') {
      const delta = command === 'add' ? seconds : -seconds
      const next = Math.max(0, Number(live.seconds || 0) + delta)
      s.seconds = next
      s.duration = Math.max(0, Number(s.duration || 0) + delta)
      if (s.countUp && s.running) s.anchorElapsed = next
      else s.anchorRemaining = next
      s.clockAnchorMs = now
      if (s.finished && next > 0) { s.finished = false; s.running = true; s.paused = false }
    } else if (command === 'start') {
      if (Number(s.duration || live.seconds || 0) > 0 || s.countUp) {
        s.running = true
        s.paused = false
        s.finished = false
        s.clockAnchorMs = now
        if (s.countUp) s.anchorElapsed = Number(live.seconds || 0)
        else s.anchorRemaining = Number(live.seconds || s.duration || 0)
      }
    } else if (command === 'pause' && s.running && !s.paused) {
      s.seconds = live.seconds
      s.paused = true
      s.clockAnchorMs = now
      if (s.countUp) s.anchorElapsed = live.seconds
      else s.anchorRemaining = live.seconds
    } else if (command === 'resume' && s.running && s.paused) {
      s.paused = false
      s.clockAnchorMs = now
      if (s.countUp) s.anchorElapsed = Number(s.seconds || 0)
      else s.anchorRemaining = Number(s.seconds || 0)
    } else if (command === 'toggle' && s.running) {
      if (s.paused) {
        s.paused = false
        s.clockAnchorMs = now
        if (s.countUp) s.anchorElapsed = Number(s.seconds || 0)
        else s.anchorRemaining = Number(s.seconds || 0)
      } else {
        s.seconds = live.seconds
        s.paused = true
        s.clockAnchorMs = now
        if (s.countUp) s.anchorElapsed = live.seconds
        else s.anchorRemaining = live.seconds
      }
    } else if (command === 'reset') {
      s.seconds = Number(s.duration || 0)
      s.running = Number(s.duration || 0) > 0 || !!s.countUp
      s.paused = false
      s.finished = false
      s.clockAnchorMs = now
      s.anchorRemaining = Number(s.duration || 0)
      s.anchorElapsed = 0
    } else if (command === 'stop') {
      Object.assign(s, {
        seconds: 0, duration: 0, running: false, paused: false, finished: false,
        countUp: false, clockAnchorMs: 0, anchorRemaining: 0, anchorElapsed: 0,
        queueActive: false, queueAwaitingNext: false
      })
    } else if (command === 'feature') {
      const feature = String(args.feature || '').toLowerCase()
      const keyMap = {
        queue: 'queueEnabled', warnings: 'warningsEnabled', warning: 'warningsEnabled', progress: 'progressEnabled',
        gradient: 'gradientEnabled', minimal: 'minimalEnabled', chroma: 'chromaEnabled', light: 'lightEnabled',
        auto_next: 'autoNext', autostart: 'autostart', count_up: 'countUp'
      }
      const key = keyMap[feature]
      if (key) {
        const current = s[key] !== undefined ? !!s[key] : (key === 'warningsEnabled' || key === 'gradientEnabled' || key === 'autostart')
        s[key] = args.op === 'on' ? true : args.op === 'off' ? false : !current
      }
    } else if (command === 'size') {
      s.outputScale = Math.max(0.6, Math.min(2, Number(args.scale) || 1))
      s.display = { ...(s.display || {}), scale: s.outputScale }
    } else if (command === 'queue_add') {
      s.queueLength = Math.max(0, Number(s.queueLength || 0) + 1)
      s.queueEnabled = true
    } else if (command === 'queue_remove_last') {
      s.queueLength = Math.max(0, Number(s.queueLength || 0) - 1)
    } else if (command === 'queue_clear') {
      s.queueLength = 0
    }
  }

  publish(force = false) {
    const s = this.getLiveState()
    const displayTime = s.displayTime || '00:00'
    const values = {
      display_time: displayTime,
      remaining: displayTime,
      hours: s.hours || '00',
      minutes: s.minutes || '00',
      seconds_part: s.secondsPart || '00',
      seconds: Math.max(0, Math.round(Number(s.seconds || 0))),
      duration: Math.max(0, Math.round(Number(s.duration || 0))),
      status: s.status || 'READY',
      connection_status: this.browserOnline ? 'CONNECTED' : 'OFFLINE',
      pause_resume_label: s.pauseResumeLabel || 'PAUSE',
      running: s.running && !s.paused ? 'yes' : 'no',
      paused: s.paused ? 'yes' : 'no',
      warning: s.warningActive ? 'yes' : 'no',
      warning_label: s.warningLabel || '',
      warning_display: s.warningActive ? (s.warningLabel || 'WARNING') : 'WARNING\nOFF',
      warning_remaining: Math.max(0, Math.round(Number(s.warningRemaining || 0))),
      queue_length: Math.max(0, Math.round(Number(s.queueLength || 0))),
      queue_enabled: s.queueEnabled ? 'yes' : 'no',
      warnings_enabled: s.warningsEnabled === false ? 'no' : 'yes',
      progress_enabled: s.progressEnabled ? 'yes' : 'no',
      gradient_enabled: s.gradientEnabled === false ? 'no' : 'yes',
      minimal_enabled: s.minimalEnabled ? 'yes' : 'no',
      chroma_enabled: s.chromaEnabled ? 'yes' : 'no',
      light_enabled: s.lightEnabled ? 'yes' : 'no',
      auto_next: s.autoNext ? 'yes' : 'no',
      autostart: s.autostart === false ? 'no' : 'yes',
      count_up: s.countUp ? 'yes' : 'no',
      output_size: Math.round(Number(s.outputScale || s.display?.scale || 1) * 100),
      queue_state: s.queueEnabled ? 'ON' : 'OFF',
      warnings_state: s.warningsEnabled === false ? 'OFF' : 'ON',
      progress_state: s.progressEnabled ? 'ON' : 'OFF',
      gradient_state: s.gradientEnabled === false ? 'OFF' : 'ON',
      minimal_state: s.minimalEnabled ? 'ON' : 'OFF',
      chroma_state: s.chromaEnabled ? 'ON' : 'OFF',
      light_state: s.lightEnabled ? 'ON' : 'OFF',
      auto_next_state: s.autoNext ? 'ON' : 'OFF',
      autostart_state: s.autostart === false ? 'OFF' : 'ON',
      count_up_state: s.countUp ? 'ON' : 'OFF',
      bridge_online: this.browserOnline ? 'yes' : 'no',
      browser_online: this.browserOnline ? 'yes' : 'no',
      feedback_instances: typeof this.getFeedbackInstanceCount === 'function' ? this.getFeedbackInstanceCount() : 0
    }

    const changed = {}
    for (const [key, value] of Object.entries(values)) {
      if (force || this.lastValues[key] !== value) changed[key] = value
    }
    if (Object.keys(changed).length) {
      this.setVariableValues(changed)
      Object.assign(this.lastValues, changed)
    }

    const feedbackSignature = JSON.stringify({
      t: values.display_time, status: values.status, conn: values.connection_status,
      paused: values.paused, running: values.running, warning: values.warning,
      warningLabel: values.warning_label, q: values.queue_length,
      qe: values.queue_enabled, we: values.warnings_enabled, pe: values.progress_enabled,
      ge: values.gradient_enabled, me: values.minimal_enabled, ce: values.chroma_enabled,
      le: values.light_enabled, an: values.auto_next, as: values.autostart, cu: values.count_up,
      os: values.output_size
    })

    if (force || feedbackSignature !== this.lastFeedbackSignature) {
      this.lastFeedbackSignature = feedbackSignature
      this.checkFeedbacks(
        'bridge_online', 'browser_online', 'running', 'paused', 'warning_active', 'finished',
        'queue_enabled', 'warnings_enabled', 'progress_enabled', 'gradient_enabled', 'minimal_enabled',
        'chroma_enabled', 'light_enabled', 'auto_next', 'autostart', 'count_up'
      )
    }
  }
}

runEntrypoint(JCAVTimerInstance, [])
