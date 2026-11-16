'use strict'
const fields = ['formatted','displayTime','days','hours','hoursInDay','minutes','secondsPart','totalHours','totalMinutes','totalSeconds','duration','seconds','status','pauseResumeLabel','running','paused','finished','countUp','progressPercent','warningActive','warningLabel','warningColor','warningRemaining','queueLength','queueActive','currentCueIndex','currentCueNumber','currentCueLabel','currentCueDuration','nextCueLabel','nextCueDuration','hasNextCue','warningsEnabled','progressEnabled','gradientEnabled','chromaEnabled','lightEnabled','shadowEnabled','autostart','bannerVisible','bannerText','bannerKind','flashTimer','flashMessage','presenterMessage','remoteViewerCount','displayMode','clockFormat','clockTime','clockTime24','clockTime12','clockTimeZone','live_time','live_days','live_hours','live_hours_in_day','live_minutes','live_seconds','live_ampm','live_mode','play_pause_text']
const initial = { formatted:'00:00',displayTime:'00:00',days:'00',hours:'00',hoursInDay:'00',minutes:'00',secondsPart:'00',totalHours:'00',totalMinutes:'00',totalSeconds:'0',seconds:0,duration:0,status:'READY',displayMode:'timer',clockFormat:'24',clockTime:'00:00:00',clockTime24:'00:00:00',clockTime12:'12:00:00 AM',clockTimeZone:'UTC',live_time:'00:00',live_days:'00',live_hours:'00',live_hours_in_day:'00',live_minutes:'00',live_seconds:'00',live_ampm:'',live_mode:'TIMER',play_pause_text:'▶ PLAY',pauseResumeLabel:'START',running:false,paused:false,finished:false,countUp:false,progressPercent:0,queueLength:0,currentCueIndex:-1,currentCueNumber:0,currentCueLabel:'',nextCueLabel:'',hasNextCue:false,warningActive:false,bannerVisible:false,flashTimer:false,flashMessage:false }
function normalize(raw) {
  const state = { ...initial }
  for (const k of fields) if (Object.prototype.hasOwnProperty.call(raw||{},k) && raw[k] != null) state[k] = raw[k]
  state.running=!!state.running;state.paused=!!state.paused;state.countUp=!!state.countUp
  state.seconds=Number(state.seconds)||0;state.duration=Number(state.duration)||0
  state.progressPercent=Math.min(100,Math.max(0,Number(state.progressPercent)||0))
  state.finished=!!state.finished || (!state.countUp && state.duration>0 && state.seconds<0)
  state.displayMode=state.displayMode==='clock'?'clock':'timer';state.clockFormat=String(state.clockFormat)==='12'?'12':'24';
  for(const k of ['clockTime','clockTime24','clockTime12','clockTimeZone','live_time','live_days','live_hours','live_hours_in_day','live_minutes','live_seconds','live_ampm','live_mode','play_pause_text']) state[k]=String(state[k]||'');
  state.status=String(state.status||'READY')
  state.formatted=String(state.formatted||state.displayTime||'00:00')
  state.displayTime=String(state.displayTime||state.formatted)
  // Preserve timer's supplied per-digit strings (including negative HH) rather than modulo by mistake.
  for (const k of ['days','hours','hoursInDay','minutes','secondsPart','totalHours','totalMinutes','totalSeconds']) state[k]=String(state[k]??'00')
  return state
}
function liveTimeParts(seconds) {
  // Components are derived from the same seconds value used for the countdown.
  // Preserve the original hours field as *total* hours for backwards compatibility.
  const n=Math.floor(Math.abs(Number(seconds)||0));
  const pad=value=>String(value).padStart(2,'0');
  return {days:pad(Math.floor(n/86400)),hours:pad(Math.floor(n/3600)),
    hoursInDay:pad(Math.floor(n/3600)%24),minutes:pad(Math.floor(n/60)%60),
    secondsPart:pad(n%60),totalHours:pad(Math.floor(n/3600)),
    totalMinutes:String(Math.floor(n/60)),totalSeconds:String(n)};
}
module.exports={fields,initial,normalize,liveTimeParts}
