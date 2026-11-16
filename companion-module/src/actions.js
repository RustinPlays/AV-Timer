const TIME_CHOICES = [
  { id:60,label:'1 minute' },{ id:120,label:'2 minutes' },{ id:300,label:'5 minutes' },{ id:600,label:'10 minutes' },
  { id:900,label:'15 minutes' },{ id:1200,label:'20 minutes' },{ id:1800,label:'30 minutes' },{ id:2700,label:'45 minutes' },{ id:3600,label:'60 minutes' }
]

const FEATURE_CHOICES = [
  { id:'queue', label:'Queue enabled' },{ id:'warnings', label:'Warnings enabled' },{ id:'progress', label:'Progress bar' },
  { id:'gradient', label:'Gradient' },{ id:'minimal', label:'Minimal mode' },{ id:'chroma', label:'Chroma mode' },
  { id:'light', label:'Light output' },{ id:'timer_flash', label:'Flash timer' },{ id:'auto_next', label:'Queue auto-next' },{ id:'count_up', label:'Count up mode' },{ id:'autostart', label:'Auto start' }
]

const SIZE_CHOICES = [
  { id:0.75,label:'Small (75%)' },{ id:1,label:'Medium (100%)' },{ id:1.25,label:'Large (125%)' },{ id:1.5,label:'XL (150%)' },{ id:1.8,label:'XXL (180%)' }
]

const COLOR_TARGETS = [
  { id:'background', label:'Background' },{ id:'timer', label:'Timer text' },{ id:'progress', label:'Progress bar' },{ id:'time', label:'TIME colour' },{ id:'chroma', label:'Chroma colour' }
]

const sec = n => Math.max(0, Math.round(Number(n) || 0))
const hms = o => sec(Number(o.hours || 0) * 3600 + Number(o.minutes || 0) * 60 + Number(o.seconds || 0))

