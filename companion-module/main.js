// JC - AV Timer Companion module v0.9.8
// Self-contained distribution package.
'use strict'

const http = require('http')
const fs = require('fs')
const UpdateActions = require('./src/actions')
const UpdateFeedbacks = require('./src/feedbacks')
const UpdateVariables = require('./src/variables')
const UpdatePresets = require('./src/presets')
const {modeValues, playPauseText} = require('./src/live-values')
const NetworkServer = require('./src/network-server')

const API_VERSION = '1.12.1'
const InstanceStatus = {
  Ok:'ok', Connecting:'connecting', Disconnected:'disconnected', ConnectionFailure:'connection_failure',
  BadConfig:'bad_config', UnknownError:'unknown_error', UnknownWarning:'unknown_warning', AuthenticationFailure:'authentication_failure'
}
const Regex = { PORT:'/^([1-9]|[1-8][0-9]|9[0-9]|[1-8][0-9]{2}|9[0-8][0-9]|99[0-9]|[1-8][0-9]{3}|9[0-8][0-9]{2}|99[0-8][0-9]|999[0-9]|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-4])$/' }

class Ipc {
  constructor(handlers={}) {
    this.handlers=handlers
    this.nextId=1
    this.pending=new Map()
    process.on('message',msg=>this.received(msg))
  }
  encode(v){ return JSON.stringify(v ?? {}) }
  decode(v){ try{return v?JSON.parse(v):undefined}catch{return undefined} }
  packet(name,payload,callbackId){ return {direction:'call',name,payload:this.encode(payload),callbackId} }
  sendNoCb(name,payload){ if(process.send)process.send(this.packet(name,payload,undefined)) }
  sendWithCb(name,payload,timeout=5000){
    if(!process.send)return Promise.reject(new Error('No IPC channel'))
    const id=this.nextId++
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(`IPC call timed out: ${name}`))},timeout)
      this.pending.set(id,{resolve,reject,timer})
      process.send(this.packet(name,payload,id))
    })
  }
  async received(msg){
    if(!msg||typeof msg!=='object')return
    if(msg.direction==='response'){
      const p=this.pending.get(msg.callbackId); if(!p)return
      this.pending.delete(msg.callbackId); clearTimeout(p.timer)
      const data=this.decode(msg.payload)
      if(msg.success)p.resolve(data);else p.reject(new Error(data?.message||String(data||'IPC error')))
      return
    }
    if(msg.direction!=='call')return
    const fn=this.handlers[msg.name]
    if(!fn){
      if(msg.callbackId&&process.send)process.send({direction:'response',callbackId:msg.callbackId,success:false,payload:this.encode({message:`Unknown command "${msg.name}"`})})
      return
    }
    const data=this.decode(msg.payload)
    try{
      const result=await fn(data)
      if(msg.callbackId&&process.send)process.send({direction:'response',callbackId:msg.callbackId,success:true,payload:this.encode(result)})
    }catch(err){
      if(msg.callbackId&&process.send)process.send({direction:'response',callbackId:msg.callbackId,success:false,payload:this.encode({message:err?.message||String(err),stack:err?.stack})})
    }
  }
}

class JCAVTimerInstance {
  constructor(runtime){
    this.runtime=runtime
    this.config={}
    this.state={}
    this.server=null
    this.events=[]
    this.nextEventId=1
    this.eventWaiters=new Set()
    this.browserLastSeen=0
    this.browserOnline=false
    this.healthTimer=null
    this.liveTimer=null
    this.feedbackInstances=new Map()
    this.actionDefinitions={}
    this.feedbackDefinitions={}
    this.variableDefinitions=[]
    this.variableDefaults={}
    this.lastValues={}
    this.lastFeedbackSignature=''
    this.network=new NetworkServer(this)
  }

  async init(config){
    this.config=config||{}
    this.state={}
    this.events=[]
    this.nextEventId=1
    this.eventWaiters=new Set()
    this.browserLastSeen=0
    this.browserOnline=false
    this.lastValues={}
    this.lastFeedbackSignature=''
    this.updateDefinitions()
    await this.startServer()
    try{await this.network.start(this.networkPort)}catch(err){this.log('warn',`LAN display port ${this.networkPort} unavailable: ${err.message}. The desktop app may already be hosting it.`)}
    this.healthTimer=setInterval(()=>this.refreshBrowserStatus(),1000)
    this.liveTimer=setInterval(()=>this.publish(),250)
    this.publish(true)
  }

