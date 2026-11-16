const { combineRgb } = require('../shim')
const {modeValues,playPauseText} = require('./live-values')

const WHITE=combineRgb(255,255,255)
const GREEN=combineRgb(20,150,75)
const AMBER=combineRgb(190,120,0)
const RED=combineRgb(190,30,40)
const BLUE=combineRgb(20,90,160)
const CYAN=combineRgb(0,120,150)
const PURPLE=combineRgb(105,65,160)

const FEATURE_META = {
  queue:      {state:'queueEnabled',     color:BLUE},
  warnings:   {state:'warningsEnabled',  color:AMBER, defaultOn:true},
  progress:   {state:'progressEnabled',  color:CYAN},
  gradient:   {state:'gradientEnabled',  color:BLUE, defaultOn:true},
  minimal:    {state:'minimalEnabled',   color:PURPLE},
  chroma:     {state:'chromaEnabled',    color:GREEN},
  light:      {state:'lightEnabled',     color:BLUE},
  timer_flash:{state:'timerFlash',        color:RED},
  auto_next:  {state:'autoNext',         color:BLUE},
  autostart:  {state:'autostart',        color:GREEN, defaultOn:true},
  count_up:   {state:'countUp',          color:PURPLE}
}

function live(self){ return self.getLiveState?.() || self.state || {} }
function featureOn(self, feature){
  const meta=FEATURE_META[feature]
  if(!meta) return false
  const v=live(self)?.[meta.state]
  return v === undefined ? !!meta.defaultOn : !!v
}

