'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const releaseRoot=path.resolve(__dirname,'..')
function loadInstance() {
  const file=path.join(releaseRoot,'main.js')
  let code=fs.readFileSync(file,'utf8')
  const boot=/new Runtime\(\)\.start\(\)\.catch\(err=>\{[^\n]+\}\)\s*$/
  assert.match(code,boot)
  code=code.replace(boot,'module.exports = {JCAVTimerInstance, Runtime}')
  const m=new Module(file,module)
  m.filename=file
  m.paths=Module._nodeModulePaths(releaseRoot)
  m._compile(code,file)
  return m.exports.JCAVTimerInstance
}
function setup(){
  const sent=[]
  const Instance=loadInstance()
  const inst=new Instance({sendNoCb:(name,payload)=>sent.push({name,payload})})
  inst.config={port:'3210',networkPort:'3211'}
  inst.updateDefinitions()
  const defines=sent.find(x=>x.name==='setFeedbackDefinitions')?.payload.feedbacks
  const presets=sent.find(x=>x.name==='setPresetDefinitions')?.payload.presets
  const vars=sent.find(x=>x.name==='setVariableDefinitions')?.payload
  return {inst,sent,defines,presets,vars}
}
const last=(sent,name)=>sent.filter(x=>x.name===name).at(-1)?.payload
const get=(items,id)=>items.find(x=>x.id===id)
const fb=(inst,id,opts={})=>inst.feedbackDefinitions[id].callback({options:opts})
const wait=()=>new Promise(res=>setImmediate(res))