  async destroy(){
    if(this.healthTimer)clearInterval(this.healthTimer)
    if(this.liveTimer)clearInterval(this.liveTimer)
    this.healthTimer=null
    this.liveTimer=null
    this.resolveEventWaiters()
    await this.stopServer()
    await this.network?.stop?.()
  }

  async configUpdated(config){
    const old=this.port, oldNetwork=this.networkPort
    this.config=config||{}
    if(old!==this.port){await this.stopServer();await this.startServer()}
    if(oldNetwork!==this.networkPort){try{await this.network.stop();await this.network.start(this.networkPort)}catch(err){this.log('warn',`LAN display port ${this.networkPort} unavailable: ${err.message}`)}}
    this.publish(true)
  }

  getConfigFields(){return [
    {type:'textinput',id:'port',label:'Local timer API port',width:4,default:'3210',regex:Regex.PORT,tooltip:'JC AV Timer connects to Companion on 127.0.0.1 using this port.'},
    {type:'textinput',id:'networkPort',label:'LAN display port',width:4,default:'3211',regex:Regex.PORT,tooltip:'Other laptops open http://THIS-PC-IP:3211/display or /presenter.'}
  ]}
  get port(){return Number(this.config?.port||3210)}
  get networkPort(){return Number(this.config?.networkPort||3211)}
  updateDefinitions(){UpdateActions(this);UpdateFeedbacks(this);UpdateVariables(this);UpdatePresets(this)}

  cleanOptions(options){return (options||[]).map(o=>{const n={...o};delete n.isVisible;delete n.isVisibleExpression;return n})}
  setActionDefinitions(defs){
    this.actionDefinitions=defs||{}
    const actions=Object.entries(this.actionDefinitions).map(([id,a])=>({id,name:a.name,description:a.description,options:this.cleanOptions(a.options),optionsToIgnoreForSubscribe:undefined,hasLearn:!!a.learn,learnTimeout:a.learnTimeout,hasLifecycleFunctions:!!a.subscribe||!!a.unsubscribe}))
    this.runtime.sendNoCb('setActionDefinitions',{actions})
  }
  setFeedbackDefinitions(defs){
    this.feedbackDefinitions=defs||{}
    const feedbacks=Object.entries(this.feedbackDefinitions).map(([id,f])=>({id,name:f.name,description:f.description,options:this.cleanOptions(f.options),type:f.type,defaultStyle:f.type==='boolean'?f.defaultStyle:undefined,affectedProperties:f.type==='advanced'?(f.affectedProperties||[]):undefined,hasLearn:!!f.learn,showInvert:f.type==='boolean'?(f.showInvert??false):false,learnTimeout:f.learnTimeout}))
    this.runtime.sendNoCb('setFeedbackDefinitions',{feedbacks})
  }
  setVariableDefinitions(defs){
    this.variableDefinitions=defs||[]
    const defaults=this.variableDefaults||{}
    this.runtime.sendNoCb('setVariableDefinitions',{variables:this.variableDefinitions.map(v=>({id:v.variableId,name:v.name})),newValues:Object.entries(defaults).map(([id,value])=>({id,value}))})
  }
  setVariableValues(values){
    this.runtime.sendNoCb('setVariableValues',{newValues:Object.entries(values||{}).map(([id,value])=>({id,value:value??''}))})
  }
  setPresetDefinitions(defs){
    this.runtime.sendNoCb('setPresetDefinitions',{presets:Object.entries(defs||{}).map(([id,p])=>({id,...p}))})
  }
  updateStatus(status,message){this.runtime.sendNoCb('set-status',{status,message:message??null})}
  log(level,message){this.runtime.sendNoCb('log-message',{level,message:String(message)})}
  getFeedbackInstanceCount(){return this.feedbackInstances.size}

