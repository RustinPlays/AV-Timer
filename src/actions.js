const TIME_CHOICES = [
  { id:60,label:'1 minute' },{ id:120,label:'2 minutes' },{ id:300,label:'5 minutes' },{ id:600,label:'10 minutes' },
  { id:900,label:'15 minutes' },{ id:1800,label:'30 minutes' },{ id:2700,label:'45 minutes' },{ id:3600,label:'60 minutes' }
]

const FEATURE_CHOICES = [
  { id:'warnings', label:'Warnings enabled' },{ id:'progress', label:'Progress bar' },{ id:'gradient', label:'Gradient' },
  { id:'shadow', label:'Drop shadow' },{ id:'chroma', label:'Chroma mode' },{ id:'banner', label:'Presenter banner visible' },
  { id:'flash_timer', label:'Flash timer' },{ id:'flash_message', label:'Flash presenter message' }
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
    start_pause: { name:'Timer: Start / Pause toggle', options:[], callback:async()=>self.command('start_pause') },
    start: { name:'Timer: Start / Resume', options:[], callback:async()=>self.command('start') },
    pause: { name:'Timer: Pause', options:[], callback:async()=>self.command('pause') },
    reset: { name:'Timer: Reset', options:[], callback:async()=>self.command('reset') },
    stop: { name:'Timer: Stop to zero', options:[], callback:async()=>self.command('stop') },
    next: { name:'Queue: Next cue', options:[], callback:async()=>self.command('queue_next') },

    add_preset: { name:'Time: Add quick amount', options:[{type:'dropdown',id:'seconds',label:'Amount',default:300,choices:TIME_CHOICES}], callback:async e=>self.command('add',{seconds:sec(e.options.seconds)}) },
    subtract_preset: { name:'Time: Remove quick amount', options:[{type:'dropdown',id:'seconds',label:'Amount',default:300,choices:TIME_CHOICES}], callback:async e=>self.command('subtract',{seconds:sec(e.options.seconds)}) },
    set_preset: { name:'Time: Set quick duration', options:[{type:'dropdown',id:'seconds',label:'Duration',default:600,choices:TIME_CHOICES}], callback:async e=>self.command('set',{seconds:sec(e.options.seconds)}) },
    add_hms: { name:'Time: Add custom H:M:S', options:hmsOptions, callback:async e=>self.command('add',{seconds:hms(e.options)}) },
    subtract_hms: { name:'Time: Remove custom H:M:S', options:hmsOptions, callback:async e=>self.command('subtract',{seconds:hms(e.options)}) },
    set_hms: { name:'Time: Set custom H:M:S', options:hmsOptions, callback:async e=>self.command('set',{seconds:hms(e.options)}) },

    queue_play: { name:'Queue: Play cue number', options:[{type:'number',id:'cue',label:'Cue number',default:1,min:1,max:999}], callback:async e=>self.command('queue_play',{cue:Math.max(1,Math.round(Number(e.options.cue)||1))}) },
    queue_clear: { name:'Queue: Clear all cues', options:[], callback:async()=>self.command('queue_clear') },

    message: { name:'Presenter: Send custom text', options:[{type:'textinput',id:'text',label:'Message',default:'Please wrap up soon'}], callback:async e=>self.command('message',{text:String(e.options.text||'').slice(0,300)}) },
    message_clear: { name:'Presenter: Clear message', options:[], callback:async()=>self.command('message_clear') },
    message_show: { name:'Presenter: Show banner', options:[], callback:async()=>self.command('message_show') },
    message_hide: { name:'Presenter: Hide banner', options:[], callback:async()=>self.command('message_hide') },
    message_toggle: { name:'Presenter: Show / Hide banner toggle', options:[], callback:async()=>self.command('feature',{feature:'banner',op:'toggle'}) },
    flash_message: { name:'Presenter: Flash message toggle', options:[], callback:async()=>self.command('flash_message',{op:'toggle'}) },
    flash_timer: { name:'Timer: Flash timer toggle', options:[], callback:async()=>self.command('flash_timer',{op:'toggle'}) },

    feature: {
      name:'Display / feature: Toggle',
      options:[{type:'dropdown',id:'feature',label:'Feature',default:'progress',choices:FEATURE_CHOICES}],
      callback:async e=>self.command('feature',{feature:e.options.feature,op:'toggle'})
    }
  })
}

module.exports.TIME_CHOICES = TIME_CHOICES
module.exports.FEATURE_CHOICES = FEATURE_CHOICES
