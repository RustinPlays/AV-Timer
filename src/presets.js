const { combineRgb } = require('../shim')
const WHITE=combineRgb(255,255,255), GREY=combineRgb(48,55,66), GREEN=combineRgb(20,135,68), AMBER=combineRgb(170,105,0), RED=combineRgb(170,35,45), BLUE=combineRgb(20,90,160), DARK=combineRgb(24,28,35), CYAN=combineRgb(0,115,145)
const TIMES=[['1m',60],['2m',120],['5m',300],['10m',600],['15m',900],['30m',1800],['45m',2700],['60m',3600]]
const button=(category,name,text,bg,actionId=null,options={},feedbacks=[],size='11')=>({type:'button',category,name,style:{text,size:String(size),color:WHITE,bgcolor:bg},steps:[{down:actionId?[{actionId,options}]:[],up:[]}],feedbacks})
const live=(p,id,name,label,mode,size='12')=>{p[id]=button('JC · Info',name,label,DARK,null,{},[{feedbackId:'display_value',options:{mode},style:{}}],size)}
const toggle=(p,id,label,feature,color=BLUE)=>{p[id]=button('JC · Display',`${label} Toggle`,label,GREY,'feature',{feature},[{feedbackId:'feature_state',options:{feature,label},style:{}}],'9')}
module.exports=function(self){const p={}
 p.start_pause=button('JC · Transport','Start / Pause','START',GREEN,'start_pause',{},[{feedbackId:'start_pause_state',options:{},style:{}}],'13')
 p.reset=button('JC · Transport','Reset','RESET',BLUE,'reset',{},[],'12')
 p.stop=button('JC · Transport','Stop to Zero','STOP',RED,'stop',{},[],'12')
 p.next=button('JC · Transport','Next Cue','NEXT CUE',BLUE,'next',{},[{feedbackId:'has_next',options:{},style:{}}],'11')
 p.flash_timer=button('JC · Attention','Flash Timer','FLASH TIMER',GREY,'flash_timer',{},[{feedbackId:'feature_state',options:{feature:'flash_timer',label:'FLASH TIMER'},style:{}}],'9')
 p.flash_message=button('JC · Attention','Flash Message','FLASH MSG',GREY,'flash_message',{},[{feedbackId:'feature_state',options:{feature:'flash_message',label:'FLASH MSG'},style:{}}],'9')
 live(p,'live_timer','Live Timer','TIMER','time','20');live(p,'timer_state','Timer State','STATE','status','11');live(p,'queue_position','Queue Position','CUE','queue_position','11');live(p,'current_cue','Current Cue','CURRENT CUE','current_cue','9');live(p,'next_cue','Next Cue','NEXT CUE','next_cue','9');live(p,'presenter_message','Presenter Message','MESSAGE','message','8');live(p,'remote_viewers','Remote Viewers','VIEWERS','viewers','11');live(p,'warning','Warning','WARNING','warning','9')
 for(const [label,seconds] of TIMES){p[`set_${seconds}`]=button('JC · Set Time',`Set ${label}`,`SET\n${label}`,GREY,'set_preset',{seconds},[{feedbackId:'duration_matches',options:{seconds},style:{}}],'11');p[`add_${seconds}`]=button('JC · Adjust Time',`Add ${label}`,`+${label}`,GREEN,'add_preset',{seconds},[],'14');p[`sub_${seconds}`]=button('JC · Adjust Time',`Remove ${label}`,`−${label}`,RED,'subtract_preset',{seconds},[],'14')}
 p.queue_play=button('JC · Queue','Play Cue by Number','PLAY CUE',BLUE,'queue_play',{cue:1},[],'10');p.queue_clear=button('JC · Queue','Clear Queue','CLEAR QUEUE',RED,'queue_clear',{},[],'9')
 p.banner=button('JC · Presenter','Show / Hide Banner','BANNER',GREY,'message_toggle',{},[{feedbackId:'feature_state',options:{feature:'banner',label:'BANNER'},style:{}}],'9')
 p.clear_message=button('JC · Presenter','Clear Message','CLEAR MSG',RED,'message_clear',{},[],'9')
 const msgs=[['wrap_soon','Wrap Up Soon','Please wrap up soon'],['wrap_now','Wrap Up Now','Please wrap up now'],['please_wait','Please Wait','Please wait'],['speak_louder','Speak Louder','Please speak louder'],['move_mic','Move Closer to Mic','Please move closer to the microphone'],['thank_you','Thank You','Thank you']]
 for(const [id,label,text] of msgs)p[id]=button('JC · Presenter',label,label.toUpperCase(),AMBER,'message',{text},[],'8')
 toggle(p,'warnings','WARNINGS','warnings',AMBER);toggle(p,'progress','PROGRESS','progress',CYAN);toggle(p,'gradient','GRADIENT','gradient',BLUE);toggle(p,'shadow','SHADOW','shadow',BLUE);toggle(p,'chroma','CHROMA','chroma',GREEN)
 self.setPresetDefinitions(p)}
