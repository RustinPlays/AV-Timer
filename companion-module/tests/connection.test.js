'use strict'
// Regression checks for the self-contained Companion 5.x runtime.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const manifest = require('../companion/manifest.json')

function currentInstance() {
  const file = path.resolve(__dirname, '../main.js')
  let code = fs.readFileSync(file, 'utf8')
  const startup = /new Runtime\(\)\.start\(\)\.catch\(err=>\{[^\n]+\}\)\s*$/
  assert.match(code, startup, 'Expected the Companion runtime bootstrap')
  code = code.replace(startup, 'module.exports = {JCAVTimerInstance, Runtime}')
  const m = new Module(file, module)
  m.filename = file
  m.paths = Module._nodeModulePaths(path.dirname(file))
  m._compile(code, file)
  return m.exports.JCAVTimerInstance
}

test('same identity as original JC - AV Timer module', () => {
  assert.equal(manifest.id, 'jc-av-timer')
  assert.equal(manifest.name, 'JC - AV Timer')
  assert.ok(manifest.legacyIds.includes('jc-avtimer'))
})

test('bridge stays available while browser is idle; browser status has 60-second grace', () => {
  const sent = []
  const Instance = currentInstance()
  const instance = new Instance({sendNoCb: (name, payload) => sent.push({name, payload})})
  instance.config = {port: '3210', networkPort: '3211'}
  instance.state = {displayMode: 'timer', seconds: 0}
  instance.browserLastSeen = Date.now() - 6_000
  instance.browserOnline = true
  instance.refreshBrowserStatus()
  assert.equal(instance.browserOnline, true, '6 seconds without browser posts must remain connected')
  assert.equal(sent.filter(e => e.name === 'set-status').length, 0, 'browser idle must not mark the listening API offline')
  instance.browserLastSeen = Date.now() - 61_000
  instance.refreshBrowserStatus()
  assert.equal(instance.browserOnline, false, 'browser offline after more than 60 seconds')
  assert.equal(sent.filter(e => e.name === 'set-status').length, 0, 'API listener status is independent of browser presence')
})
