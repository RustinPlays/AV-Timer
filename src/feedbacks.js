const { combineRgb } = require('../shim')
const WHITE=combineRgb(255,255,255), GREY=combineRgb(48,55,66), GREEN=combineRgb(20,150,75), AMBER=combineRgb(190,120,0), RED=combineRgb(190,30,40), BLUE=combineRgb(20,90,160), CYAN=combineRgb(0,120,150), DARK=combineRgb(24,28,35)

const FEATURE_META={warnings:['warningsEnabled',AMBER,true],progress:['progressEnabled',CYAN,false],gradient:['gradientEnabled',BLUE,true],shadow:['shadowEnabled',BLUE,true],chroma:['chromaEnabled',GREEN,false],banner:['bannerVisible',BLUE,true],flash_timer:['flashTimer',AMBER,false],flash_message:['flashMessage',AMBER,false]}
const st=self=>self.getLiveState?.()||self.state||{}
const on=(self,f)=>{const m=FEATURE_META[f];if(!m)return false;const v=st(self)[m[0]];return v===undefined?m[2]:!!v}
const timerBg=self=>{const s=st(self);if(s.finished||s.status==='OVERTIME')return RED;if(s.paused)return AMBER;if(s.running)return GREEN;return DARK}

module.exports=function(self){
 self.setFeedbackDefinitions({
  duration_matches:{type:'boolean',name:'Loaded duration matches preset',defaultStyle:{bgcolor:GREEN,color:WHITE},options:[{type:'number',id:'seconds',label:'Preset duration (seconds)',default:600,min:0,max:86400}],callback:e=>Math.round(Number(st(self).duration||0))===Math.round(Number(e.options.seconds||0))},
  browser_online:{type:'boolean',name:'Timer browser connected',defaultStyle:{bgcolor:GREEN,color:WHITE},options:[],callback:()=>!!self.browserOnline},
  running:{type:'boolean',name:'Timer running',defaultStyle:{bgcolor:GREEN,color:WHITE},options:[],callback:()=>!!st(self).running&&!st(self).paused},
  paused:{type:'boolean',name:'Timer paused',defaultStyle:{bgcolor:AMBER,color:WHITE},options:[],callback:()=>!!st(self).paused},
  overtime:{type:'boolean',name:'Timer overtime',defaultStyle:{bgcolor:RED,color:WHITE},options:[],callback:()=>st(self).status==='OVERTIME'||!!st(self).finished},
  has_next:{type:'boolean',name:'Queue has a next cue',defaultStyle:{bgcolor:BLUE,color:WHITE},options:[],callback:()=>!!st(self).hasNextCue},
  feature_state:{type:'advanced',name:'Feature state label',options:[{type:'dropdown',id:'feature',label:'Feature',default:'progress',choices:Object.keys(FEATURE_META).map(id=>({id,label:id.replaceAll('_',' ')}))},{type:'textinput',id:'label',label:'Label',default:'FEATURE'}],callback:e=>{const f=String(e.options.feature||''),m=FEATURE_META[f]||['',BLUE,false],v=on(self,f),label=String(e.options.label||f||'FEATURE').toUpperCase();return{text:`${label}\n${v?'ON':'OFF'}`,bgcolor:v?m[1]:GREY,color:WHITE,size:10}}},
  start_pause_state:{type:'advanced',name:'START / PAUSE live button',options:[],callback:()=>{const s=st(self),running=!!s.running&&!s.paused;return{text:running?'PAUSE':'START',bgcolor:running?AMBER:GREEN,color:WHITE,size:13}}},
  display_value:{type:'advanced',name:'Live information display',options:[{type:'dropdown',id:'mode',label:'Value',default:'time',choices:[{id:'time',label:'Timer'},{id:'status',label:'Timer state'},{id:'queue_position',label:'Cue position'},{id:'current_cue',label:'Current cue'},{id:'next_cue',label:'Next cue'},{id:'message',label:'Presenter message'},{id:'viewers',label:'Remote viewers'},{id:'warning',label:'Warning'}]}],callback:e=>{const s=st(self);let text='--';switch(String(e.options.mode||'time')){case'time':text=s.displayTime||s.formatted||'00:00';break;case'status':text=s.status||'READY';break;case'queue_position':text=`Cue ${Number(s.currentCueNumber||0)} of ${Number(s.queueLength||0)}`;break;case'current_cue':text=s.currentCueLabel?`${s.currentCueLabel}\n${self.formatTime(Number(s.currentCueDuration||0))}`:'NO CURRENT CUE';break;case'next_cue':text=s.nextCueLabel?`${s.nextCueLabel}\n${self.formatTime(Number(s.nextCueDuration||0))}`:'NO NEXT CUE';break;case'message':text=s.presenterMessage||'NO MESSAGE';break;case'viewers':text=`VIEWERS\n${Number(s.remoteViewerCount||0)}`;break;case'warning':text=s.warningActive?(s.warningLabel||'WARNING'):'WARNING OFF';break}return{text,bgcolor:timerBg(self),color:WHITE,size:10}}}
 })
}
module.exports.FEATURE_META=FEATURE_META