  handleUpdateFeedbacks(obj){
    for(const [id,fb] of Object.entries(obj||{})){
      if(!fb||fb.disabled)this.feedbackInstances.delete(id)
      else this.feedbackInstances.set(id,{...fb})
    }
    // Publish immediately so newly placed presets receive both their variable
    // text and their initial colour feedback without waiting for another tick.
    this.publish(true)
    this.checkFeedbacks()
  }
  async checkFeedbacks(...types){
    const filter=new Set(types)
    const values=[]
    for(const [id,fb] of this.feedbackInstances){
      if(filter.size&&!filter.has(fb.feedbackId))continue
      const def=this.feedbackDefinitions[fb.feedbackId];if(!def)continue
      try{
        const event={id,feedbackId:fb.feedbackId,controlId:fb.controlId,options:fb.options||{},type:def.type}
        const result=await def.callback(event,{parseVariablesInString:async x=>x})
        values.push({id,controlId:fb.controlId,value:def.type==='boolean'?!!result:result})
      }catch(err){this.log('warn',`Feedback ${fb.feedbackId} failed: ${err?.message||err}`)}
    }
    if(values.length)this.runtime.sendNoCb('updateFeedbackValues',{values})
  }
  async executeAction(msg){
    const action=msg?.action||{},def=this.actionDefinitions[action.actionId]
    if(!def)return {success:false,errorMessage:`Action definition not found for: ${action.actionId}`}
    try{
      await def.callback({id:action.id,actionId:action.actionId,controlId:action.controlId,options:action.options||{},surfaceId:msg.surfaceId},{parseVariablesInString:async x=>x,setCustomVariableValue:()=>{}})
      return {success:true,errorMessage:undefined}
    }catch(err){return {success:false,errorMessage:err?.message||String(err)}}
  }

  async startServer(){
    await this.stopServer()
    this.server=http.createServer((req,res)=>this.handleBrowserRequest(req,res))
    this.server.on('error',err=>{this.log('error',`Local timer API error: ${err.message}`);this.updateStatus(InstanceStatus.ConnectionFailure,`Cannot listen on 127.0.0.1:${this.port}`)})
    await new Promise((resolve,reject)=>{
      const onError=err=>{this.server?.off('listening',onListening);reject(err)}
      const onListening=()=>{this.server?.off('error',onError);resolve()}
      this.server.once('error',onError);this.server.once('listening',onListening);this.server.listen(this.port,'127.0.0.1')
    }).then(()=>{this.updateStatus(InstanceStatus.Ok,`Timer API ready on 127.0.0.1:${this.port}`);this.log('info',`JC AV Timer API listening on http://127.0.0.1:${this.port}`)})
      .catch(err=>{this.updateStatus(InstanceStatus.ConnectionFailure,`Port ${this.port}: ${err.message}`);this.log('error',`Unable to start local timer API: ${err.message}`)})
  }
  async stopServer(){const s=this.server;this.server=null;if(!s)return;await new Promise(resolve=>{try{s.close(()=>resolve())}catch{resolve()}})}
  setCors(req,res){const origin=req.headers.origin||'*';res.setHeader('Access-Control-Allow-Origin',origin==='null'?'*':origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Private-Network','true');res.setHeader('Cache-Control','no-store')}
  json(req,res,status,value){this.setCors(req,res);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value))}
  readJson(req){return new Promise((resolve,reject)=>{let body='';req.setEncoding('utf8');req.on('data',chunk=>{body+=chunk;if(body.length>1024*1024)req.destroy(new Error('Request body too large'))});req.on('end',()=>{if(!body)return resolve({});try{resolve(JSON.parse(body))}catch(err){reject(err)}});req.on('error',reject)})}
  touchBrowser(){this.browserLastSeen=Date.now();if(!this.browserOnline){this.browserOnline=true;this.publish(true)}}
  refreshBrowserStatus(){const active=this.browserLastSeen>0&&Date.now()-this.browserLastSeen<60000;if(active!==this.browserOnline){this.browserOnline=active;this.publish(true)}}

