'use strict'
const fields = ['formatted','displayTime','hours','minutes','secondsPart','duration','seconds','status','pauseResumeLabel','running','paused','finished','countUp','progressPercent','warningActive','warningLabel','warningColor','warningRemaining','queueLength','queueActive','currentCueIndex','currentCueNumber','currentCueLabel','currentCueDuration','nextCueLabel','nextCueDuration','hasNextCue','warningsEnabled','progressEnabled','gradientEnabled','chromaEnabled','lightEnabled','shadowEnabled','autostart','bannerVisible','bannerText','bannerKind','flashTimer','flashMessage','presenterMessage','remoteViewerCount']
const initial = { formatted:'00:00',displayTime:'00:00',hours:'00',minutes:'00',secondsPart:'00',seconds:0,duration:0,status:'READY',pauseResumeLabel:'START',running:false,paused:false,finished:false,countUp:false,progressPercent:0,queueLength:0,currentCueIndex:-1,currentCueNumber:0,currentCueLabel:'',nextCueLabel:'',hasNextCue:false,warningActive:false,bannerVisible:false,flashTimer:false,flashMessage:false }
function normalize(raw) {
  const state = { ...initial }
  for (const k of fields) if (Object.prototype.hasOwnProperty.call(raw||{},k) && raw[k] != null) state[k] = raw[k]
  state.running=!!state.running;state.paused=!!state.paused;state.countUp=!!state.countUp
  state.seconds=Number(state.seconds)||0;state.duration=Number(state.duration)||0
  state.progressPercent=Math.min(100,Math.max(0,Number(state.progressPercent)||0))
  state.finished=!!state.finished || (!state.countUp && state.duration>0 && state.seconds<0)
  state.status=String(state.status||'READY')
  state.formatted=String(state.formatted||state.displayTime||'00:00')
  state.displayTime=String(state.displayTime||state.formatted)
  // Preserve timer's supplied per-digit strings (including negative HH) rather than modulo by mistake.
  for (const k of ['hours','minutes','secondsPart']) state[k]=String(state[k]??'00')
  return state
}
module.exports={fields,initial,normalize}
