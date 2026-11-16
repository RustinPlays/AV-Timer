'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {createRequire}=require('node:module')
const os=require('node:os')
const {spawnSync}=require('node:child_process')
const {modeValues,playPauseText,wallClockParts}=require('../src/live-values.js')
const archive=path.resolve(__dirname,'../../downloads/JC-AV-Timer-Companion-v0.9.6.tgz')
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'jc-av-timer-test-'))
const extracted=spawnSync('tar',['-xzf',archive,'-C',tmp],{encoding:'utf8'})
assert.equal(extracted.status,0,extracted.stderr)
const packageRoot=path.join(tmp,'pkg')
const pkgrequire=createRequire(path.join(packageRoot,'main.js'))
const {modeValues:packagedMode,playPauseText:packagedPlay}=pkgrequire('./src/live-values.js')
function loadPackagedInstance(){
  let main=fs.readFileSync(path.join(packageRoot,'main.js'),'utf8')
  const marker='new Runtime().start().catch(err=>{'
  assert(main.includes(marker),'Cannot locate packaged main runtime bootstrap')
  main=main.slice(0,main.indexOf(marker))+'module.exports={JCAVTimerInstance,Runtime}\n'
  const mod={exports:{}}
  const init=new Function('require','module','exports',main)
  init(pkgrequire,mod,mod.exports)
  const calls=[]
  const fake={sendNoCb:(name,data)=>calls.push([name,data])}
  const instance=new mod.exports.JCAVTimerInstance(fake)
  instance.updateDefinitions()
  return {instance,calls}
}
const example={displayMode:'timer',clockFormat:'24',clockTimeZone:'Pacific/Auckland',displayTime:'25:01:01',days:'01',hours:'25',hoursInDay:'01',minutes:'01',secondsPart:'01',running:false,paused:false}
const instant=Date.parse('2026-11-17T00:00:09Z')
test('AUTO values show timer fields while timer mode is selected',()=>{
  const v=modeValues(example,instant)
  assert.equal(v.mode,'TIMER');assert.equal(v.time,'25:01:01')
  assert.equal(v.days,'01');assert.equal(v.hours,'25');assert.equal(v.minutes,'01');assert.equal(v.seconds,'01');assert.equal(v.ampm,'')
})
test('AUTO values change to the current NZ 24-hour clock, seconds and day of month',()=>{
  const v=modeValues({...example,displayMode:'clock'},instant)
  assert.equal(v.mode,'CLOCK');assert.equal(v.time,'13:00:09')
  assert.equal(v.days,'17');assert.equal(v.hours,'13');assert.equal(v.minutes,'00');assert.equal(v.seconds,'09');assert.equal(v.ampm,'')
})
test('AUTO values use 12-hour hour and AM/PM in clock mode',()=>{
  const v=modeValues({...example,displayMode:'clock',clockFormat:'12'},instant)
  assert.equal(v.time,'01:00:09 PM');assert.equal(v.hours,'01');assert.equal(v.ampm,'PM')
})
test('Clock format gracefully falls back for invalid timezone',()=>{
  const v=wallClockParts('Not/AZone',instant)
  assert.match(v.time24,/^\d{2}:\d{2}:\d{2}$/)
})
test('Play/Pause text is PLAY when idle or paused and PAUSE when running',()=>{
  assert.match(playPauseText({running:false}),/PLAY/)
  assert.match(playPauseText({running:true,paused:true}),/PLAY/)
  assert.match(playPauseText({running:true,paused:false}),/PAUSE/)
})
test('Source and packaged auto-formatters agree',()=>{
  for(const mode of ['clock','timer'])for(const format of ['12','24']){
    const s={...example,displayMode:mode,clockFormat:format}
    assert.deepEqual(packagedMode(s,instant),modeValues(s,instant))
    assert.equal(packagedPlay(s),playPauseText(s))
  }
})
test('Every AUTO preset has dynamic advanced feedback; Play/Pause feedback is attached',()=>{
  const {instance}=loadPackagedInstance()
  const p=instance.actionDefinitions;const defs=instance.feedbackDefinitions
  let presets={}
  instance.setPresetDefinitions=xs=>{presets=xs}
  pkgrequire('./src/presets.js')(instance)
  assert(presets.pause_resume.feedbacks.some(f=>f.feedbackId==='start_pause_live'))
  assert(presets.pause_resume.steps[0].down[0].actionId==='toggle')
  for(const key of ['live_time_small','live_time_medium','live_time_large','dd','hh','hh_day','mm','ss','ampm','mode']){
    assert(presets[key].feedbacks.some(f=>f.feedbackId==='live_mode_value'),`missing auto feedback: ${key}`)
  }
  assert.equal(defs.live_mode_value.type,'advanced')
  assert.equal(defs.start_pause_live.type,'advanced')
  assert.equal(presets.message_hide.category,presets.message_show.category)
  assert(presets.message_flash_toggle.steps[0].down[0].actionId==='presenter_message_flash')
  for(const preset of Object.values(presets)){
    for(const down of preset.steps.flatMap(x=>x.down))assert(p[down.actionId],`Undefined action ${down.actionId}`)
    for(const f of preset.feedbacks)assert(defs[f.feedbackId],`Undefined feedback ${f.feedbackId}`)
  }
})
test('Companion feedback returns green PLAY, amber PAUSE and mode-responsive live text',()=>{
  const {instance}=loadPackagedInstance()
  const play=instance.feedbackDefinitions.start_pause_live.callback
  const auto=instance.feedbackDefinitions.live_mode_value.callback
  instance.state={...example,seconds:90061,duration:90061,running:true,paused:false}
  assert.match(play().text,/PAUSE/)
  const runningColor=play().bgcolor
  instance.state.paused=true
  assert.match(play().text,/PLAY/)
  assert.notEqual(play().bgcolor,runningColor)
  instance.state.displayMode='clock';instance.state.clockFormat='12'
  const clock=auto({options:{field:'hours'}})
  assert.match(clock.text,/^\d\d$/)
  assert.equal(clock.size,14)
  instance.state.displayMode='timer'
  assert.equal(auto({options:{field:'hours'}}).text,'25')
})
test('Banner actions actually send show / hide / clear / flash and quick-message events',async()=>{
  const {instance}=loadPackagedInstance()
  const events=[]
  instance.command=(cmd,args)=>events.push({cmd,args})
  await instance.actionDefinitions.presenter_message_show.callback({options:{}})
  await instance.actionDefinitions.presenter_message_hide.callback({options:{}})
  await instance.actionDefinitions.presenter_message_clear.callback({options:{}})
  await instance.actionDefinitions.presenter_message_flash.callback({options:{op:'on'}})
  await instance.actionDefinitions.presenter_message.callback({options:{text:'PLEASE WRAP UP',show:true,flash:false}})
  assert.deepEqual(events.map(x=>x.cmd),['message_show','message_hide','message_clear','flash_message','message','flash_message'])
  assert.equal(events[4].args.text,'PLEASE WRAP UP')
})
test('Packaged runtime publishes the correct selected-mode variables',()=>{
  const {instance}=loadPackagedInstance()
  instance.state={...example,seconds:90061,duration:90061,running:false,paused:true}
  instance.publish(true)
  assert.equal(instance.lastValues.live_mode,'TIMER')
  assert.equal(instance.lastValues.live_hours,'25')
  assert.equal(instance.lastValues.live_days,'01')
  assert.match(instance.lastValues.play_pause_text,/PLAY/)
  instance.state.displayMode='clock'
  instance.publish(true)
  assert.equal(instance.lastValues.live_mode,'CLOCK')
  assert.match(instance.lastValues.live_time,/^\d\d:\d\d:\d\d$/)
  instance.state.clockFormat='12'
  instance.publish(true)
  assert.match(instance.lastValues.live_time,/\b(?:AM|PM)$/)
})
