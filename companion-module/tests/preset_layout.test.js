'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const {liveTimeParts} = require('../src/state')
const manifest = require('../companion/manifest.json')

function setup() {
  const source = path.resolve(__dirname, '../main.js')
  const bootstrap = /new Runtime\(\)\.start\(\)\.catch\(err=>\{[^\n]+\}\)\s*$/
  let code = fs.readFileSync(source, 'utf8')
  assert.match(code, bootstrap)
  code = code.replace(bootstrap, 'module.exports={JCAVTimerInstance}')
  const m = new Module(source, module)
  m.filename = source
  m.paths = Module._nodeModulePaths(path.dirname(source))
  m._compile(code, source)
  const sent = []
  const inst = new m.exports.JCAVTimerInstance({sendNoCb:(name,payload)=>sent.push({name,payload})})
  inst.config={port:'3210',networkPort:'3211'}
  inst.state={seconds:90061,duration:90061,displayMode:'timer',clockFormat:'24',clockTimeZone:'Pacific/Auckland',running:false,paused:false}
  inst.updateDefinitions()
  const presets=Object.fromEntries(sent.find(e=>e.name==='setPresetDefinitions').payload.presets.map(p=>[p.id,p]))
  const actions=new Set(Object.keys(inst.actionDefinitions))
  const feedbacks=new Set(Object.keys(inst.feedbackDefinitions))
  const variables=new Set(sent.find(e=>e.name==='setVariableDefinitions').payload.variables.map(v=>v.id))
  return {inst,sent,presets,actions,feedbacks,variables}
}
const getLast=(sent,name)=>sent.filter(e=>e.name===name).at(-1)?.payload

test('days/hours component calculations are accurate',()=>{
  assert.deepEqual(liveTimeParts(90061),{days:'01',hours:'25',hoursInDay:'01',minutes:'01',secondsPart:'01',totalHours:'25',totalMinutes:'1501',totalSeconds:'90061'})
})
test('module retains original identity',()=>{
  assert.equal(manifest.id,'jc-av-timer')
  assert.equal(manifest.name,'JC - AV Timer')
})
test('live variables are published with correct fields',()=>{
  const {inst,sent}=setup()
  inst.publish(true)
  const values=Object.fromEntries(getLast(sent,'setVariableValues').newValues.map(v=>[v.id,v.value]))
  const expected=liveTimeParts(90061)
  for(const [variable,part] of Object.entries({days:'days',hours:'hours',hours_in_day:'hoursInDay',minutes:'minutes',seconds_part:'secondsPart',total_hours:'totalHours',total_minutes:'totalMinutes',total_seconds:'totalSeconds'})){
    assert.equal(String(values[variable]),expected[part],variable)
  }
  assert.equal(values.live_time,'25:01:01')
})
test('all presets use real module variables, not button-local variables',()=>{
  const {presets,variables}=setup()
  for(const [id,p] of Object.entries(presets)){
    const t=String(p.style?.text||'')
    assert(!t.includes('$(this:'),id)
    for(const m of t.matchAll(/\$\(jc-av-timer:([^)]*)\)/g))assert(variables.has(m[1]),`${id}: variable ${m[1]} not defined`)
    assert.notEqual(p.style?.size,'auto',`preset ${id} should use fixed text size`)
  }
})
test('add, remove, playback, live and clock presets are grouped separately',()=>{
  const {presets:p}=setup()
  const group=id=>{assert(p[id],`${id} preset missing`);return p[id].category}
  assert.equal(group('add_60'),group('add_3600'))
  assert.equal(group('sub_60'),group('sub_3600'))
  assert.notEqual(group('add_60'),group('sub_60'))
  assert.equal(group('start'),group('stop'))
  assert.equal(group('dd'),group('ss'))
  assert.notEqual(group('clock_live'),group('dd'))
})
test('all grouped presets reference defined feedback and action IDs',()=>{
  const {presets,actions,feedbacks}=setup()
  for(const [id,p] of Object.entries(presets)){
    for(const step of p.steps||[])for(const a of step.down||[])assert(actions.has(a.actionId),`${id}: action ${a.actionId} missing`)
    for(const f of p.feedbacks||[])assert(feedbacks.has(f.feedbackId),`${id}: feedback ${f.feedbackId} missing`)
  }
})
