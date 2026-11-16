
const test=require('node:test')
const assert=require('node:assert/strict')
const {modeValues,timerHms}=require('../src/live-values')
test('countdown in timer mode always displays full HH:MM:SS',()=>{
  assert.equal(modeValues({displayMode:'timer',seconds:61,displayTime:'01:01'}).time,'00:01:01')
  assert.equal(modeValues({displayMode:'timer',seconds:3723}).time,'01:02:03')
  assert.equal(modeValues({displayMode:'timer',seconds:0}).time,'00:00:00')
  assert.equal(modeValues({displayMode:'timer',displayTime:'05:09'}).time,'00:05:09')
})
test('same value switches immediately to current 24-hour clock and back',()=>{
  const now=Date.parse('2026-11-17T00:00:09Z')
  const base={displayMode:'timer',seconds:3723,clockTimeZone:'Pacific/Auckland',clockFormat:'24'}
  assert.equal(modeValues(base,now).time,'01:02:03')
  assert.equal(modeValues({...base,displayMode:'clock'},now).time,'13:00:09')
  assert.equal(modeValues(base,now).time,'01:02:03')
})
test('same value switches to 12-hour clock and preserves seconds and AM/PM',()=>{
  const now=Date.parse('2026-11-17T00:00:09Z')
  assert.equal(modeValues({displayMode:'clock',clockTimeZone:'Pacific/Auckland',clockFormat:'12'},now).time,'01:00:09 PM')
})

test('packaged preset and feedback drive the SAME button between timer and clock',()=>{
  const fs=require('node:fs')
  const path=require('node:path')
  const os=require('node:os')
  const {execFileSync}=require('node:child_process')
  const {createRequire}=require('node:module')
  const parent=fs.mkdtempSync(path.join(os.tmpdir(),'jc-one-live-'))
  try {
    execFileSync('tar',['-xzf',path.resolve(__dirname,'../../downloads/JC-AV-Timer-Companion-v0.9.7.tgz'),'-C',parent])
    const root=path.join(parent,'pkg')
    const pkgRequire=createRequire(path.join(root,'main.js'))
    let presets,definitions
    const state={displayMode:'timer',seconds:3661,clockTimeZone:'Pacific/Auckland',clockFormat:'24'}
    const module={state,getLiveState(){return this.state},setPresetDefinitions(p){presets=p},setFeedbackDefinitions(x){definitions=x}}
    pkgRequire('./src/presets.js')(module)
    pkgRequire('./src/feedbacks.js')(module)
    const btn=presets.live_time_medium
    assert.equal(btn.style.text,'$(jc-av-timer:live_time)')
    assert.equal(btn.previewStyle,undefined,'fixed preview must never mask the dynamic value')
    assert.deepEqual(definitions.live_mode_value.affectedProperties,['text','bgcolor','color','size'])
    const f=definitions.live_mode_value.callback
    const options=btn.feedbacks[0].options
    assert.equal(f({options}).text,'01:01:01')
    module.state={...state,displayMode:'clock'}
    assert.match(f({options}).text,/^\d\d:\d\d:\d\d$/)
    assert.notEqual(f({options}).text,'01:01:01')
    module.state={...state,displayMode:'timer'}
    assert.equal(f({options}).text,'01:01:01')
  } finally { fs.rmSync(parent,{recursive:true,force:true}) }
})