module.exports = function(self) {
  const hmsOptions = [
    { type:'number', id:'hours', label:'Hours', default:0, min:0, max:99 },
    { type:'number', id:'minutes', label:'Minutes', default:5, min:0, max:59 },
    { type:'number', id:'seconds', label:'Seconds', default:0, min:0, max:59 }
  ]

  self.setActionDefinitions({
    clock_toggle: {name:'Output: Clock / Timer toggle',options:[],callback:async()=>self.command('clock_mode',{mode:'toggle'})},
    clock_show: {name:'Output: Show clock',options:[],callback:async()=>self.command('clock_mode',{mode:'clock'})},
    timer_show: {name:'Output: Show timer',options:[],callback:async()=>self.command('clock_mode',{mode:'timer'})},
    clock_format: {name:'Clock: Set 12 / 24-hour format',options:[{type:'dropdown',id:'format',label:'Format',default:'24',choices:[{id:'24',label:'24 hour'},{id:'12',label:'12 hour (AM / PM)'}]}],callback:async e=>self.command('clock_format',{format:String(e.options.format)==='12'?'12':'24'})},
    start: { name:'Timer: Start / Resume', options:[], callback:async()=>self.command('start') },
    pause: { name:'Timer: Pause', options:[], callback:async()=>self.command('pause') },
    resume: { name:'Timer: Resume', options:[], callback:async()=>self.command('resume') },
    toggle: { name:'Timer: Toggle Pause / Resume', options:[], callback:async()=>self.command('toggle') },
    reset: { name:'Timer: Reset', options:[], callback:async()=>self.command('reset') },
    stop: { name:'Timer: Stop / Clear', options:[], callback:async()=>self.command('stop') },

    add_preset: { name:'Time: Add quick amount', options:[{type:'dropdown',id:'seconds',label:'Amount',default:300,choices:TIME_CHOICES}], callback:async e=>self.command('add',{seconds:sec(e.options.seconds)}) },
    subtract_preset: { name:'Time: Remove quick amount', options:[{type:'dropdown',id:'seconds',label:'Amount',default:300,choices:TIME_CHOICES}], callback:async e=>self.command('subtract',{seconds:sec(e.options.seconds)}) },
    set_preset: { name:'Time: Set quick duration', options:[{type:'dropdown',id:'seconds',label:'Duration',default:600,choices:TIME_CHOICES}], callback:async e=>self.command('set',{seconds:sec(e.options.seconds)}) },
    start_preset: { name:'Time: Set and Start quick duration', options:[{type:'dropdown',id:'seconds',label:'Duration',default:600,choices:TIME_CHOICES}], callback:async e=>{const seconds=sec(e.options.seconds);self.command('set',{seconds});self.command('start')} },

    // Custom actions remain available for advanced users, but they are intentionally
    // not exposed as preset buttons.
    add_hms: { name:'Time: Add custom H:M:S', options:hmsOptions, callback:async e=>self.command('add',{seconds:hms(e.options)}) },
    subtract_hms: { name:'Time: Remove custom H:M:S', options:hmsOptions, callback:async e=>self.command('subtract',{seconds:hms(e.options)}) },
    set_hms: { name:'Time: Set custom H:M:S', options:hmsOptions, callback:async e=>self.command('set',{seconds:hms(e.options)}) },
    start_hms: { name:'Time: Set and Start custom H:M:S', options:hmsOptions, callback:async e=>{const seconds=hms(e.options);self.command('set',{seconds});self.command('start')} },

    queue_add_preset: { name:'Queue: Add quick duration', options:[{type:'dropdown',id:'seconds',label:'Duration',default:300,choices:TIME_CHOICES}], callback:async e=>self.command('queue_add',{seconds:sec(e.options.seconds)}) },
    queue_add_named: { name:'Queue: Add named item', options:[{type:'textinput',id:'name',label:'Item name',default:'Speaker'},{type:'dropdown',id:'seconds',label:'Duration',default:300,choices:TIME_CHOICES}], callback:async e=>self.command('queue_add',{seconds:sec(e.options.seconds),name:String(e.options.name||'')}) },
    queue_set_name: { name:'Queue: Set rundown name', options:[{type:'textinput',id:'name',label:'Queue / rundown name',default:'Show Rundown'}], callback:async e=>self.command('queue_set_name',{name:String(e.options.name||'')}) },
    queue_add_hms: { name:'Queue: Add custom H:M:S', options:hmsOptions, callback:async e=>self.command('queue_add',{seconds:hms(e.options)}) },
    queue_remove_last: { name:'Queue: Remove last timer', options:[], callback:async()=>self.command('queue_remove_last') },
    queue_clear: { name:'Queue: Clear', options:[], callback:async()=>self.command('queue_clear') },
    queue_start: { name:'Queue: Start', options:[], callback:async()=>self.command('queue_start') },
    next: { name:'Queue: Next timer', options:[], callback:async()=>self.command('queue_next') },

    feature: {
      name:'Display / feature: Toggle',
      options:[{type:'dropdown',id:'feature',label:'Feature',default:'progress',choices:FEATURE_CHOICES}],
      callback:async e=>self.command('feature',{feature:e.options.feature,op:'toggle'})
    },
    output_size: { name:'Output: Timer size preset', options:[{type:'dropdown',id:'scale',label:'Size',default:1,choices:SIZE_CHOICES}], callback:async e=>self.command('size',{scale:Number(e.options.scale)}) },
    output_size_custom: { name:'Output: Timer size custom', options:[{type:'number',id:'percent',label:'Percent',default:100,min:60,max:200}], callback:async e=>self.command('size',{scale:Number(e.options.percent)/100}) },

    presenter_message: {
      name:'Presenter: Set / show message',
      options:[
        {type:'textinput',id:'text',label:'Message',default:'PLEASE WRAP UP'},
        {type:'checkbox',id:'show',label:'Show immediately',default:true},
        {type:'checkbox',id:'flash',label:'Flash message',default:false},
        {type:'dropdown',id:'mode',label:'Mode',default:'banner',choices:[{id:'banner',label:'Banner'},{id:'full',label:'Full screen'}]}
      ],
      callback:async e=>{self.command('message',{text:String(e.options.text||'')});if(!e.options.show)self.command('message_hide');self.command('flash_message',{op:e.options.flash?'on':'off'})}
    },
    presenter_message_toggle: { name:'Presenter: Show / Hide Banner toggle',options:[],callback:async()=>self.command('feature',{feature:'banner',op:'toggle'}) },
    presenter_message_show: { name:'Presenter: Show current message/banner',options:[],callback:async()=>self.command('message_show') },
    presenter_message_hide: { name:'Presenter: Hide message',options:[],callback:async()=>self.command('message_hide') },
    presenter_message_flash: { name:'Presenter: Flash Banner', options:[{type:'dropdown',id:'op',label:'Operation',default:'toggle',choices:[{id:'toggle',label:'Toggle'},{id:'on',label:'On'},{id:'off',label:'Off'}]}],callback:async e=>self.command('flash_message',{op:e.options.op||'toggle'}) },
    presenter_message_clear: { name:'Presenter: Clear message',options:[],callback:async()=>self.command('message_clear') },

    output_color: {
      name:'Output: Set colour',
      options:[
        {type:'dropdown',id:'target',label:'Target',default:'background',choices:COLOR_TARGETS},
        {type:'textinput',id:'color',label:'Hex colour',default:'#00324b',regex:'/^#[0-9a-fA-F]{6}$/' }
      ],
      callback:async e=>self.command('color',{target:e.options.target,color:String(e.options.color||'')})
    }
  })
}

module.exports.TIME_CHOICES = TIME_CHOICES
module.exports.FEATURE_CHOICES = FEATURE_CHOICES
module.exports.SIZE_CHOICES = SIZE_CHOICES
