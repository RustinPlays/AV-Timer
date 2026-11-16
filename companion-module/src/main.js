'use strict'
const http = require('node:http')
const {InstanceBase,InstanceStatus,runEntrypoint,combineRgb} = require('@companion-module/base')
const {fields,normalize,initial,liveTimeParts} = require('./state')
const C = { white:combineRgb(255,255,255), black:combineRgb(0,0,0), green:combineRgb(19,130,70), amber:combineRgb(194,122,0), red:combineRgb(175,35,40), blue:combineRgb(25,87,160), grey:combineRgb(50,62,78) }
function preset(text,steps=[],feedbacks=[],bg=C.grey){return {type:'button',category:'JC AV Timer',name:text,style:{text,size:'auto',color:C.white,bgcolor:bg},steps:steps.length?[{down:steps,up:[]}]:[],feedbacks}}
function action(actionId,options={}){return {actionId,options}}
function feedback(feedbackId,style={}){return {feedbackId,options:{},style}}
function clockVariables(state={}){const zone=String(state.clockTimeZone||'UTC'),fmt=String(state.clockFormat)==='12'?'12':'24';let a;try{a=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]))}catch{a=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]))}const h=Number(a.hour)||0,t24=`${String(h).padStart(2,'0')}:${a.minute}:${a.second}`,t12=`${String(h%12||12).padStart(2,'0')}:${a.minute}:${a.second} ${h>=12?'PM':'AM'}`;return {clockTime:fmt==='12'?t12:t24,clockTime24:t24,clockTime12:t12}}
class JCTimer extends InstanceBase {
 constructor(internal){super(internal);this.state={...initial};this.server=null;this.port=3210;this.connected=false;this.events=[];this.latestId=0;this.waiters=new Set();this.lastUpdate=0;this.tick=null;this.session='';this.seq=-1}
 async init(config){this.config=config||{};this.setActionDefinitions(this.actions());this.setFeedbackDefinitions(this.feedbacks());this.setVariableDefinitions(fields.map(name=>({variableId:name,name:name.replace(/([A-Z])/g,' $1')})).concat([{variableId:'connected',name:'Connected to website'},{variableId:'time',name:'Timer formatted time'},{variableId:'overtime',name:'Overtime'},{variableId:'next_cue',name:'Next cue'}]));this.setPresetDefinitions(this.presets());await this.startServer();this.tick=setInterval(()=>this.refresh(),500)}
 async configUpdated(config){this.config=config;await this.startServer()}
 async destroy(){clearInterval(this.tick);for(const w of this.waiters)w();this.waiters.clear();if(this.server){const s=this.server;this.server=null;await new Promise(resolve=>s.close(resolve))}}
 getConfigFields(){return [{type:'static-text',id:'info',width:12,label:'Local bridge',value:'Open timer.justincreative.tech in a browser on this same computer. Set its Companion port to match below. No remote IP required.'},{type:'number',id:'port',label:'Local API Port',width:4,min:1024,max:65535,default:3210}]}
 async startServer(){const port=Number(this.config.port)||3210;if(this.server&&this.port===port)return;const old=this.server;this.server=null;if(old)await new Promise(resolve=>old.close(resolve));this.port=port;this.updateStatus(InstanceStatus.Connecting);const server=http.createServer((req,res)=>this.request(req,res));server.on('error',e=>{this.log('error','Timer bridge: '+e.message);this.updateStatus(InstanceStatus.ConnectionFailure)});try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.off('error',reject);resolve()})});this.server=server;this.updateStatus(InstanceStatus.Ok)}catch(e){this.log('error','Unable to listen on 127.0.0.1:'+port+' '+e.message);this.updateStatus(InstanceStatus.ConnectionFailure)}}
 request(req,res){const url=new URL(req.url,'http://127.0.0.1');const send=(code,payload)=>{if(res.writableEnded)return;res.writeHead(code,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'content-type, target-address-space','access-control-allow-private-network':'true','cache-control':'no-store'});res.end(JSON.stringify(payload))};if(req.method==='OPTIONS')return send(204,{});if(req.method==='GET'&&url.pathname==='/api/status'){this.lastUpdate=Date.now();this.refresh();return send(200,{ok:true,latestId:this.latestId,name:'JC - AV Timer',version:'0.9.5',browserActive:this.connected,port:this.port})}if(req.method==='GET'&&url.pathname==='/api/events'){this.lastUpdate=Date.now();const since=Math.max(0,Number(url.searchParams.get('since'))||0),wait=Math.min(25000,Math.max(0,Number(url.searchParams.get('wait'))||0));const reply=()=>send(200,{events:this.events.filter(e=>e.id>since),latestId:this.latestId});if(this.latestId>since||!wait)return reply();let done=false;const timer=setTimeout(()=>{if(!done){done=true;this.waiters.delete(complete);reply()}},wait);const complete=()=>{if(done)return;done=true;clearTimeout(timer);this.waiters.delete(complete);reply()};this.waiters.add(complete);res.on('close',()=>{if(done)return;done=true;clearTimeout(timer);this.waiters.delete(complete)});return}if(req.method==='POST'&&url.pathname==='/api/state'){let buf='';req.on('data',chunk=>{buf+=chunk;if(buf.length>256000)req.destroy()});req.on('end',()=>{try{const d=JSON.parse(buf);if(!d||typeof d!=='object'||Array.isArray(d))return send(400,{error:'invalid state'});const s=String(d.companionStateSession||''),n=Number(d.companionStateSequence||0);if(s&&s===this.session&&n<this.seq)return send(200,{ok:true,ignored:true});if(s!==this.session){this.session=s;this.seq=-1}this.seq=n;this.state=normalize(d);this.lastUpdate=Date.now();this.refresh(true);send(200,{ok:true})}catch{return send(400,{error:'invalid JSON'})}});return}send(404,{error:'not found'})}
 queue(command,args={}){const evt={id:++this.latestId,command,args};this.events.push(evt);if(this.events.length>300)this.events.shift();for(const resolve of [...this.waiters])resolve();return evt}
 refresh(force=false){const connected=Date.now()-this.lastUpdate<60000;if(connected!==this.connected||force){this.connected=connected;this.checkAllFeedbacks()}const values={...this.state,...liveTimeParts(this.state.seconds),...clockVariables(this.state),connected:connected?'YES':'NO',time:this.state.formatted,overtime:this.state.finished?'YES':'NO',next_cue:this.state.nextCueLabel||''};this.setVariableValues(values)}
 actions(){const actions={};const add=(id,name,cmd,options=[],makeArgs=()=>({}))=>actions[id]={name,options,callback:evt=>this.queue(cmd,makeArgs(evt.options||{}))};add('start_pause','Start / Pause Toggle','start_pause');add('start','Start','start');add('pause','Pause','pause');add('resume','Resume','resume');add('stop','Stop','stop');add('reset','Reset','reset');add('next_cue','Next Cue','queue_next');add('clock_toggle','Toggle Clock / Timer','clock_mode');add('clock_show','Show Clock','clock_mode',[],()=>({mode:'clock'}));add('timer_show','Show Timer','clock_mode',[],()=>({mode:'timer'}));add('clock_format','Clock Hour Format','clock_format',[{id:'format',type:'dropdown',label:'Hour format',choices:[{id:'24',label:'24 hour'},{id:'12',label:'12 hour (AM/PM)'}],default:'24'}],o=>({format:String(o.format)==='12'?'12':'24'}));add('queue_clear','Clear Cue Queue','queue_clear');add('queue_play','Play Cue Number','queue_play',[{id:'index',type:'number',label:'Cue number',default:1,min:1,max:100}],o=>({index:Number(o.index)||1}));for(const id of ['preset','add','subtract'])add(id,id==='preset'?'Set Timer Duration':id==='add'?'Add Time':'Remove Time',id,[{id:'seconds',type:'number',label:'Seconds',default:60,min:1,max:86400}],o=>({seconds:Number(o.seconds)||60}));for(const id of ['flash_timer','flash_message'])add(id,id.replace('_',' '),'feature',[{id:'op',type:'dropdown',label:'Operation',choices:[{id:'toggle',label:'Toggle'},{id:'on',label:'On'},{id:'off',label:'Off'}],default:'toggle'}],o=>({feature:id,op:o.op}));add('message_show','Show Presenter Message','message_show');add('message_hide','Hide Presenter Message','message_hide');add('message_clear','Clear Presenter Message','message_clear');add('message','Set Presenter Message','message',[{id:'text',type:'textinput',label:'Text',default:'Wrap up please',useVariables:true}],o=>({text:String(o.text||'')}));add('feature','Toggle Appearance/Display Feature','feature',[{id:'feature',type:'dropdown',label:'Feature',choices:['warnings','progress','gradient','shadow','chroma','banner'].map(x=>({id:x,label:x}))},{id:'op',type:'dropdown',label:'Operation',choices:['toggle','on','off'].map(x=>({id:x,label:x})),default:'toggle'}],o=>({feature:o.feature,op:o.op}));return actions}
 feedbacks(){const defs={};const put=(id,name,test,bg,color=C.white)=>{defs[id]={type:'boolean',name,description:'Live state from the timer website',defaultStyle:{bgcolor:bg,color},options:[],callback:()=>this.connected&&!!test(this.state)}};put('clock_mode','Clock visible on output',s=>s.displayMode==='clock',C.blue);put('connected','Timer website connected',()=>true,C.green);put('running','Timer running',s=>s.running&&!s.paused,C.green);put('paused','Timer paused',s=>s.paused,C.amber);put('ready','Timer armed/ready',s=>!s.running&&!s.paused,C.grey);put('overtime','Timer overtime',s=>s.finished||(!s.countUp&&s.duration>0&&s.seconds<0),C.red);put('warning','Timer warning active',s=>s.warningActive,C.amber);put('count_up','Count up enabled',s=>s.countUp,C.blue);put('queue_active','Queue active',s=>s.queueActive,C.blue);put('has_next','Next cue available',s=>s.hasNextCue,C.green);put('message','Presenter message visible',s=>s.bannerVisible,C.blue);put('flash_timer','Flash timer enabled',s=>s.flashTimer,C.amber);put('flash_message','Flash message enabled',s=>s.flashMessage,C.amber);for(const [id,key] of [['progress','progressEnabled'],['gradient','gradientEnabled'],['shadow','shadowEnabled'],['chroma','chromaEnabled'],['light','lightEnabled'],['warnings_enabled','warningsEnabled']])put(id,id.replace('_',' '),s=>s[key],C.blue);return defs}
  presets(){
    const p={};
    const group={play:'JC 01 · Start / Pause / Stop',set:'JC 02 · Set Time',add:'JC 03 · Add Time (+)',minus:'JC 04 · Remove Time (-)',
      live:'JC 05 · Live Timer',clock:'JC 06 · Clock',queue:'JC 07 · Cue Queue',messages:'JC 09 · Messages',looks:'JC 10 · Appearance',status:'JC 11 · Feedbacks / Status'};
    const ref=id=>`$(jc-av-timer:${id})`;
    const f=(id,bg)=>feedback(id,{bgcolor:bg,color:C.white});
    const timerFb=()=>[f('running',C.green),f('paused',C.amber),f('warning',C.amber),f('overtime',C.red)];
    const add=(id,category,name,text,acts=[],fbs=[],bg=C.grey,size=11,preview=null)=>{
      const st={text,size:String(size),color:C.white,bgcolor:bg};
      p[id]={type:'button',category,name,style:st,...(preview==null?{}:{previewStyle:{...st,text:preview}}),
        steps:[{down:acts,up:[]}],feedbacks:fbs};
    };
    const live=(id,name,variable,preview,size=13)=>add(id,group.live,name,ref(variable),[],timerFb(),C.grey,size,preview);
    add('start_pause',group.play,'Start / Pause','START / PAUSE',[action('start_pause')],[f('running',C.green),f('paused',C.amber)],C.grey,10);
    for(const [id,label,bg] of [['start','START',C.green],['pause','PAUSE',C.amber],['resume','RESUME',C.green],['stop','STOP',C.red],['reset','RESET',C.blue]]){
      add(id,group.play,label,label,[action(id)],[],bg,11);
    }
    const mins=[1,2,3,5,10,15,20,30,45,60];
    for(const m of mins) add('preset_'+m,group.set,`Set ${m} min`,`SET\n${m} MIN`,[action('preset',{seconds:m*60})],[],C.blue,10);
    for(const m of mins) add('add_'+m,group.add,`Add ${m} min`,`+${m} MIN`,[action('add',{seconds:m*60})],[],C.green,12);
    for(const m of mins) add('subtract_'+m,group.minus,`Remove ${m} min`,`−${m} MIN`,[action('subtract',{seconds:m*60})],[],C.red,12);
    live('live_timer','Live timer','formatted','00:00:00',13);
    live('live_timer_small','Compact live timer','formatted','00:00:00',10);
    live('live_days','Live days (DD)','days','DD',14);
    live('live_hours','Live total hours','hours','HH',14);
    live('live_hours_in_day','Live hours (00–23)','hoursInDay','HH',14);
    live('live_minutes','Live minutes','minutes','MM',14);
    live('live_seconds','Live seconds','secondsPart','SS',14);
    live('live_total_hours','Live total hours','totalHours','HRS',12);
    live('live_total_minutes','Live total minutes','totalMinutes','MINS',12);
    live('live_total_seconds','Live total seconds','totalSeconds','SECS',12);
    add('clock_live',group.clock,'Live wall clock',ref('clockTime'),[],[f('clock_mode',C.blue)],C.grey,13,'12:34:56');
    add('clock_live_24',group.clock,'Live clock 24h',ref('clockTime24'),[],[],C.grey,13,'23:34:56');
    add('clock_live_12',group.clock,'Live clock 12h',ref('clockTime12'),[],[],C.grey,12,'11:34:56 PM');
    add('clock_toggle',group.clock,'Clock / Timer','CLOCK / TIMER',[action('clock_toggle')],[f('clock_mode',C.blue)],C.grey,10);
    add('clock_show',group.clock,'Show clock','SHOW CLOCK',[action('clock_show')],[f('clock_mode',C.blue)],C.grey,10);
    add('timer_show',group.clock,'Show timer','SHOW TIMER',[action('timer_show')],[],C.grey,10);
    add('clock_24',group.clock,'24 Hour Clock','CLOCK 24H',[action('clock_format',{format:'24'})],[],C.blue,10);
    add('clock_12',group.clock,'12 Hour Clock','CLOCK 12H',[action('clock_format',{format:'12'})],[],C.blue,10);
    add('next_cue',group.queue,'Next cue','NEXT CUE',[action('next_cue')],[f('has_next',C.green)],C.blue,11);
    add('cue_current',group.queue,'Current cue',ref('currentCueLabel'),[],[],C.grey,10,'CURRENT CUE');
    add('cue_next',group.queue,'Next cue label',ref('nextCueLabel'),[action('next_cue')],[],C.grey,10,'NEXT CUE');
    add('message',group.messages,'Presenter message',ref('bannerText'),[action('message_show')],[f('message',C.blue)],C.grey,10,'MESSAGE');
    for(const [id,label] of [['flash_timer','FLASH TIMER'],['flash_message','FLASH MESSAGE']])
      add(id,group.messages,label,label,[action(id)],[f(id,C.amber)],C.grey,10);
    add('status',group.status,'Live timer status',ref('status'),[],timerFb(),C.grey,11,'READY');
    add('warning',group.status,'Warning text',ref('warningLabel'),[],[f('warning',C.red)],C.grey,10,'WARNING');
    add('connected',group.status,'Connected',ref('connected'),[],[f('connected',C.green)],C.grey,11,'YES/NO');
    return p;
  }
}
runEntrypoint(JCTimer,[])