test('manifest preserves the existing JC - AV Timer identity',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(releaseRoot,'companion/manifest.json'),'utf8'))
  assert.equal(manifest.id,'jc-av-timer')
  assert.equal(manifest.name,'JC - AV Timer')
  assert.equal(manifest.version,'0.9.8')
  assert.equal(manifest.runtime.entrypoint,'../main.js')
})
test('Advanced feedbacks include affectedProperties in actual IPC metadata',()=>{
  const {defines}=setup()
  for (const id of ['live_mode_value','start_pause_live','clock_button_state','banner_toggle_state','banner_flash_state','control_state','clock_format_state','message_preset_state','feature_state']) {
    assert.deepEqual(get(defines,id).affectedProperties.length>0,true,`${id} needs affectedProperties`)
  }
  assert(get(defines,'live_mode_value').affectedProperties.includes('text'))
  assert(get(defines,'clock_button_state').affectedProperties.includes('bgcolor'))
})
test('Timer/clock live time updates on the SAME preset, and sends different variables through IPC',()=>{
  const {inst,sent,presets,vars}=setup()
  const preset=get(presets,'live_time_medium')
  assert.equal(preset.style.text,'$(jc-av-timer:live_time)')
  assert.equal(preset.previewStyle,undefined)
  assert(preset.feedbacks.some(f=>f.feedbackId==='live_mode_value'))
  assert(vars.variables.some(v=>v.id==='live_time'))
  inst.browserOnline=true
  inst.state={displayMode:'timer',clockFormat:'24',clockTimeZone:'Pacific/Auckland',duration:5000,seconds:3661,running:false,paused:false}
  inst.publish(true)
  assert.equal(last(sent,'setVariableValues').newValues.find(x=>x.id==='live_time')?.value,'01:01:01')
  inst.state={...inst.state,displayMode:'clock'}
  inst.publish(true)
  const clock=last(sent,'setVariableValues').newValues.find(x=>x.id==='live_time')?.value
  assert.match(clock,/^\d\d:\d\d:\d\d$/)
  assert.notEqual(clock,'01:01:01')
  inst.publish(true)
  inst.state={...inst.state,displayMode:'timer'}
  inst.publish(true)
  assert.equal(last(sent,'setVariableValues').newValues.find(x=>x.id==='live_time')?.value,'01:01:01')
})
test('Clock-only mode continues ticking without browser state posts',async()=>{
  const {inst,sent}=setup()
  inst.state={displayMode:'clock',clockFormat:'24',clockTimeZone:'Pacific/Auckland'}
  inst.publish(true)
  const first=last(sent,'setVariableValues').newValues.find(x=>x.id==='live_time')?.value
  await new Promise(resolve=>setTimeout(resolve,1150))
  inst.publish()
  const changes=last(sent,'setVariableValues').newValues
  assert(changes.some(x=>x.id==='live_time'&&x.value!==first),`time did not refresh from ${first}`)
})
test('PLAY/PAUSE and separate transport controls always reflect their current state',()=>{
  const {inst}=setup()
  inst.state={duration:300,seconds:300,running:false,paused:false}
  const play=fb(inst,'start_pause_live')
  assert.match(play.text,/PLAY/)
  inst.state={duration:300,seconds:300,running:true,paused:false}
  const pause=fb(inst,'start_pause_live')
  assert.match(pause.text,/PAUSE/)
  assert.notEqual(play.bgcolor,pause.bgcolor)
  assert.match(fb(inst,'control_state',{control:'pause'}).text,/PAUSE/)
  assert.match(fb(inst,'control_state',{control:'stop'}).text,/STOP/)
  inst.state={duration:300,seconds:300,running:true,paused:true}
  assert.match(fb(inst,'start_pause_live').text,/PLAY/)
  assert.match(fb(inst,'control_state',{control:'resume'}).text,/RESUME/)
  assert.match(fb(inst,'control_state',{control:'pause'}).text,/PAUSED/)
  inst.state={duration:0,running:false,paused:false}
  assert.match(fb(inst,'control_state',{control:'stop'}).text,/STOPPED/)
})
test('Clock/Timer toggle and dedicated buttons change labels and colours',()=>{
  const {inst}=setup()
  inst.state={displayMode:'timer',clockFormat:'24'}
  const timer=fb(inst,'clock_button_state',{control:'toggle'})
  assert.match(timer.text,/SHOW\nCLOCK/)
  inst.applyOptimisticCommand('clock_mode',{mode:'clock'})
  const clock=fb(inst,'clock_button_state',{control:'toggle'})
  assert.match(clock.text,/SHOW\nTIMER/)
  assert.notEqual(timer.bgcolor,clock.bgcolor)
  assert.match(fb(inst,'clock_button_state',{control:'show_clock'}).text,/ACTIVE/)
  assert.match(fb(inst,'clock_format_state',{format:'24'}).text,/ACTIVE/)
  inst.applyOptimisticCommand('clock_format',{format:'12'})
  assert.match(fb(inst,'clock_format_state',{format:'12'}).text,/ACTIVE/)
  assert(!fb(inst,'clock_format_state',{format:'24'}).text.includes('ACTIVE'))
})
test('Show/Hide Banner and Flash Banner toggles are wired and report colours',async()=>{
  const {inst,presets}=setup()
  inst.state={bannerVisible:false,flashMessage:false,presenterMessage:'PLEASE WRAP UP'}
  const banner=get(presets,'banner_toggle'), flash=get(presets,'message_flash_toggle')
  assert.equal(banner.steps[0].down[0].actionId,'presenter_message_toggle')
  assert.equal(flash.name,'Flash Banner')
  assert.equal(flash.steps[0].down[0].actionId,'presenter_message_flash')
  const off=fb(inst,'banner_toggle_state')
  assert.match(off.text,/SHOW/)
  await inst.actionDefinitions.presenter_message_toggle.callback({options:{}})
  assert.match(fb(inst,'banner_toggle_state').text,/HIDE/)
  assert.notEqual(off.bgcolor,fb(inst,'banner_toggle_state').bgcolor)
  const flashOff=fb(inst,'banner_flash_state')
  assert.match(flashOff.text,/BANNER\nOFF/)
  await inst.actionDefinitions.presenter_message_flash.callback({options:{op:'toggle'}})
  const flashOn=fb(inst,'banner_flash_state')
  assert.match(flashOn.text,/BANNER\nON/)
  assert.notEqual(flashOff.bgcolor,flashOn.bgcolor)
})
test('All presets reference valid actions, feedbacks and variables',()=>{
  const {inst,presets,vars}=setup()
  const variables=new Set(vars.variables.map(v=>v.id))
  const actions=new Set(Object.keys(inst.actionDefinitions))
  const feedbacks=new Set(Object.keys(inst.feedbackDefinitions))
  const unresolved=[]
  for(const p of presets){
    for(const step of p.steps||[])for(const a of step.down||[])if(!actions.has(a.actionId))unresolved.push(`${p.id}: action ${a.actionId}`)
    for(const f of p.feedbacks||[])if(!feedbacks.has(f.feedbackId))unresolved.push(`${p.id}: feedback ${f.feedbackId}`)
    const text=String(p.style.text||'')
    for(const m of text.matchAll(/\$\(jc-av-timer:([a-zA-Z_]+)\)/g))if(!variables.has(m[1]))unresolved.push(`${p.id}: variable ${m[1]}`)
  }
  assert.deepEqual(unresolved,[])
})


test('An already-placed advanced feedback receives new values after a mode change',async()=>{
  const {inst,sent}=setup()
  inst.browserOnline=true
  inst.state={displayMode:'timer',clockFormat:'24',clockTimeZone:'Pacific/Auckland',duration:300,seconds:61,running:false}
  inst.feedbackInstances.set('button-live',{feedbackId:'live_mode_value',controlId:'page-1-1',options:{field:'time'}})
  inst.feedbackInstances.set('button-mode',{feedbackId:'clock_button_state',controlId:'page-1-2',options:{control:'toggle'}})
  inst.feedbackInstances.set('button-play',{feedbackId:'start_pause_live',controlId:'page-1-3',options:{}})
  inst.publish(true)
  await wait()
  const first=last(sent,'updateFeedbackValues')?.values
  assert.equal(first.find(x=>x.id==='button-live')?.value?.text,'00:01:01')
  assert.equal(first.find(x=>x.id==='button-mode')?.value?.text,'SHOW\nCLOCK')
  inst.state={...inst.state,displayMode:'clock'}
  inst.publish()
  await wait()
  const next=last(sent,'updateFeedbackValues')?.values
  assert.match(next.find(x=>x.id==='button-live')?.value?.text,/^\d\d:\d\d:\d\d$/)
  assert.equal(next.find(x=>x.id==='button-mode')?.value?.text,'SHOW\nTIMER')
})