  async handleBrowserRequest(req,res){
    this.setCors(req,res);if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
    const url=new URL(req.url||'/',`http://127.0.0.1:${this.port}`)
    try{
      if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/api/status')){this.touchBrowser();return this.json(req,res,200,{ok:true,name:'JC - AV Timer',version:'0.9.8',companionActive:true,browserActive:this.browserOnline,latestId:this.nextEventId-1,port:this.port,network:this.network?.getStatus?.()||{ok:false,port:this.networkPort,viewerCount:0}})}
      if(req.method==='GET'&&url.pathname==='/api/events'){this.touchBrowser();const since=Math.max(0,Number(url.searchParams.get('since')||0)),waitMs=Math.max(0,Math.min(25000,Number(url.searchParams.get('wait')||0)));let events=this.events.filter(evt=>evt.id>since);if(!events.length&&waitMs>0){await this.waitForEvent(waitMs);events=this.events.filter(evt=>evt.id>since);this.touchBrowser()}return this.json(req,res,200,{ok:true,companionActive:true,latestId:this.nextEventId-1,events})}
      if(req.method==='POST'&&url.pathname==='/api/state'){const state=await this.readJson(req);this.state=state&&typeof state==='object'?state:{};this.touchBrowser();this.network?.setState?.({state:{...this.state},display:this.state?.display||{}});this.publish(true);return this.json(req,res,200,{ok:true})}
      if(req.method==='GET'&&url.pathname==='/api/state')return this.json(req,res,200,this.getLiveState())
      if(req.method==='GET'&&url.pathname.startsWith('/timer/')){const result=this.enqueuePath(url.pathname);return this.json(req,res,result?200:404,result?{ok:true}:{ok:false,error:'Unknown timer command'})}
      return this.json(req,res,404,{ok:false,error:'Not found'})
    }catch(err){this.log('warn',`Timer API request failed: ${err.message}`);return this.json(req,res,400,{ok:false,error:err.message})}
  }

  waitForEvent(waitMs){return new Promise(resolve=>{const waiter={resolve,timer:null};waiter.timer=setTimeout(()=>{this.eventWaiters.delete(waiter);resolve()},waitMs);this.eventWaiters.add(waiter)})}
  resolveEventWaiters(){for(const waiter of this.eventWaiters||[]){clearTimeout(waiter.timer);try{waiter.resolve()}catch{}}this.eventWaiters?.clear()}
  enqueue(command,args={}){const evt={id:this.nextEventId++,ts:Date.now(),command,args};this.events.push(evt);if(this.events.length>500)this.events.splice(0,this.events.length-500);this.resolveEventWaiters();return evt}
  command(command,args={}){this.enqueue(command,args);this.applyOptimisticCommand(command,args);this.publish(true)}
  parseSeconds(token){const raw=String(token||'').toLowerCase(),m=raw.match(/^(\d+(?:\.\d+)?)(s|m|h)?$/);if(!m)return 0;const value=Number(m[1]),unit=m[2]||'s';return Math.max(0,Math.round(value*(unit==='h'?3600:unit==='m'?60:1)))}
  enqueuePath(path){
    const parts=path.split('/').filter(Boolean);if(parts[0]!=='timer')return false;const op=parts[1]||''
    if(['add','subtract','set','preset'].includes(op)){this.command(op==='preset'?'set':op,{seconds:this.parseSeconds(parts[2])});return true}
    if(op==='queue'){
      const q=parts[2]||'';if(q==='add'){this.command('queue_add',{seconds:this.parseSeconds(parts[3])});return true}if(q==='start'){this.command('queue_start');return true}if(q==='next'){this.command('queue_next');return true}if(q==='clear'){this.command('queue_clear');return true}if(q==='remove-last'){this.command('queue_remove_last');return true}
    }
    if(op==='feature'&&parts[2]){this.command('feature',{feature:parts[2],op:parts[3]||'toggle'});return true}
    if(op==='size'&&parts[2]){const percent=Math.max(60,Math.min(200,Number(parts[2])||100));this.command('size',{scale:percent/100});return true}
    const map={start:'start',pause:'pause',resume:'resume',toggle:'toggle',reset:'reset',stop:'stop',next:'queue_next'};if(map[op]){this.command(map[op]);return true}return false
  }
  async send(path){if(!this.enqueuePath(path))this.log('warn',`Unknown AV Timer command path: ${path}`)}

