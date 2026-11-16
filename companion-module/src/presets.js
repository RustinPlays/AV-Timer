const { combineRgb } = require('../shim')
const C = {
  white:combineRgb(255,255,255), green:combineRgb(18,132,72),
  red:combineRgb(178,38,52), amber:combineRgb(166,105,12),
  blue:combineRgb(27,83,148), cyan:combineRgb(23,108,140),
  purple:combineRgb(95,71,147), grey:combineRgb(54,63,76), dark:combineRgb(25,32,42)
}
const GROUP={
  playback:'JC 01 · Start / Pause / Stop',set:'JC 02 · Set Time',
  add:'JC 03 · Add Time (+)',minus:'JC 04 · Remove Time (-)',
  live:'JC 05 · Live Display · Auto Clock / Timer',clock:'JC 06 · Clock',
  queue:'JC 07 · Cue Queue',queueAdd:'JC 08 · Add To Queue',
  messages:'JC 09 · Messages / Banner',appearance:'JC 10 · Appearance',
  status:'JC 11 · Feedbacks / Status'
}
const TIMES=[['1m',60],['2m',120],['3m',180],['5m',300],['10m',600],['15m',900],['20m',1200],['30m',1800],['45m',2700],['60m',3600]]
const ref=id=>`$(jc-av-timer:${id})`
const fb=(feedbackId,bgcolor)=>({feedbackId,options:{},style:{bgcolor,color:C.white}})
const advanced=(feedbackId,options={})=>({feedbackId,options,style:{}})
const timerFeedbacks=()=>[
  fb('running',C.green), fb('paused',C.amber),
  fb('warning_active',C.amber),fb('finished',C.red)
]
function button(category,name,text,bg,actionId=null,options={},feedbacks=[],size=11,preview=null) {
  const s=String(size)
  return {type:'button',category,name,style:{text,size:s,color:C.white,bgcolor:bg},
    ...(preview==null?{}:{previewStyle:{text:preview,size:s,color:C.white,bgcolor:bg}}),
    steps:[{down:actionId?[{actionId,options}]:[],up:[]}],feedbacks}
}
function live(p,key,name,variable,_preview,size=13,field='time'){
  // No fixed previewStyle: Companion 5.x may copy it onto a placed button.
  // The button's one text field always reads the same live mode-aware variable.
  p[key]=button(GROUP.live,name,ref(variable),C.dark,null,{},
    [{feedbackId:'live_mode_value',options:{field},style:{}}],size,null)
}
function toggle(p,key,name,label,variable,feedbackId,color= C.blue,feature=null){
  p[key]=button(GROUP.appearance,name,`${label}\n${ref(variable)}`,C.grey,'feature',
    {feature:feature||key.replace(/_toggle$/,'')},[fb(feedbackId,color)],9,label)
}
module.exports=function registerPresets(self){
  const p={}
  // Playback; preserve established preset ids to avoid breaking custom layouts.
  p.start=button(GROUP.playback,'Start / Resume','START',C.green,'start',{},[advanced('control_state',{control:'start'})],10)
  p.pause_resume=button(GROUP.playback,'PLAY / PAUSE · Live','▶\nPLAY',C.green,'toggle',{},[advanced('start_pause_live')],11)
  p.reset=button(GROUP.playback,'Reset Timer','RESET',C.blue,'reset',{},[advanced('control_state',{control:'reset'})],10)
  p.stop=button(GROUP.playback,'Stop / Clear','STOP',C.red,'stop',{},[advanced('control_state',{control:'stop'})],10)

  p.pause=button(GROUP.playback,'Pause only','Ⅱ\nPAUSE',C.amber,'pause',{},[advanced('control_state',{control:'pause'})],10)
  p.resume=button(GROUP.playback,'Resume only','▶\nRESUME',C.green,'resume',{},[advanced('control_state',{control:'resume'})],10)

  // Full timer presets, together by operation.
  for (const [label,seconds] of TIMES) {
    p[`set_${seconds}`]=button(GROUP.set,`Set ${label}`,`SET\n${label}`,C.blue,'set_preset',{seconds},[],11)
  }
  for (const [label,seconds] of TIMES) {
    p[`add_${seconds}`]=button(GROUP.add,`Add ${label}`,`+${label}`,C.green,'add_preset',{seconds},[],12)
  }
  for (const [label,seconds] of TIMES) {
    p[`sub_${seconds}`]=button(GROUP.minus,`Remove ${label}`,`−${label}`,C.red,'subtract_preset',{seconds},[],12)
  }
  for (const [label,seconds] of TIMES) {
    p[`start_${seconds}`]=button(GROUP.playback,`Start ${label}`,`START\n${label}`,C.green,'start_preset',{seconds},[],10)
  }

  // Auto-follow the operator's chosen mode, with a dedicated advanced feedback.
  // Keep established preset IDs so v0.9.5 layouts can be re-dragged easily.
  live(p,'live_time_small','LIVE Timer ↔ Clock · Compact','live_time','00:00:00',10,'time')
  live(p,'live_time_medium','LIVE Timer ↔ Clock · Standard','live_time','00:00:00',12,'time')
  live(p,'live_time_large','LIVE Timer ↔ Clock · Large','live_time','00:00:00',14,'time')
  live(p,'dd','AUTO Days · DD','live_days','DD',13,'days')
  live(p,'hh','AUTO Hours · HH','live_hours','HH',13,'hours')
  live(p,'hh_day','AUTO Hours after days','live_hours_in_day','HH',13,'hoursInDay')
  live(p,'mm','AUTO Minutes · MM','live_minutes','MM',13,'minutes')
  live(p,'ss','AUTO Seconds · SS','live_seconds','SS',13,'seconds')
  live(p,'ampm','AUTO AM / PM','live_ampm','AM/PM',11,'ampm')
  live(p,'mode','AUTO Current mode','live_mode','TIMER',10,'mode')
  // Total timer fields remain timer-only; original variables remain available.
  p.total_hours=button(GROUP.live,'Timer total hours',ref('total_hours'),C.dark,null,{},timerFeedbacks(),11,'HRS')
  p.total_minutes=button(GROUP.live,'Timer total minutes',ref('total_minutes'),C.dark,null,{},timerFeedbacks(),11,'MINS')
  p.total_seconds=button(GROUP.live,'Timer total seconds',ref('total_seconds'),C.dark,null,{},timerFeedbacks(),11,'SECS')
  p.status=button(GROUP.live,'Timer status',ref('status'),C.dark,null,{},timerFeedbacks(),10,'READY')
  p.connection=button(GROUP.live,'Timer connection',ref('connection_status'),C.dark,null,{},[fb('browser_online',C.green)],9,'CONNECTED')
  p.warning_label=button(GROUP.live,'Warning text',ref('warning_display'),C.dark,null,{},[fb('warning_active',C.amber)],10,'WARNING')

  // Clock mode and wall-clock variables, including seconds.
  p.clock_live=button(GROUP.clock,'Live wall clock',ref('clock_time'),C.dark,null,{},[fb('clock_mode',C.blue)],13,'12:34:56')
  p.clock_live_24=button(GROUP.clock,'Live 24-hour clock',ref('clock_time_24'),C.dark,null,{},[],13,'13:34:56')
  p.clock_live_12=button(GROUP.clock,'Live 12-hour clock',ref('clock_time_12'),C.dark,null,{},[],12,'01:34:56 PM')
  p.clock_toggle=button(GROUP.clock,'Toggle Clock / Timer','SHOW\nCLOCK',C.blue,'clock_toggle',{},[advanced('clock_button_state',{control:'toggle'})],10)
  p.clock_show=button(GROUP.clock,'Show Clock','SHOW CLOCK',C.blue,'clock_show',{},[advanced('clock_button_state',{control:'show_clock'})],10)
  p.timer_show=button(GROUP.clock,'Show Timer','SHOW TIMER',C.grey,'timer_show',{},[advanced('clock_button_state',{control:'show_timer'})],10)
  p.clock_24=button(GROUP.clock,'24 Hour Clock','24H CLOCK',C.cyan,'clock_format',{format:'24'},[advanced('clock_format_state',{format:'24'})],10)
  p.clock_12=button(GROUP.clock,'12 Hour Clock','12H CLOCK',C.cyan,'clock_format',{format:'12'},[advanced('clock_format_state',{format:'12'})],10)

  // Queue grouped separately from queue time add buttons.
  p.queue_toggle=button(GROUP.queue,'Queue enabled',`QUEUE\n${ref('queue_state')}`,C.grey,'feature',{feature:'queue'},[fb('queue_enabled',C.blue)],9,'QUEUE')
  p.auto_next_toggle=button(GROUP.queue,'Queue auto next',`AUTO NEXT\n${ref('auto_next_state')}`,C.grey,'feature',{feature:'auto_next'},[fb('auto_next',C.blue)],9,'AUTO NEXT')
  p.queue_start=button(GROUP.queue,'Start queue','START QUEUE',C.green,'queue_start',{},[advanced('control_state',{control:'queue_start'})],10)
  p.queue_next=button(GROUP.queue,'Next cue','NEXT CUE',C.blue,'next',{},[advanced('control_state',{control:'next'})],10)
  p.queue_remove_last=button(GROUP.queue,'Remove last cue','REMOVE LAST',C.amber,'queue_remove_last',{},[],9)
  p.queue_clear=button(GROUP.queue,'Clear cue queue','CLEAR QUEUE',C.red,'queue_clear',{},[advanced('control_state',{control:'queue_clear'})],9)
  p.queue_count=button(GROUP.queue,'Queued count',`QUEUE\n${ref('queue_length')}`,C.dark,null,{},[fb('queue_enabled',C.blue)],12,'QUEUE')
  p.queue_name=button(GROUP.queue,'Queue name',ref('queue_name'),C.dark,null,{},[],10,'QUEUE NAME')
  p.current_item=button(GROUP.queue,'Current cue',ref('current_item'),C.dark,null,{},[],9,'CURRENT CUE')
  p.next_item=button(GROUP.queue,'Next cue label',ref('next_item'),C.dark,null,{},[],9,'NEXT CUE')
  for (const [label,seconds] of TIMES) {
    p[`queue_add_${seconds}`]=button(GROUP.queueAdd,`Queue + ${label}`,`QUEUE +\n${label}`,C.green,'queue_add_preset',{seconds},[],9)
  }

  // One-press presenter messages, designed for the lower-third/banner output.
  // Presets are grouped by purpose so the user can drag and drop cleanly.
  const quickMessages=[
    ['message_standby','Stand by','PLEASE STAND BY',C.blue],
    ['message_5_min','5 minutes remaining','5 MINUTES REMAINING',C.blue],
    ['message_2_min','2 minutes remaining','2 MINUTES REMAINING',C.amber],
    ['message_1_min','1 minute remaining','1 MINUTE REMAINING',C.amber],
    ['message_30_sec','30 seconds remaining','30 SECONDS REMAINING',C.amber],
    ['message_wrap','Please wrap up','PLEASE WRAP UP',C.amber],
    ['message_time','Time is up','TIME IS UP',C.red],
    ['message_thanks','Thank you','THANK YOU',C.green],
    ['message_ready','Presenter ready','PRESENTER READY',C.blue],
    ['message_go','Go live','GO LIVE',C.green],
  ]
  for(const [id,label,body,col] of quickMessages){
    p[id]=button(GROUP.messages,label,label.toUpperCase().replaceAll(' ','\n').slice(0,45),col,
      'presenter_message',{text:body,show:true,flash:false,mode:'banner'},[advanced('message_preset_state',{message:body,colour:col===C.green?'green':col===C.red?'red':col===C.amber?'amber':'blue'})],9);
  }
  // Retain original preset id for older user's layouts.
  p.message_show=button(GROUP.messages,'Quick Wrap Up (legacy)','WRAP UP',C.amber,'presenter_message',
    {text:'PLEASE WRAP UP',show:true,flash:false,mode:'banner'},[],10)
  p.banner_toggle=button(GROUP.messages,'Show / Hide Banner · Live','SHOW\nBANNER',C.green,'presenter_message_toggle',{},[advanced('banner_toggle_state')],10)
  p.banner_show=button(GROUP.messages,'Show existing banner','SHOW BANNER',C.green,'presenter_message_show',{},[advanced('banner_action_state',{control:'show'})],9)
  p.message_hide=button(GROUP.messages,'Hide message/banner','HIDE BANNER',C.grey,'presenter_message_hide',{},[advanced('banner_action_state',{control:'hide'})],9)
  p.message_clear=button(GROUP.messages,'Clear message','CLEAR TEXT',C.red,'presenter_message_clear',{},[advanced('banner_action_state',{control:'clear'})],9)
  p.message_flash_toggle=button(GROUP.messages,'Flash Banner','FLASH\nBANNER',C.amber,'presenter_message_flash',{op:'toggle'},[advanced('banner_flash_state',{mode:'toggle'})],9)
  p.message_flash_on=button(GROUP.messages,'Flash Banner · On','FLASH\nON',C.amber,'presenter_message_flash',{op:'on'},[advanced('banner_flash_state',{mode:'on'})],9)
  p.message_flash_off=button(GROUP.messages,'Flash Banner · Off','FLASH\nOFF',C.grey,'presenter_message_flash',{op:'off'},[advanced('banner_flash_state',{mode:'off'})],9)
  p.message_state=button(GROUP.messages,'Banner visible status',ref('message_state'),C.dark,null,{},[fb('message_visible',C.blue)],10)
  p.message_text=button(GROUP.messages,'Current banner text',ref('message_text'),C.dark,null,{},[fb('message_visible',C.blue)],9,'MESSAGE')

  const features=[
    ['warnings_toggle','Warning toggled','WARNINGS','warnings_state','warnings_enabled',C.amber,'warnings'],
    ['progress_toggle','Progress bar toggled','PROGRESS','progress_state','progress_enabled',C.cyan,'progress'],
    ['gradient_toggle','Gradient toggled','GRADIENT','gradient_state','gradient_enabled',C.blue,'gradient'],
    ['minimal_toggle','Minimal toggled','MINIMAL','minimal_state','minimal_enabled',C.purple,'minimal'],
    ['chroma_toggle','Chroma toggled','CHROMA','chroma_state','chroma_enabled',C.green,'chroma'],
    ['light_toggle','Light output toggled','LIGHT','light_state','light_enabled',C.blue,'light'],
    ['count_up_toggle','Count-up toggled','COUNT UP','count_up_state','count_up',C.purple,'count_up'],
    ['autostart_toggle','Auto-start toggled','AUTO START','autostart_state','autostart',C.green,'autostart'],
    ['timer_flash_toggle','Timer flash toggled','FLASH TIMER','timer_flash_state','timer_flash',C.red,'timer_flash'],
  ]
  for(const [id,name,label,variable,feedback,color,feature] of features){toggle(p,id,name,label,variable,feedback,color,feature)}
  for(const [label,scale] of [['Small',0.75],['Medium',1],['Large',1.25],['XL',1.5],['XXL',1.8]]){
    p[`size_${String(scale).replace('.','_')}`]=button(GROUP.appearance,`Timer size: ${label}`,`SIZE ${label.toUpperCase()}`,C.blue,'output_size',{scale},[],9)
  }

  p.running_status=button(GROUP.status,'Running feedback','RUNNING',C.dark,null,{},[fb('running',C.green)],10)
  p.paused_status=button(GROUP.status,'Paused feedback','PAUSED',C.dark,null,{},[fb('paused',C.amber)],10)
  p.time_status=button(GROUP.status,'Time reached feedback','TIME',C.dark,null,{},[fb('finished',C.red)],10)
  p.warning_status=button(GROUP.status,'Warning active','WARNING',C.dark,null,{},[fb('warning_active',C.amber)],10)
  p.network_viewers=button(GROUP.status,'LAN viewers',ref('network_viewers'),C.dark,null,{},[],11,'VIEWERS')
  self.setPresetDefinitions(p)
}
