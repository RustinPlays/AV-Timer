(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const T = window.AVTimer;
  const R = window.AVRemote;
  const S = window.AVSync;
  if (!T || !R || !S) return;

  const ADJUST_PRESETS = [60,120,300,600,900,1800,2700,3600];
  const SETTINGS_KEY = 'jcAvTimerSettingsV5';
  const RECOVERY_KEY = 'jcAvTimerRecoveryV5';
  const CUSTOM_FONT_KEY = 'jcAvTimerCustomFontV5';
  const DEFAULT_BG = '#00324b';

  let outputWindow = null;
  let companionIsOnline = false;
  let recoveryTimer = null;
  let customFontName = '';

  const els = {
    input:$('timeInput'), operatorTimer:$('operatorTimer'), operatorState:$('operatorStateText'), operatorWarning:$('operatorWarning'), runStatus:$('runStatus'),
    startPause:$('startPauseBtn'), reset:$('resetRunBtn'), stop:$('stopBtn'), next:$('nextTimerButton'), countUp:$('countUpToggle'), autostart:$('autostartToggle'),
    queueInput:$('queueTimeInput'), queueLabel:$('queueLabelInput'), queueList:$('queueList'),
    bridge:$('bridgeStatus'), companionPort:$('companionPort'), bridgeHint:$('bridgeConnectionHint'),
    outputStatus:$('outputWindowStatus'), preview:$('previewFrame'), overlay:$('localOutputOverlay'), warningRules:$('warningRulesList'),
    messageInput:$('messageInput'), bannerToggle:$('bannerToggleBtn'), flashMessage:$('flashMessageBtn'), flashTimer:$('flashTimerBtn'),
    showProgress:$('showProgressCheckbox'), gradient:$('gradientToggle'), shadow:$('shadowToggle'), warningsToggle:$('warningsToggle'),
    fontSelect:$('fontSelect'), fontWeight:$('fontWeight'), customFontInput:$('customFontInput'), fontStatus:$('fontStatus'), chromaOptions:$('chromaOptions'),
    helpModal:$('helpModal'), contextHelpModal:$('contextHelpModal'), shortcutModal:$('shortcutModal')
  };

  const freshWarnings = () => [
    { id:'five-min', enabled:true, threshold:300, label:'Please wrap up soon', color:'#f59e0b' },
    { id:'two-min', enabled:true, threshold:120, label:'Please wrap up now', color:'#ff3030' }
  ];
  const defaults = () => ({
    bg:DEFAULT_BG, fg:'#f5f5f5', progress:'#ff4b4b', timeColor:'#ff3030', scale:1,
    light:false, chroma:false, chromaColor:'#00ff00', chromaInvert:false, gradient:true, showProgress:false, shadow:true,
    fontFamily:'Inter', fontWeight:'900', warningsEnabled:true, countUp:false, autostart:true,
    warningRules:freshWarnings(), bannerVisible:true, presenterMessage:'', flashTimer:false, flashMessage:false
  });
  const settings = defaults();
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const uid = () => crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const helpText = {
    timer:['Live Timer','Enter a duration or choose a Set Timer preset. Start changes to Pause while running. Reset returns to the loaded duration; Stop sets the timer to zero. Countdown continues below zero in red.'],
    adjust:['Adjust Running Timer','These buttons add or remove time from the current timer. They are separate from Set Timer presets, which replace the loaded duration.'],
    queue:['Timer Queue','Add a duration and optional label. Press ▶ on any cue to jump straight to it. Next Cue always advances manually; no automatic follow is used.'],
    appearance:['Appearance','Choose output colours, size, font and display style. Light mode is fixed; changing a colour switches back to colour mode. Chroma disables gradient and shadow and uses a hard outline.'],
    warnings:['Warning Stages','Warnings automatically change the timer colour and show a banner. The most urgent matching stage wins. Presenter messages override warning banners.'],
    messages:['Presenter Message','Send any text to the lower-third banner. Hide keeps the text stored but invisible. Clear removes it. Flash Message only flashes the banner, never the timer.'],
    output:['Output Monitor','PiP is a live preview. Open External Timer Window creates the clean output. Focus and Close control that pop-out; Refresh PiP reloads only the preview.']
  };

  function formatPreset(seconds){ return seconds === 3600 ? '60m' : `${seconds/60}m`; }
  function displaySeconds(seconds){ return T.formatTime(Math.round(Number(seconds)||0)); }
  function inputSeconds(){ return T.parseTime(els.input.value); }
  function setInputSeconds(seconds){ const v=Math.max(0,Number(seconds)||0); els.input.value=v>0?T.formatTime(v):''; }

  function loadSettings(){
    try { const saved=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null'); if(saved) Object.assign(settings,saved); } catch {}
    if(!Array.isArray(settings.warningRules)) settings.warningRules=freshWarnings();
    settings.warningRules=settings.warningRules.map(r=>({id:r.id||uid(),enabled:r.enabled!==false,threshold:Math.max(0,Number(r.threshold)||0),label:String(r.label??''),color:r.color||'#ff3030'}));
    applySettingsToControls(); renderWarningRules(); restoreCustomFont(); restoreRecovery();
  }
  function saveSettings(){
    const persist={...settings,presenterMessage:settings.presenterMessage};
    try{ localStorage.setItem(SETTINGS_KEY,JSON.stringify(persist)); }catch{}
  }
  function scheduleRecovery(){
    clearTimeout(recoveryTimer);
    recoveryTimer=setTimeout(()=>{
      try{ localStorage.setItem(RECOVERY_KEY,JSON.stringify({savedAt:Date.now(),timer:T.snapshot(),settings:{presenterMessage:settings.presenterMessage,bannerVisible:settings.bannerVisible,flashTimer:settings.flashTimer,flashMessage:settings.flashMessage}})); }catch{}
    },120);
  }
  function restoreRecovery(){
    try{
      const rec=JSON.parse(localStorage.getItem(RECOVERY_KEY)||'null');
      if(!rec||!rec.timer) return;
      T.restore(rec.timer);
      if(rec.settings){ settings.presenterMessage=String(rec.settings.presenterMessage||''); settings.bannerVisible=rec.settings.bannerVisible!==false; settings.flashTimer=!!rec.settings.flashTimer; settings.flashMessage=!!rec.settings.flashMessage; }
      if(els.messageInput) els.messageInput.value=settings.presenterMessage;
      applySettingsToControls();
    }catch{}
  }

  function applySettingsToControls(){
    $('bgColor').value=settings.bg||DEFAULT_BG; $('fgColor').value=settings.fg||'#f5f5f5'; $('accentColor').value=settings.progress||'#ff4b4b'; $('timeColor').value=settings.timeColor||'#ff3030'; $('chromaColor').value=settings.chromaColor||'#00ff00';
    $('timerSizeSlider').value=Math.round((Number(settings.scale)||1)*100);
    els.gradient.checked=settings.gradient!==false; els.showProgress.checked=!!settings.showProgress; els.shadow.checked=settings.shadow!==false; els.warningsToggle.checked=settings.warningsEnabled!==false; els.countUp.checked=!!settings.countUp; els.autostart.checked=settings.autostart!==false;
    els.fontSelect.value=[...els.fontSelect.options].some(o=>o.value===settings.fontFamily)?settings.fontFamily:'Inter'; els.fontWeight.value=String(settings.fontWeight||'900');
    $('modeToggle').textContent=settings.light?'Colour / Dark Mode':'Light Mode'; $('modeToggle').classList.toggle('active',!!settings.light); $('chromaModeToggle').classList.toggle('active',!!settings.chroma); $('chromaInvertBtn').classList.toggle('active',!!settings.chromaInvert);
    els.chromaOptions.classList.toggle('hidden',!settings.chroma);
    const locked=!!settings.chroma;
    $('bgColor').disabled=locked; els.gradient.disabled=locked; els.shadow.disabled=locked; $('modeToggle').disabled=locked;
    els.bannerToggle.textContent=settings.bannerVisible?'Hide Banner':'Show Banner'; els.flashTimer.textContent=`Flash Timer: ${settings.flashTimer?'On':'Off'}`; els.flashTimer.classList.toggle('active',!!settings.flashTimer); els.flashMessage.textContent=`Flash Message: ${settings.flashMessage?'On':'Off'}`; els.flashMessage.classList.toggle('active',!!settings.flashMessage);
  }

  function switchToColourMode(){ if(settings.light){ settings.light=false; $('modeToggle').textContent='Light Mode'; $('modeToggle').classList.remove('active'); } }
  function settingsChanged(){ saveSettings(); applySettingsToControls(); sync(T.snapshot()); scheduleRecovery(); }

  function warningRemaining(state){ if(state.countUp) return state.duration>0?Math.max(0,state.duration-state.elapsed):Infinity; return Math.max(0,state.remaining); }
  function activeWarning(state){
    if(!settings.warningsEnabled||state.countUp||state.remaining<=0) return null;
    const remaining=warningRemaining(state); if(!Number.isFinite(remaining)) return null;
    return settings.warningRules.filter(r=>r.enabled&&Number(r.threshold)>0&&remaining<=Number(r.threshold)).sort((a,b)=>Number(a.threshold)-Number(b.threshold))[0]||null;
  }
  function currentCue(state=T.state){ return state.queue.find(c=>c.id===state.currentQueueId)||null; }
  function nextCue(state=T.state){ if(!state.queue.length)return null; if(!state.currentQueueId)return state.queue[0]; const i=state.queue.findIndex(c=>c.id===state.currentQueueId); return i>=0?state.queue[i+1]||null:state.queue[0]; }
  function bannerData(state){
    if(!settings.bannerVisible) return {visible:false,text:'',kind:'hidden'};
    if(settings.presenterMessage.trim()) return {visible:true,text:settings.presenterMessage.trim(),kind:'message'};
    const warning=activeWarning(state); if(warning?.label) return {visible:true,text:warning.label,kind:'warning',color:warning.color};
    const cue=currentCue(state); if(cue?.label) return {visible:true,text:cue.label,kind:'cue'};
    return {visible:false,text:'',kind:'none'};
  }

  function renderWarningRules(){
    els.warningRules.innerHTML=''; els.warningRules.classList.toggle('rules-disabled',!settings.warningsEnabled);
    if(!settings.warningRules.length){ const e=document.createElement('div');e.className='warning-empty';e.textContent='No warning stages';els.warningRules.append(e);return; }
    settings.warningRules.forEach(rule=>{
      const row=document.createElement('div');row.className='warning-rule';
      const enabled=document.createElement('input');enabled.type='checkbox';enabled.checked=rule.enabled;enabled.title='Enable warning';
      const threshold=document.createElement('input');threshold.type='text';threshold.value=T.formatTime(rule.threshold);threshold.placeholder='5:00';threshold.className='warning-time';
      const label=document.createElement('input');label.type='text';label.value=rule.label;label.placeholder='Warning text';label.className='warning-label-input';
      const color=document.createElement('input');color.type='color';color.value=rule.color;
      const del=document.createElement('button');del.type='button';del.textContent='×';del.className='warning-delete';
      enabled.onchange=()=>{rule.enabled=enabled.checked;settingsChanged()}; threshold.onchange=()=>{rule.threshold=T.parseTime(threshold.value);threshold.value=T.formatTime(rule.threshold);settingsChanged()}; label.oninput=()=>{rule.label=label.value;settingsChanged()}; color.oninput=()=>{rule.color=color.value;settingsChanged()};
      del.onclick=()=>{settings.warningRules=settings.warningRules.filter(r=>r.id!==rule.id);renderWarningRules();settingsChanged()};
      row.append(enabled,threshold,label,color,del);els.warningRules.append(row);
    });
  }

  function renderQueue(state=T.state){
    els.queueList.innerHTML='';
    if(!state.queue.length){ const li=document.createElement('li');li.className='queue-empty';li.textContent='No queued timers';els.queueList.append(li); }
    state.queue.forEach((cue,i)=>{
      const li=document.createElement('li');li.className='queue-item';li.classList.toggle('active',cue.id===state.currentQueueId);
      const play=document.createElement('button');play.className='queue-play';play.textContent='▶';play.title='Play this cue now';play.onclick=()=>T.queuePlay(i);
      const idx=document.createElement('span');idx.className='queue-index';idx.textContent=String(i+1).padStart(2,'0');
      const info=document.createElement('div');info.className='queue-info';const label=document.createElement('strong');label.textContent=cue.label||`Cue ${i+1}`;const time=document.createElement('span');time.textContent=displaySeconds(cue.seconds);info.append(label,time);
      const remove=document.createElement('button');remove.textContent='×';remove.title='Remove cue';remove.onclick=()=>T.queueRemove(i);
      li.append(play,idx,info,remove);els.queueList.append(li);
    });
  }

  function timeParts(seconds){ const neg=Number(seconds)<0;const total=Math.abs(Math.round(Number(seconds)||0));return{hours:`${neg?'-':''}${String(Math.floor(total/3600)).padStart(2,'0')}`,minutes:String(Math.floor((total%3600)/60)).padStart(2,'0'),seconds:String(total%60).padStart(2,'0')}; }
  function buildLivePayload(state,extra={}){
    const seconds=state.countUp?state.elapsed:state.remaining;
    const warning=activeWarning(state); const parts=timeParts(seconds); const overtime=!state.countUp&&Number(state.remaining)<=0&&state.duration>0;
    let progressPercent=state.duration>0?(state.countUp?Math.min(100,state.elapsed/state.duration*100):Math.max(0,Math.min(100,state.remaining/state.duration*100))):0;
    if(overtime) progressPercent=0;
    const banner=bannerData(state); if(extra.testWarningColor) banner.color=extra.testWarningColor;
    const cur=currentCue(state), next=nextCue(state), currentIndex=cur?state.queue.findIndex(c=>c.id===cur.id):-1;
    const status=overtime?'OVERTIME':state.paused?'PAUSED':state.running?(state.countUp?'COUNTING UP':'RUNNING'):state.duration>0?'ARMED':'READY';
    return {version:5,sentAt:Date.now(),state:{
      running:state.running,paused:state.paused,finished:overtime,countUp:state.countUp,clockAnchorMs:Number(state.clockAnchorMs||0),anchorRemaining:Number(state.anchorRemaining??state.remaining??0),anchorElapsed:Number(state.anchorElapsed??state.elapsed??0),seconds:Math.round(seconds),formatted:displaySeconds(seconds),displayTime:displaySeconds(seconds),hours:parts.hours,minutes:parts.minutes,secondsPart:parts.seconds,duration:Math.round(state.duration),status,pauseResumeLabel:state.running&&!state.paused?'PAUSE':'START',progressPercent,
      warningActive:!!warning,warningId:warning?.id||'',warningLabel:warning?.label||'',warningColor:warning?.color||'',warningRemaining:Number.isFinite(warningRemaining(state))?Math.round(warningRemaining(state)):0,
      queueLength:state.queue.length,queueActive:state.queueActive,currentCueIndex:currentIndex,currentCueNumber:currentIndex>=0?currentIndex+1:0,currentCueLabel:cur?.label||'',currentCueDuration:cur?.seconds||0,nextCueLabel:next?.label||'',nextCueDuration:next?.seconds||0,hasNextCue:!!next,
      warningsEnabled:!!settings.warningsEnabled,progressEnabled:!!settings.showProgress,gradientEnabled:settings.gradient!==false,chromaEnabled:!!settings.chroma,lightEnabled:!!settings.light,shadowEnabled:settings.shadow!==false,autostart:settings.autostart!==false,
      bannerVisible:banner.visible,bannerText:banner.text,bannerKind:banner.kind,flashTimer:!!settings.flashTimer,flashMessage:!!settings.flashMessage,presenterMessage:settings.presenterMessage,remoteViewerCount:window.AVCloudSync?.getState?.().connections||0,outputScale:Number(settings.scale)||1
    },display:{...settings,warningRules:clone(settings.warningRules)}};
  }
  function publish(state=T.snapshot()){ const payload=buildLivePayload(state);S.publish(payload);R.publishState({...payload.state,display:payload.display,updatedAt:Date.now()}); }

  function sync(state){
    const payload=buildLivePayload(state); const seconds=state.countUp?state.elapsed:state.remaining; const overtime=!state.countUp&&seconds<=0&&state.duration>0;
    els.operatorTimer.textContent=displaySeconds(seconds); els.operatorTimer.classList.toggle('overtime',overtime); els.operatorTimer.style.color=payload.state.warningActive&&!overtime?payload.state.warningColor:'';
    els.operatorWarning.textContent=payload.state.warningLabel; els.operatorWarning.style.setProperty('--warning-chip',payload.state.warningColor||'#ff3030'); els.operatorWarning.classList.toggle('hidden',!payload.state.warningActive||!payload.state.warningLabel);
    const statusClass=overtime?'finished':state.paused?'paused':state.running?'running':'idle';els.operatorState.textContent=payload.state.status;els.runStatus.textContent=payload.state.status;els.runStatus.className=`status-pill ${statusClass}`;
    els.startPause.textContent=state.running&&!state.paused?'Pause':'Start';els.startPause.classList.toggle('start',!state.running||state.paused);els.startPause.classList.toggle('pause',state.running&&!state.paused);
    els.reset.disabled=state.duration<=0;els.stop.disabled=state.duration<=0&&!state.running;els.next.disabled=!payload.state.hasNextCue;
    if(!state.running&&document.activeElement!==els.input){ if(state.duration>0)setInputSeconds(state.duration);else if(!overtime)els.input.value=''; }
    renderQueue(state); publish(state); scheduleRecovery();
  }

  T.onChange(sync); S.onStateRequest(()=>publish());

  function startConfigured(forceRunning=false){ const typed=inputSeconds(); if(!T.state.running&&typed>0&&typed!==Math.round(T.state.duration))T.setTime(typed); if(T.state.running)return T.togglePause(); const paused=forceRunning?false:!settings.autostart;return T.start(null,{countUp:!!settings.countUp,paused}); }
  function setFeature(feature,op='toggle'){
    const toggle=(v)=>op==='on'?true:op==='off'?false:!v; const f=String(feature||'').toLowerCase();
    if(f==='warnings')settings.warningsEnabled=toggle(!!settings.warningsEnabled);else if(f==='progress')settings.showProgress=toggle(!!settings.showProgress);else if(f==='gradient'&&!settings.chroma)settings.gradient=toggle(settings.gradient!==false);else if(f==='shadow'&&!settings.chroma)settings.shadow=toggle(settings.shadow!==false);else if(f==='chroma')settings.chroma=toggle(!!settings.chroma);else if(f==='banner')settings.bannerVisible=toggle(!!settings.bannerVisible);else if(f==='flash_timer')settings.flashTimer=toggle(!!settings.flashTimer);else if(f==='flash_message')settings.flashMessage=toggle(!!settings.flashMessage);else return; settingsChanged();
  }
  function remoteCommand(evt){ const c=evt.command,a=evt.args||{},seconds=Number(a.seconds??a.value??0);
    if(c==='add')T.adjust(Math.abs(seconds));else if(c==='subtract')T.adjust(-Math.abs(seconds));else if(c==='set'||c==='preset')T.setTime(seconds);else if(c==='start')startConfigured(true);else if(c==='pause')T.pause();else if(c==='resume')T.resume();else if(c==='toggle'||c==='start_pause')startConfigured(true);else if(c==='reset')T.reset();else if(c==='stop')T.stop();else if(c==='queue_next')T.queueNext();else if(c==='queue_play')T.queuePlay(Math.max(0,Number(a.index??a.cue??1)-1));else if(c==='queue_clear')T.queueClear();else if(c==='feature')setFeature(a.feature,a.op||'toggle');else if(c==='message'){settings.presenterMessage=String(a.text||'').slice(0,300);settings.bannerVisible=true;if(els.messageInput)els.messageInput.value=settings.presenterMessage;settingsChanged();}else if(c==='message_clear'){settings.presenterMessage='';els.messageInput.value='';settingsChanged();}else if(c==='message_show')setFeature('banner','on');else if(c==='message_hide')setFeature('banner','off');else if(c==='flash_timer')setFeature('flash_timer',a.op||'toggle');else if(c==='flash_message')setFeature('flash_message',a.op||'toggle');
  }
  R.onCommand(remoteCommand);R.onStatus(ok=>{companionIsOnline=ok;els.bridge.textContent=ok?'Companion connected':'Companion offline';els.bridge.className=`status-pill ${ok?'online':'offline'}`;if(ok)publish();});R.start();

  function buildAdjustButtons(container,direction){ ADJUST_PRESETS.forEach(seconds=>{const b=document.createElement('button');b.textContent=`${direction>0?'+':'−'}${formatPreset(seconds)}`;b.onclick=()=>T.adjust(seconds*direction);container.append(b);}); }
  buildAdjustButtons($('addButtons'),1); buildAdjustButtons($('subtractButtons'),-1);

  els.startPause.onclick=()=>startConfigured(false);els.reset.onclick=()=>T.reset();els.stop.onclick=()=>T.stop();els.next.onclick=()=>T.queueNext();
  document.querySelectorAll('#presetTimes button').forEach(b=>b.onclick=()=>T.setTime(Number(b.dataset.seconds)));
  document.querySelectorAll('[data-output-scale]').forEach(b=>b.onclick=()=>{settings.scale=Math.max(.6,Math.min(2,Number(b.dataset.outputScale)||1));settingsChanged()});
  els.input.addEventListener('change',()=>{if(!T.state.running)T.setTime(inputSeconds())});
  $('queueAddBtn').onclick=()=>{const s=T.parseTime(els.queueInput.value);if(s){T.queueAdd(s,els.queueLabel.value.trim());els.queueInput.value='';els.queueLabel.value='';}};
  els.queueInput.onkeydown=e=>{if(e.key==='Enter')$('queueAddBtn').click()};els.queueLabel.onkeydown=e=>{if(e.key==='Enter')$('queueAddBtn').click()};$('clearQueueBtn').onclick=()=>T.queueClear();
  $('addWarningRuleBtn').onclick=()=>{settings.warningRules.push({id:uid(),enabled:true,threshold:60,label:'Please wrap up now',color:'#ff3030'});renderWarningRules();settingsChanged()};
  els.warningsToggle.onchange=()=>{settings.warningsEnabled=els.warningsToggle.checked;settingsChanged()};els.countUp.onchange=()=>{settings.countUp=els.countUp.checked;T.state.countUp=settings.countUp;settingsChanged()};els.autostart.onchange=()=>{settings.autostart=els.autostart.checked;settingsChanged()};

  [['bgColor','bg'],['fgColor','fg'],['accentColor','progress'],['timeColor','timeColor']].forEach(([id,key])=>{$(id).oninput=e=>{switchToColourMode();settings[key]=e.target.value;settingsChanged()}});
  $('chromaColor').oninput=e=>{settings.chromaColor=e.target.value;settingsChanged()};$('timerSizeSlider').oninput=e=>{settings.scale=Number(e.target.value)/100;settingsChanged()};
  els.gradient.onchange=()=>{if(!settings.chroma){settings.gradient=els.gradient.checked;settingsChanged()}};els.showProgress.onchange=()=>{settings.showProgress=els.showProgress.checked;settingsChanged()};els.shadow.onchange=()=>{if(!settings.chroma){settings.shadow=els.shadow.checked;settingsChanged()}};
  $('modeToggle').onclick=()=>{if(!settings.chroma){settings.light=!settings.light;settingsChanged()}};
  $('minimalPresetBtn').onclick=()=>{Object.assign(settings,{bg:'#000000',fg:'#ffffff',progress:'#ffffff',scale:1,light:false,chroma:false,gradient:false,shadow:false,fontFamily:'Inter',fontWeight:'700'});settingsChanged()};
  $('chromaModeToggle').onclick=()=>{settings.chroma=!settings.chroma;if(settings.chroma){settings.light=false;}settingsChanged()};$('chromaInvertBtn').onclick=()=>{settings.chromaInvert=!settings.chromaInvert;settingsChanged()};

  els.fontSelect.onchange=()=>{settings.fontFamily=els.fontSelect.value;customFontName='';els.fontStatus.textContent='Built-in font';settingsChanged()};els.fontWeight.onchange=()=>{settings.fontWeight=els.fontWeight.value;settingsChanged()};$('resetFontBtn').onclick=()=>{settings.fontFamily='Inter';settings.fontWeight='900';customFontName='';try{localStorage.removeItem(CUSTOM_FONT_KEY)}catch{}els.fontStatus.textContent='Built-in font';settingsChanged()};
  els.customFontInput.onchange=async()=>{const file=els.customFontInput.files?.[0];if(!file)return;if(!/\.(ttf|woff2?|otf)$/i.test(file.name)){els.fontStatus.textContent='Unsupported font file';return;}try{const dataUrl=await readFile(file);const family=`JC Custom ${Date.now()}`;const face=new FontFace(family,`url(${dataUrl})`);await face.load();document.fonts.add(face);customFontName=family;settings.fontFamily=family;els.fontStatus.textContent=`Custom: ${file.name}`;try{localStorage.setItem(CUSTOM_FONT_KEY,JSON.stringify({family,fileName:file.name,dataUrl}))}catch{}settingsChanged()}catch(err){els.fontStatus.textContent=`Font failed: ${err.message}`}};
  function readFile(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('Read failed'));r.readAsDataURL(file)})}
  async function restoreCustomFont(){try{const saved=JSON.parse(localStorage.getItem(CUSTOM_FONT_KEY)||'null');if(!saved?.dataUrl)return;const face=new FontFace(saved.family,`url(${saved.dataUrl})`);await face.load();document.fonts.add(face);customFontName=saved.family;if(settings.fontFamily===saved.family)els.fontStatus.textContent=`Custom: ${saved.fileName||'font'}`;}catch{}}

  $('sendMessageBtn').onclick=()=>{settings.presenterMessage=els.messageInput.value.slice(0,300);settings.bannerVisible=true;settingsChanged()};$('clearMessageBtn').onclick=()=>{settings.presenterMessage='';els.messageInput.value='';settingsChanged()};els.bannerToggle.onclick=()=>setFeature('banner','toggle');els.flashMessage.onclick=()=>setFeature('flash_message','toggle');els.flashTimer.onclick=()=>setFeature('flash_timer','toggle');document.querySelectorAll('[data-message]').forEach(b=>b.onclick=()=>{settings.presenterMessage=b.dataset.message||'';els.messageInput.value=settings.presenterMessage;settings.bannerVisible=true;settingsChanged()});

  function openOutputWindow(){if(outputWindow&&!outputWindow.closed){outputWindow.focus();return outputWindow;}outputWindow=window.open('output.html','jcAvTimerOutput','popup=yes,width=1280,height=720');if(outputWindow){els.outputStatus.textContent='Output open';els.outputStatus.className='status-pill online';setTimeout(()=>publish(),150)}else{els.outputStatus.textContent='Popup blocked';els.outputStatus.className='status-pill offline'}return outputWindow;}
  function focusOutput(){if(outputWindow&&!outputWindow.closed)outputWindow.focus();else openOutputWindow()}function closeOutput(){if(outputWindow&&!outputWindow.closed)try{outputWindow.close()}catch{}outputWindow=null;els.outputStatus.textContent='Preview only';els.outputStatus.className='status-pill idle'}
  $('displayOpenBtn').onclick=openOutputWindow;$('openOutputBtn').onclick=openOutputWindow;$('focusOutputBtn').onclick=focusOutput;$('closeOutputBtn').onclick=closeOutput;$('refreshPreviewBtn').onclick=()=>{els.preview.src=`output.html?preview=1&t=${Date.now()}`;setTimeout(()=>publish(),200)};
  $('outputHereBtn').onclick=async()=>{els.overlay.classList.remove('hidden');setTimeout(()=>publish(),80);try{await els.overlay.requestFullscreen?.()}catch{}};document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement&&!els.overlay.classList.contains('hidden'))els.overlay.classList.add('hidden')});setInterval(()=>{if(outputWindow&&outputWindow.closed)closeOutput()},1000);

  function openHelp(target){els.helpModal.classList.remove('hidden');document.body.classList.add('modal-open');if(target)setTimeout(()=>document.getElementById(target)?.scrollIntoView({block:'start'}),20)}function closeHelp(){els.helpModal.classList.add('hidden');document.body.classList.remove('modal-open')}
  $('helpBtn').onclick=()=>openHelp();$('helpCloseBtn').onclick=closeHelp;els.helpModal.addEventListener('click',e=>{if(e.target===els.helpModal)closeHelp()});document.querySelectorAll('[data-help-target]').forEach(b=>b.onclick=()=>openHelp(b.dataset.helpTarget));
  document.querySelectorAll('.panel-help').forEach(b=>b.onclick=()=>{const h=helpText[b.dataset.help];if(!h)return;$('contextHelpTitle').textContent=h[0];$('contextHelpBody').textContent=h[1];els.contextHelpModal.classList.remove('hidden')});$('contextHelpCloseBtn').onclick=()=>els.contextHelpModal.classList.add('hidden');$('shortcutBtn').onclick=()=>els.shortcutModal.classList.remove('hidden');$('shortcutCloseBtn').onclick=()=>els.shortcutModal.classList.add('hidden');
  $('resetDefaultsBtn').onclick=()=>{if(!confirm('Reset timer, queue, messages and all appearance settings?'))return;Object.assign(settings,defaults());try{localStorage.removeItem(SETTINGS_KEY);localStorage.removeItem(RECOVERY_KEY);localStorage.removeItem(CUSTOM_FONT_KEY)}catch{}T.stop();T.queueClear();els.input.value='';els.messageInput.value='';renderWarningRules();settingsChanged()};

  if(els.companionPort)els.companionPort.value=String(R.getPort());$('saveCompanionBtn').onclick=()=>{const saved=R.setPort(els.companionPort.value);els.companionPort.value=String(saved);els.bridgeHint.textContent=`Saved port ${saved}. Testing…`;R.test().then(()=>{els.bridgeHint.textContent='Connected.';publish()}).catch(err=>els.bridgeHint.textContent=`Connection failed: ${err.message}`)};$('testCompanionBtn').onclick=()=>{els.bridgeHint.textContent='Testing…';R.test().then(()=>{els.bridgeHint.textContent='Connected.';publish()}).catch(err=>els.bridgeHint.textContent=`Connection failed: ${err.message}`)};

  document.addEventListener('keydown',e=>{const typing=['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName);if(e.key==='Escape'&&!els.helpModal.classList.contains('hidden')){closeHelp();return}if(typing)return;if(e.key===' '){e.preventDefault();startConfigured(false)}else if(e.key.toLowerCase()==='r'){e.preventDefault();T.reset()}else if(e.key==='Escape'){e.preventDefault();T.stop()}else if(e.key.toLowerCase()==='n'&&!els.next.disabled){e.preventDefault();T.queueNext()}});

  loadSettings();renderQueue();sync(T.snapshot());document.documentElement.dataset.avTimerReady='1';setTimeout(()=>publish(),150);
})();
