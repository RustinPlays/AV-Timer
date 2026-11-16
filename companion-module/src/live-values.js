// Mode-aware Companion display values. Do not mutate the input timer state.
'use strict'
const pad = n => String(n).padStart(2, '0')
function wallClockParts(zone='UTC', now=Date.now()) {
  const options={hour:'2-digit', minute:'2-digit', second:'2-digit', day:'2-digit', hourCycle:'h23'}
  let parts
  try { parts=new Intl.DateTimeFormat('en-GB',{...options,timeZone:zone||'UTC'}).formatToParts(new Date(now)) }
  catch { parts=new Intl.DateTimeFormat('en-GB',{...options,timeZone:'UTC'}).formatToParts(new Date(now)) }
  const data=Object.fromEntries(parts.map(p=>[p.type,p.value]))
  const hour24=Number(data.hour)||0, hour12=hour24%12||12
  return {day:data.day||'01',hour24:pad(hour24),hour12:pad(hour12),minute:data.minute||'00',second:data.second||'00',
    ampm:hour24>=12?'PM':'AM',time24:`${pad(hour24)}:${data.minute}:${data.second}`,
    time12:`${pad(hour12)}:${data.minute}:${data.second} ${hour24>=12?'PM':'AM'}`}
}
function timerHms(state={}) {
  const numeric = Number(state.seconds)
  if(state.seconds !== undefined && state.seconds !== null && Number.isFinite(numeric)) {
    const whole = Math.max(0,Math.round(Math.abs(numeric)))
    const sign = numeric < 0 ? '-' : ''
    return `${sign}${pad(Math.floor(whole/3600))}:${pad(Math.floor(whole/60)%60)}:${pad(whole%60)}`
  }
  // Older browser payloads can provide displayTime but not numeric seconds.
  const original = String(state.displayTime||state.formatted||'00:00:00')
  const signed = original.startsWith('-') ? '-' : ''
  const parts = original.replace(/^-/, '').split(':')
  if(parts.length===2) return `${signed}00:${parts.map(v=>pad(Number(v)||0)).join(':')}`
  if(parts.length===3) return `${signed}${parts.map(v=>pad(Number(v)||0)).join(':')}`
  return '00:00:00'
}
function modeValues(state={}, now=Date.now()) {
  const clock=wallClockParts(String(state.clockTimeZone||state.display?.clockTimeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'),now)
  const isClock=state.displayMode==='clock', is12=String(state.clockFormat)==='12'
  const t={
    time:timerHms(state),
    days:String(state.days??'00'), hours:String(state.hours??'00'),
    hoursInDay:String(state.hoursInDay??'00'), minutes:String(state.minutes??'00'),
    seconds:String(state.secondsPart??'00'), ampm:''
  }
  const v=isClock?{time:is12?clock.time12:clock.time24,days:clock.day,
    hours:is12?clock.hour12:clock.hour24,hoursInDay:is12?clock.hour12:clock.hour24,
    minutes:clock.minute,seconds:clock.second,ampm:is12?clock.ampm:''}:t
  return {...v,isClock,mode:isClock?'CLOCK':'TIMER',clock,clockFormat:is12?'12':'24'}
}
function playPauseText(state={}) { return !!state.running&&!state.paused&&!state.finished?'Ⅱ\nPAUSE':'▶\nPLAY' }
module.exports={modeValues,playPauseText,wallClockParts,timerHms}