  getLiveSeconds(now=Date.now(),source=this.state||{}){
    let seconds=Number(source.seconds||0)
    if(source.running&&!source.paused&&Number(source.clockAnchorMs)>0){
      const delta=Math.max(0,(now-Number(source.clockAnchorMs))/1000)
      seconds=source.countUp?Math.max(0,Number(source.anchorElapsed||0)+delta):Math.max(0,Number(source.anchorRemaining||source.seconds||0)-delta)
    }
    return seconds
  }
  formatTime(seconds){const total=Math.max(0,Math.round(Number(seconds)||0)),h=Math.floor(total/3600),m=Math.floor((total%3600)/60),s=total%60;return h>0?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
  getLiveState(now=Date.now()){
    const source=this.state||{},s={...source},seconds=this.getLiveSeconds(now,source),duration=Math.max(0,Number(source.duration||0))
    s.seconds=seconds;s.displayTime=this.formatTime(seconds);s.formatted=s.displayTime
    const total=Math.floor(Math.abs(Number(seconds)||0));
    const pad=n=>String(n).padStart(2,'0');
    s.days=pad(Math.floor(total/86400));s.hours=pad(Math.floor(total/3600));
    s.hoursInDay=pad(Math.floor(total/3600)%24);s.minutes=pad(Math.floor(total/60)%60);
    s.secondsPart=pad(total%60);s.totalHours=s.hours;
    s.totalMinutes=String(Math.floor(total/60));s.totalSeconds=String(total)
    if(!source.countUp&&source.running&&seconds<=0){s.running=false;s.paused=false;s.finished=true}
    s.status=s.finished?'TIME':s.paused?'PAUSED':s.running?(s.countUp?'COUNTING UP':'RUNNING'):duration>0?'ARMED':'READY'
    s.pauseResumeLabel=s.paused?'RESUME':'PAUSE'
    const display=source.display||{},warningsEnabled=source.warningsEnabled!==false&&display.warningsEnabled!==false
    if(warningsEnabled&&!s.finished){
      const warningRemaining=s.countUp&&duration>0?Math.max(0,duration-seconds):Math.max(0,seconds)
      const rules=(display.warningRules||[]).filter(r=>r&&r.enabled!==false&&Number(r.threshold)>0&&warningRemaining<=Number(r.threshold)).sort((a,b)=>Number(a.threshold)-Number(b.threshold))
      const warning=rules[0]||null;s.warningActive=!!warning;s.warningLabel=warning?.label||'';s.warningColor=warning?.color||'';s.warningRemaining=warningRemaining
    }else if(s.finished){s.warningActive=false;s.warningLabel=''}
    s.progressPercent=duration>0?Math.max(0,Math.min(100,(seconds/duration)*100)):0
    return s
  }
  captureLiveToAnchors(){const live=this.getLiveState(),now=Date.now();this.state.seconds=live.seconds;this.state.clockAnchorMs=now;if(this.state.countUp)this.state.anchorElapsed=live.seconds;else this.state.anchorRemaining=live.seconds;return live}
  applyOptimisticCommand(command,args={}){
    const s=this.state||(this.state={}),seconds=Math.max(0,Number(args.seconds||0)),now=Date.now(),live=this.captureLiveToAnchors()
    if(command==='clock_mode'){const mode=String(args.mode||'toggle');s.displayMode=mode==='toggle'?(s.displayMode==='clock'?'timer':'clock'):(mode==='clock'?'clock':'timer')}
    else if(command==='clock_format'){s.clockFormat=String(args.format)==='12'?'12':'24'}
    else if(command==='set'){s.duration=seconds;s.seconds=seconds;s.anchorRemaining=seconds;s.anchorElapsed=0;s.clockAnchorMs=now;s.finished=false;if(!s.running)s.paused=false}
    else if(command==='add'||command==='subtract'){const delta=command==='add'?seconds:-seconds,next=Math.max(0,Number(live.seconds||0)+delta);s.seconds=next;s.duration=Math.max(0,Number(s.duration||0)+delta);if(s.countUp&&s.running)s.anchorElapsed=next;else s.anchorRemaining=next;s.clockAnchorMs=now;if(s.finished&&next>0){s.finished=false;s.running=true;s.paused=false}}
    else if(command==='start'){if(Number(s.duration||live.seconds||0)>0||s.countUp){s.running=true;s.paused=false;s.finished=false;s.clockAnchorMs=now;if(s.countUp)s.anchorElapsed=Number(live.seconds||0);else s.anchorRemaining=Number(live.seconds||s.duration||0)}}
    else if(command==='pause'&&s.running&&!s.paused){s.seconds=live.seconds;s.paused=true;s.clockAnchorMs=now;if(s.countUp)s.anchorElapsed=live.seconds;else s.anchorRemaining=live.seconds}
    else if(command==='resume'&&s.running&&s.paused){s.paused=false;s.clockAnchorMs=now;if(s.countUp)s.anchorElapsed=Number(s.seconds||0);else s.anchorRemaining=Number(s.seconds||0)}
    else if((command==='toggle'||command==='start_pause')&&!s.running){if(Number(s.duration||live.seconds||0)>0||s.countUp){s.running=true;s.paused=false;s.finished=false;s.clockAnchorMs=now;if(s.countUp)s.anchorElapsed=Number(live.seconds||0);else s.anchorRemaining=Number(live.seconds||s.duration||0)}}
    else if((command==='toggle'||command==='start_pause')&&s.running){if(s.paused){s.paused=false;s.clockAnchorMs=now;if(s.countUp)s.anchorElapsed=Number(s.seconds||0);else s.anchorRemaining=Number(s.seconds||0)}else{s.seconds=live.seconds;s.paused=true;s.clockAnchorMs=now;if(s.countUp)s.anchorElapsed=live.seconds;else s.anchorRemaining=live.seconds}}
    else if(command==='reset'){s.seconds=Number(s.duration||0);s.running=Number(s.duration||0)>0||!!s.countUp;s.paused=false;s.finished=false;s.clockAnchorMs=now;s.anchorRemaining=Number(s.duration||0);s.anchorElapsed=0}
    else if(command==='stop'){Object.assign(s,{seconds:0,duration:0,running:false,paused:false,finished:false,countUp:false,clockAnchorMs:0,anchorRemaining:0,anchorElapsed:0,queueActive:false,queueAwaitingNext:false})}
    else if(command==='feature'){
      const feature=String(args.feature||'').toLowerCase(),keyMap={queue:'queueEnabled',warnings:'warningsEnabled',warning:'warningsEnabled',progress:'progressEnabled',gradient:'gradientEnabled',minimal:'minimalEnabled',chroma:'chromaEnabled',light:'lightEnabled',auto_next:'autoNext',autostart:'autostart',count_up:'countUp',timer_flash:'timerFlash',banner:'bannerVisible'},key=keyMap[feature]
      if(key){const current=s[key]!==undefined?!!s[key]:(key==='warningsEnabled'||key==='gradientEnabled'||key==='autostart');s[key]=args.op==='on'?true:args.op==='off'?false:!current}
    }
    else if(command==='size'){s.outputScale=Math.max(.6,Math.min(2,Number(args.scale)||1));s.display={...(s.display||{}),scale:s.outputScale}}
    else if(command==='queue_add'){s.queueLength=Math.max(0,Number(s.queueLength||0)+1);s.queueEnabled=true}
    else if(command==='queue_remove_last'){s.queueLength=Math.max(0,Number(s.queueLength||0)-1)}
    else if(command==='queue_clear'){s.queueLength=0}
    else if(command==='queue_set_name'){s.queueName=String(args.name||'')}
    else if(command==='message'){s.presenterMessage=String(args.text||'').slice(0,300);s.bannerVisible=true;s.display={...(s.display||{}),presenterMessage:{...(s.display?.presenterMessage||{}),...args,visible:true}}}
    else if(command==='message_show'){s.bannerVisible=true;s.display={...(s.display||{}),presenterMessage:{...(s.display?.presenterMessage||{}),visible:true}}}
    else if(command==='message_hide'){s.bannerVisible=false;s.display={...(s.display||{}),presenterMessage:{...(s.display?.presenterMessage||{}),visible:false}}}
    else if(command==='message_clear'){s.presenterMessage='';s.bannerText='';s.bannerVisible=false;s.display={...(s.display||{}),presenterMessage:{...(s.display?.presenterMessage||{}),text:'',visible:false,flash:false}}}
    else if(command==='flash_message'){const cur=!!s.flashMessage;s.flashMessage=args.op==='on'?true:args.op==='off'?false:!cur}
  }

  publish(force=false){
    const s=this.getLiveState(),displayTime=s.displayTime||'00:00'
    const zone=String(s.clockTimeZone||s.display?.clockTimeZone||'UTC');
    const clockParts=()=>{let m;try{m=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]))}catch{m=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value]))}const h=Number(m.hour)||0;return {a:`${String(h).padStart(2,'0')}:${m.minute}:${m.second}`,b:`${String(h%12||12).padStart(2,'0')}:${m.minute}:${m.second} ${h>=12?'PM':'AM'}`}};
    const cp=clockParts(),clockFormat=String(s.clockFormat)==='12'?'12':'24';
    const live=modeValues(s,Date.now());
    if(this.network?.server)this.network.setState({state:{...s},display:this.state?.display||{}})
    const values={
      clock_mode:s.displayMode==='clock'?'clock':'timer',clock_format:clockFormat,clock_time:clockFormat==='12'?cp.b:cp.a,clock_time_24:cp.a,clock_time_12:cp.b,clock_timezone:zone,
      live_time:live.time,live_days:live.days,live_hours:live.hours,live_hours_in_day:live.hoursInDay,live_minutes:live.minutes,live_seconds:live.seconds,live_ampm:live.ampm,live_mode:live.mode,play_pause_text:playPauseText(s),
      display_time:displayTime,remaining:displayTime,days:s.days||'00',hours:s.hours||'00',hours_in_day:s.hoursInDay||'00',minutes:s.minutes||'00',seconds_part:s.secondsPart||'00',total_hours:s.totalHours||'00',total_minutes:s.totalMinutes||'0',total_seconds:s.totalSeconds||'0',
      seconds:Math.max(0,Math.round(Number(s.seconds||0))),duration:Math.max(0,Math.round(Number(s.duration||0))),status:s.status||'READY',
      connection_status:this.browserOnline?'CONNECTED':'OFFLINE',pause_resume_label:s.pauseResumeLabel||'PAUSE',running:s.running&&!s.paused?'yes':'no',paused:s.paused?'yes':'no',
      warning:s.warningActive?'yes':'no',warning_label:s.warningLabel||'',warning_display:s.warningActive?(s.warningLabel||'WARNING'):'WARNING\nOFF',warning_remaining:Math.max(0,Math.round(Number(s.warningRemaining||0))),
      queue_length:Math.max(0,Math.round(Number(s.queueLength||0))),queue_enabled:s.queueEnabled?'yes':'no',warnings_enabled:s.warningsEnabled===false?'no':'yes',progress_enabled:s.progressEnabled?'yes':'no',
      gradient_enabled:s.gradientEnabled===false?'no':'yes',minimal_enabled:s.minimalEnabled?'yes':'no',chroma_enabled:s.chromaEnabled?'yes':'no',light_enabled:s.lightEnabled?'yes':'no',auto_next:s.autoNext?'yes':'no',
      autostart:s.autostart===false?'no':'yes',count_up:s.countUp?'yes':'no',output_size:Math.round(Number(s.outputScale||s.display?.scale||1)*100),
      queue_state:s.queueEnabled?'ON':'OFF',warnings_state:s.warningsEnabled===false?'OFF':'ON',progress_state:s.progressEnabled?'ON':'OFF',gradient_state:s.gradientEnabled===false?'OFF':'ON',
      minimal_state:s.minimalEnabled?'ON':'OFF',chroma_state:s.chromaEnabled?'ON':'OFF',light_state:s.lightEnabled?'ON':'OFF',auto_next_state:s.autoNext?'ON':'OFF',autostart_state:s.autostart===false?'OFF':'ON',count_up_state:s.countUp?'ON':'OFF',
      timer_flash_state:(s.timerFlash||s.display?.timerFlash)?'ON':'OFF',banner_flash_state:s.flashMessage?'ON':'OFF',message_state:s.bannerVisible?'VISIBLE':'HIDDEN',message_text:s.presenterMessage||s.bannerText||s.display?.presenterMessage?.text||'',
      queue_name:s.queueName||'',current_item:s.currentItemName||'',next_item:s.nextItemName||'',network_viewers:this.network?.clients?.size||0,
      bridge_online:this.browserOnline?'yes':'no',browser_online:this.browserOnline?'yes':'no',feedback_instances:this.feedbackInstances.size
    }
    const changed={};for(const [k,v] of Object.entries(values)){if(force||this.lastValues[k]!==v)changed[k]=v}
    if(Object.keys(changed).length){this.setVariableValues(changed);Object.assign(this.lastValues,changed)}
    const sig=JSON.stringify({t:values.display_time,status:values.status,conn:values.connection_status,paused:values.paused,running:values.running,warning:values.warning,q:values.queue_length,qe:values.queue_enabled,we:values.warnings_enabled,pe:values.progress_enabled,ge:values.gradient_enabled,me:values.minimal_enabled,ce:values.chroma_enabled,le:values.light_enabled,an:values.auto_next,as:values.autostart,cu:values.count_up,os:values.output_size,tf:values.timer_flash_state,msg:values.message_state,fi:values.feedback_instances,clock:values.clock_mode,clock_format:values.clock_format,live_time:values.live_time,live_day:values.live_days,live_ampm:values.live_ampm,play_pause:values.play_pause_text,banner_flash:values.banner_flash_state,banner_text:values.message_text,clock_toggle:values.clock_mode,finished:s.finished})
    if(force||sig!==this.lastFeedbackSignature){
      this.lastFeedbackSignature=sig
      this.checkFeedbacks('bridge_online','browser_online','running','paused','warning_active','finished','queue_enabled','warnings_enabled','progress_enabled','gradient_enabled','minimal_enabled','chroma_enabled','light_enabled','auto_next','autostart','count_up','display_value','pause_resume_state','feature_state','timer_flash','message_visible','clock_mode','live_mode_value','start_pause_live','control_state','clock_button_state','clock_format_state','banner_toggle_state','banner_flash_state','banner_action_state','message_preset_state')
    }
  }
}