module.exports = function(self) {
  self.setFeedbackDefinitions({
    clock_mode:{type:'boolean',name:'Clock is visible on output',defaultStyle:{bgcolor:BLUE,color:WHITE},options:[],callback:()=>live(self).displayMode==='clock'},
    bridge_online:{type:'boolean',name:'Timer browser connected (legacy id)',defaultStyle:{bgcolor:BLUE,color:WHITE},options:[],callback:()=>!!self.browserOnline},
    browser_online:{type:'boolean',name:'Timer browser connected',defaultStyle:{bgcolor:GREEN,color:WHITE},options:[],callback:()=>!!self.browserOnline},

    running:{type:'boolean',name:'Timer is running',defaultStyle:{bgcolor:GREEN,color:WHITE},options:[],callback:()=>{const s=live(self);return !!s.running&&!s.paused}},
    paused:{type:'boolean',name:'Timer is paused',defaultStyle:{bgcolor:AMBER,color:WHITE},options:[],callback:()=>!!live(self).paused},
    warning_active:{type:'boolean',name:'Custom warning is active',defaultStyle:{bgcolor:AMBER,color:WHITE},options:[],callback:()=>!!live(self).warningActive},
    finished:{type:'boolean',name:'Timer is at TIME',defaultStyle:{bgcolor:RED,color:WHITE},options:[],callback:()=>!!live(self).finished},

    queue_enabled:{type:'boolean',name:'Queue is enabled',defaultStyle:{bgcolor:BLUE,color:WHITE},options:[],callback:()=>featureOn(self,'queue')},
    warnings_enabled:{type:'boolean',name:'Warnings are enabled',defaultStyle:{bgcolor:AMBER,color:WHITE},options:[],callback:()=>featureOn(self,'warnings')},
    progress_enabled:{type:'boolean',name:'Progress bar is enabled',defaultStyle:{bgcolor:CYAN,color:WHITE},options:[],callback:()=>featureOn(self,'progress')},
    gradient_enabled:{type:'boolean',name:'Gradient is enabled',defaultStyle:{bgcolor:BLUE,color:WHITE},options:[],callback:()=>featureOn(self,'gradient')},
    minimal_enabled:{type:'boolean',name:'Minimal output is enabled',defaultStyle:{bgcolor:PURPLE,color:WHITE},options:[],callback:()=>featureOn(self,'minimal')},
    chroma_enabled:{type:'boolean',name:'Chroma output is enabled',defaultStyle:{bgcolor:GREEN,color:WHITE},options:[],callback:()=>featureOn(self,'chroma')},
    light_enabled:{type:'boolean',name:'Light output is enabled',defaultStyle:{bgcolor:BLUE,color:WHITE},options:[],callback:()=>featureOn(self,'light')},
    auto_next:{type:'boolean',name:'Queue auto-next is enabled',defaultStyle:{bgcolor:BLUE,color:WHITE},options:[],callback:()=>featureOn(self,'auto_next')},
    autostart:{type:'boolean',name:'Auto start is enabled',defaultStyle:{bgcolor:GREEN,color:WHITE},options:[],callback:()=>featureOn(self,'autostart')},
    count_up:{type:'boolean',name:'Count up mode is enabled',defaultStyle:{bgcolor:PURPLE,color:WHITE},options:[],callback:()=>featureOn(self,'count_up')},
    timer_flash:{type:'boolean',name:'Timer flashing is enabled',defaultStyle:{bgcolor:RED,color:WHITE},options:[],callback:()=>featureOn(self,'timer_flash')},
    message_visible:{type:'boolean',name:'Presenter message is visible',defaultStyle:{bgcolor:AMBER,color:WHITE},options:[],callback:()=>{const s=live(self);return !!(s.bannerVisible || s.display?.presenterMessage?.visible || s.presenterMessage?.visible)}},

    start_pause_live: {
      type:'advanced',name:'Live Play / Pause label and colour (green PLAY / yellow PAUSE)',affectedProperties:['text','bgcolor','color','size'],options:[],
      callback:()=>{const s=live(self);const running=!!s.running&&!s.paused&&!s.finished;
        return {text:playPauseText(s),bgcolor:running?AMBER:GREEN,color:WHITE,size:11}}
    },
    live_mode_value: {
      type:'advanced',name:'AUTO Timer/Clock value (changes when selected output changes)',affectedProperties:['text','bgcolor','color','size'],
      options:[{type:'dropdown',id:'field',label:'Displayed value',default:'time',choices:[
        {id:'time',label:'Full time'},{id:'days',label:'Days DD'},{id:'hours',label:'Hours HH'},
        {id:'hoursInDay',label:'Hour after days'},{id:'minutes',label:'Minutes MM'},
        {id:'seconds',label:'Seconds SS'},{id:'ampm',label:'AM / PM'},
        {id:'mode',label:'Mode (TIMER/CLOCK)'}]}],
      callback:evt=>{const s=live(self),v=modeValues(s),key=String(evt?.options?.field||'time');
        const value=String(v[key]??'');const bg=v.isClock?BLUE:(s.finished?RED:s.warningActive?AMBER:s.paused?AMBER:s.running?GREEN:0x19202a);
        return {text:value,bgcolor:bg,color:WHITE,size:key==='time'?12:14}
      }
    },

    // Presets use these advanced feedbacks so BOTH text and colour follow the actual state.
    control_state:{
      type:'advanced',name:'Playback control: active state, label and colour',
      affectedProperties:['text','bgcolor','color','size'],
      options:[{type:'dropdown',id:'control',label:'Control',default:'start',choices:[
        'start','pause','resume','stop','reset','next','queue_start','queue_clear'].map(id=>({id,label:id.replaceAll('_',' ')}))}],
      callback:event=>{
        const s=live(self), type=String(event?.options?.control||'start'),
          playing=!!s.running&&!s.paused&&!s.finished,
          paused=!!s.running&&!!s.paused,
          loaded=Number(s.duration||0)>0||!!s.countUp,
          cue=!!(s.hasNextCue||s.queueLength>0),
          render=(text,bgcolor)=>({text,bgcolor,color:WHITE,size:10})
        if(type==='start')return render(playing?'RUNNING':paused?'RESUME':'START',playing?GREEN:loaded?GREEN:0x363f4c)
        if(type==='pause')return render(playing?'Ⅱ\nPAUSE':paused?'PAUSED':'PAUSE\nIDLE',playing?AMBER:paused?AMBER:0x363f4c)
        if(type==='resume')return render(paused?'▶\nRESUME':playing?'RUNNING':'RESUME\nIDLE',paused?GREEN:playing?GREEN:0x363f4c)
        if(type==='stop')return render(playing||paused?'■\nSTOP':'STOPPED',playing||paused?RED:0x363f4c)
        if(type==='reset')return render(loaded?'↻\nRESET':'RESET\nIDLE',loaded?BLUE:0x363f4c)
        if(type==='next')return render(cue?'NEXT CUE':'NO NEXT\nCUE',cue?GREEN:0x363f4c)
        if(type==='queue_start')return render(cue?'START\nQUEUE':'QUEUE\nEMPTY',cue?GREEN:0x363f4c)
        if(type==='queue_clear')return render(cue?'CLEAR\nQUEUE':'QUEUE\nEMPTY',cue?RED:0x363f4c)
        return render(type.toUpperCase(),0x363f4c)
      }
    },
    clock_button_state:{
      type:'advanced',name:'Clock/Timer mode: toggled label and colours',
      affectedProperties:['text','bgcolor','color','size'],
      options:[{type:'dropdown',id:'control',label:'Control',default:'toggle',choices:[
        {id:'toggle',label:'Toggle'},{id:'show_clock',label:'Show clock'},{id:'show_timer',label:'Show timer'}]}],
      callback:event=>{
        const clock=live(self).displayMode==='clock',which=String(event?.options?.control||'toggle');
        if(which==='toggle')return {text:clock?'SHOW\nTIMER':'SHOW\nCLOCK',bgcolor:clock?PURPLE:BLUE,color:WHITE,size:10}
        if(which==='show_clock')return {text:clock?'CLOCK\nACTIVE':'SHOW\nCLOCK',bgcolor:clock?PURPLE:BLUE,color:WHITE,size:10}
        return {text:clock?'SHOW\nTIMER':'TIMER\nACTIVE',bgcolor:clock?0x363f4c:GREEN,color:WHITE,size:10}
      }
    },
    clock_format_state:{
      type:'advanced',name:'Clock format selected: 12/24H',
      affectedProperties:['text','bgcolor','color','size'],
      options:[{type:'dropdown',id:'format',label:'Format',default:'24',choices:[{id:'24',label:'24-hour'},{id:'12',label:'12-hour'}]}],
      callback:event=>{
        const fmt=String(event?.options?.format||'24'),on=String(live(self).clockFormat||'24')===fmt;
        return {text:`${fmt}H\n${on?'ACTIVE':'CLOCK'}`,bgcolor:on?BLUE:0x363f4c,color:WHITE,size:10}
      }
    },
    banner_toggle_state:{
      type:'advanced',name:'Show/Hide Banner toggle: live label + colour',
      affectedProperties:['text','bgcolor','color','size'],options:[],
      callback:()=>{const showing=!!live(self).bannerVisible;
        return {text:showing?'HIDE\nBANNER':'SHOW\nBANNER',bgcolor:showing?AMBER:GREEN,color:WHITE,size:10}}
    },
    banner_flash_state:{
      type:'advanced',name:'Flash Banner: live on/off label + colour',
      affectedProperties:['text','bgcolor','color','size'],
      options:[{type:'dropdown',id:'mode',label:'Control',default:'toggle',choices:[{id:'toggle',label:'Toggle'},{id:'on',label:'ON'},{id:'off',label:'OFF'}]}],
      callback:event=>{const on=!!live(self).flashMessage, mode=String(event?.options?.mode||'toggle');
        const active=mode==='toggle'?on:mode==='on'?on:!on;
        return {text:`FLASH\nBANNER\n${mode==='toggle'?(on?'ON':'OFF'):mode.toUpperCase()}`,bgcolor:active?(on?AMBER:GREEN):0x363f4c,color:WHITE,size:9}}
    },
    banner_action_state:{
      type:'advanced',name:'Banner show/hide/clear: enabled colour',
      affectedProperties:['text','bgcolor','color','size'],
      options:[{type:'dropdown',id:'control',label:'Action',default:'show',choices:[{id:'show',label:'Show'},{id:'hide',label:'Hide'},{id:'clear',label:'Clear'}]}],
      callback:event=>{const state=live(self),visible=!!state.bannerVisible,control=String(event?.options?.control||'show');
        if(control==='show')return {text:visible?'BANNER\nVISIBLE':'SHOW\nBANNER',bgcolor:visible?GREEN:0x363f4c,color:WHITE,size:9};
        if(control==='hide')return {text:visible?'HIDE\nBANNER':'BANNER\nHIDDEN',bgcolor:visible?RED:0x363f4c,color:WHITE,size:9};
        const hasText=!!String(state.presenterMessage||state.bannerText||'').trim();
        return {text:hasText?'CLEAR\nTEXT':'TEXT\nEMPTY',bgcolor:hasText?RED:0x363f4c,color:WHITE,size:9}
      }
    },
    message_preset_state:{
      type:'advanced',name:'Quick banner message selected',
      affectedProperties:['bgcolor','color','size'],
      options:[{type:'textinput',id:'message',label:'Message text',default:''},
        {type:'dropdown',id:'colour',label:'Default colour',default:'blue',choices:['blue','green','amber','red'].map(id=>({id,label:id}))}],
      callback:event=>{const s=live(self),match=!!s.bannerVisible&&String(s.presenterMessage||s.bannerText||'')===String(event?.options?.message||'');
        const cols={blue:BLUE,green:GREEN,amber:AMBER,red:RED};
        return {bgcolor:match?cols[event?.options?.colour]||BLUE:0x363f4c,color:WHITE,size:9}}
    },
    // Compatibility feedbacks for buttons created with v0.5-v0.7. New v0.8
    // presets use Companion variables for live text, but keeping these IDs means
    // older placed buttons do not immediately break after the module upgrade.
    display_value:{
      type:'advanced', name:'Live display text (legacy compatibility)', affectedProperties:['text','bgcolor','color','size'], options:[
        {type:'dropdown',id:'mode',label:'Value',default:'time',choices:[
          {id:'time',label:'Timer'},{id:'dd',label:'Days DD'},{id:'hh',label:'Total Hours HH'},{id:'hh_day',label:'Hours in Day'},{id:'mm',label:'Minutes MM'},{id:'ss',label:'Seconds SS'},{id:'total_mm',label:'Total Minutes'},{id:'total_ss',label:'Total Seconds'},
          {id:'status',label:'Status'},{id:'connection',label:'Connection'},{id:'queue',label:'Queue count'},{id:'warning',label:'Warning'}
        ]}
      ],
      callback:(feedback)=>{
        const s=live(self), mode=String(feedback.options.mode||'time')
        let text='--'
        if(mode==='time') text=s.displayTime||s.formatted||'00:00'
        else if(mode==='dd') text=s.days||'00'
        else if(mode==='hh') text=s.hours||'00'
        else if(mode==='hh_day') text=s.hoursInDay||'00'
        else if(mode==='mm') text=s.minutes||'00'
        else if(mode==='ss') text=s.secondsPart||'00'
        else if(mode==='total_mm') text=s.totalMinutes||'0'
        else if(mode==='total_ss') text=s.totalSeconds||'0'
        else if(mode==='status') text=s.status||'READY'
        else if(mode==='connection') text=self.browserOnline?'CONNECTED':'OFFLINE'
        else if(mode==='queue') text=`QUEUE\n${Number(s.queueLength||0)}`
        else if(mode==='warning') text=s.warningActive?(s.warningLabel||'WARNING'):'WARNING\nOFF'
        const bgcolor=s.finished?RED:s.warningActive||s.paused?AMBER:s.running?GREEN:BLUE
        return {text,bgcolor:mode==='connection'?(self.browserOnline?GREEN:RED):bgcolor,color:WHITE}
      }
    },
    pause_resume_state:{
      type:'advanced',name:'Pause / Resume live label (legacy compatibility)',affectedProperties:['text','bgcolor','color','size'],options:[],
      callback:()=>{const s=live(self);return {text:s.paused?'RESUME':'PAUSE',bgcolor:s.paused?AMBER:BLUE,color:WHITE,size:11}}
    },
    feature_state:{
      type:'advanced',name:'Feature toggle state (legacy compatibility)',affectedProperties:['text','bgcolor','color','size'],options:[
        {type:'dropdown',id:'feature',label:'Feature',default:'progress',choices:Object.keys(FEATURE_META).map(id=>({id,label:id.replaceAll('_',' ')}))},
        {type:'textinput',id:'label',label:'Button label',default:'FEATURE'}
      ],
      callback:(feedback)=>{
        const feature=String(feedback.options.feature||''), meta=FEATURE_META[feature]||{color:BLUE}, on=featureOn(self,feature)
        const label=String(feedback.options.label||feature||'FEATURE').toUpperCase()
        return {text:`${label}\n${on?'ON':'OFF'}`,bgcolor:on?meta.color:BLUE,color:WHITE,size:10}
      }
    },
  })
}

module.exports.FEATURE_META = FEATURE_META