class Runtime {
  constructor(){
    this.config={};this.secrets={};this.label='JC - AV Timer'
    this.module=new JCAVTimerInstance(this)
    this.ipc=new Ipc({
      init:msg=>this.onInit(msg),destroy:()=>this.onDestroy(),updateConfigAndLabel:msg=>this.onConfig(msg),updateConfig:config=>this.onConfig({config,label:this.label,secrets:this.secrets}),
      executeAction:msg=>this.module.executeAction(msg),updateFeedbacks:msg=>{this.module.handleUpdateFeedbacks(msg?.feedbacks||{});return undefined},updateActions:()=>undefined,
      upgradeActionsAndFeedbacks:msg=>({updatedConfig:this.config,updatedSecrets:this.secrets,updatedActions:msg?.actions||[],updatedFeedbacks:msg?.feedbacks||[],latestUpgradeIndex:-1}),
      getConfigFields:()=>({fields:this.module.getConfigFields()}),learnAction:()=>({options:undefined}),learnFeedback:()=>({options:undefined}),startStopRecordActions:()=>undefined,variablesChanged:()=>undefined,sharedUdpSocketMessage:()=>undefined,sharedUdpSocketError:()=>undefined
    })
  }
  sendNoCb(name,payload){this.ipc.sendNoCb(name,payload)}
  async onInit(msg){this.label=msg?.label||this.label;this.config={...(msg?.config||{})};this.secrets=msg?.secrets||{};if(!this.config.port)this.config.port='3210';if(!this.config.networkPort)this.config.networkPort='3211';if(msg?.isFirstInit)this.sendNoCb('saveConfig',{config:this.config});await this.module.init(this.config);if(msg?.feedbacks)this.module.handleUpdateFeedbacks(msg.feedbacks);return {hasHttpHandler:false,hasRecordActionsHandler:false,newUpgradeIndex:-1,disableNewConfigLayout:false,updatedConfig:this.config}}
  async onDestroy(){await this.module.destroy()}
  async onConfig(msg){this.label=msg?.label||this.label;this.config={...(msg?.config||{})};this.secrets=msg?.secrets||{};if(!this.config.port)this.config.port='3210';if(!this.config.networkPort)this.config.networkPort='3211';await this.module.configUpdated(this.config)}
  async start(){
    const manifestPath=process.env.MODULE_MANIFEST;if(!manifestPath)throw new Error('Module initialise is missing MODULE_MANIFEST')
    const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));if(manifest.runtime?.api!=='nodejs-ipc')throw new Error("Module manifest 'api' mismatch")
    const connectionId=process.env.CONNECTION_ID,verificationToken=process.env.VERIFICATION_TOKEN;if(!connectionId)throw new Error('Module initialise is missing CONNECTION_ID');if(!verificationToken)throw new Error('Module initialise is missing VERIFICATION_TOKEN')
    await this.ipc.sendWithCb('register',{apiVersion:manifest.runtime.apiVersion||API_VERSION,connectionId,verificationToken});console.log('JC - AV Timer module registered')
  }
}

new Runtime().start().catch(err=>{console.error('Failed to startup JC - AV Timer module:',err?.stack||err);process.exit(1)})
