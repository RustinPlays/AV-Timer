(() => {
  const $ = id => document.getElementById(id);
  const timer=$('outputTimer'),paused=$('outputPaused'),finished=$('outputFinished'),progress=$('outputProgress'),bar=$('outputProgressBar'),warningLabel=$('outputWarningLabel');
  const fullscreenBtn=$('outputFullscreenBtn'), fullscreenHotspot=$('fullscreenHotspot');
  const preview=new URLSearchParams(location.search).get('preview')==='1';
  let latestPayload = null;

  function mixHex(base, target, amount){
    const clean = value => String(value || '').replace('#','').trim();
    const a=clean(base), b=clean(target);
    if(!/^[0-9a-fA-F]{6}$/.test(a) || !/^[0-9a-fA-F]{6}$/.test(b)) return base || '#000000';
    const out=[];
    for(let i=0;i<3;i++){
      const av=parseInt(a.slice(i*2,i*2+2),16), bv=parseInt(b.slice(i*2,i*2+2),16);
      out.push(Math.round(av+(bv-av)*amount).toString(16).padStart(2,'0'));
    }
    return `#${out.join('')}`;
  }

  function sameHueGradient(base){
    return { light:mixHex(base,'#ffffff',0.22), dark:mixHex(base,'#000000',0.34) };
  }

  function formatTime(seconds){
    const total=Math.max(0,Math.round(Number(seconds)||0));
    const h=Math.floor(total/3600), m=Math.floor((total%3600)/60), s=total%60;
    return h>0
      ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function liveState(payload){
    const source=payload?.state||{};
    const s={...source};
    let seconds=Number(s.seconds||0);

    if(s.running && !s.paused && Number(s.clockAnchorMs)>0){
      const delta=Math.max(0,(Date.now()-Number(s.clockAnchorMs))/1000);
      if(s.countUp) seconds=Math.max(0,Number(s.anchorElapsed||0)+delta);
      else seconds=Math.max(0,Number(s.anchorRemaining||0)-delta);
    }

    if(!s.countUp && s.running && seconds<=0){
      seconds=0;
      s.running=false;
      s.paused=false;
      s.finished=true;
    }

    s.seconds=seconds;
    s.formatted=formatTime(seconds);
    s.displayTime=s.formatted;

    const duration=Math.max(0,Number(s.duration||0));
    const progressPercent=duration>0
      ? (s.countUp ? seconds/duration : seconds/duration)*100
      : 0;
    s.progressPercent=Math.max(0,Math.min(100,progressPercent));

    const display=payload?.display||{};
    const warningsEnabled=s.warningsEnabled!==false && display.warningsEnabled!==false;
    if(warningsEnabled && !s.finished){
      const warningRemaining=s.countUp && duration>0 ? Math.max(0,duration-seconds) : Math.max(0,seconds);
      const rules=(display.warningRules||[])
        .filter(r=>r && r.enabled!==false && Number(r.threshold)>0 && warningRemaining<=Number(r.threshold))
        .sort((a,b)=>Number(a.threshold)-Number(b.threshold));
      const warning=rules[0]||null;
      s.warningActive=!!warning;
      s.warningLabel=warning?.label||'';
      s.warningColor=warning?.color||'';
      s.warningRemaining=warningRemaining;
    } else if(s.finished){
      s.warningActive=false;
      s.warningLabel='';
    }

    return s;
  }

  document.body.classList.toggle('preview-mode',preview);

  function updateFullscreenButton(){
    if(!fullscreenBtn)return;
    fullscreenBtn.textContent=document.fullscreenElement?'Exit Fullscreen':'Fullscreen';
    fullscreenBtn.setAttribute('aria-label',fullscreenBtn.textContent);
  }

  async function toggleFullscreen(){
    try{
      if(document.fullscreenElement) await document.exitFullscreen?.();
      else await document.documentElement.requestFullscreen?.();
    }catch(err){
      console.warn('Fullscreen request failed',err);
    }
    updateFullscreenButton();
  }

  if(preview&&fullscreenHotspot) fullscreenHotspot.classList.add('hidden');
  if(fullscreenBtn) fullscreenBtn.addEventListener('click',toggleFullscreen);
  document.addEventListener('fullscreenchange',updateFullscreenButton);
  updateFullscreenButton();

  function apply(payload){
    if(!payload)return;
    latestPayload=payload;
    const display=payload.display||{};
    const state=liveState(payload);
    const baseBg=display.bg||'#00324b';
    const gradient=sameHueGradient(baseBg);

    document.documentElement.style.setProperty('--out-bg',baseBg);
    document.documentElement.style.setProperty('--out-bg-light',gradient.light);
    document.documentElement.style.setProperty('--out-bg-dark',gradient.dark);
    document.documentElement.style.setProperty('--out-timer',display.fg||'#f5f5f5');
    document.documentElement.style.setProperty('--out-progress',display.progress||'#ff4b4b');
    document.documentElement.style.setProperty('--out-time',display.timeColor||'#ff0000');
    document.documentElement.style.setProperty('--out-scale',Number(display.scale||1));
    document.documentElement.style.setProperty('--out-chroma',display.chromaColor||'#00ff00');
    document.documentElement.style.setProperty('--active-warning',state.warningColor||display.timeColor||'#ff0000');

    document.body.classList.toggle('light-output',!!display.light);
    document.body.classList.toggle('chroma-output',!!display.chroma);
    document.body.classList.toggle('flat-output',display.gradient===false);
    document.body.classList.toggle('minimal-output',!!display.minimal);

    const text=state.formatted||'00:00';
    timer.textContent=text;
    timer.dataset.text=text;
    timer.classList.toggle('warning',!!state.warningActive);
    warningLabel.textContent=state.warningLabel||'';
    warningLabel.classList.toggle('hidden',!state.warningActive||!state.warningLabel);
    warningLabel.style.color=state.warningColor||'';
    paused.classList.toggle('hidden',!state.paused);
    finished.classList.toggle('hidden',!state.finished);

    const showProgress=!!display.showProgress||!!display.minimal;
    progress.classList.toggle('hidden',!showProgress);
    const pct=Number.isFinite(state.progressPercent)?state.progressPercent:0;
    bar.style.width=`${Math.max(0,Math.min(100,pct))}%`;
  }

  window.AVSync.onState(apply,true);
  window.AVSync.requestState();

  // Output independently derives the current time from wall-clock anchors. That
  // means it keeps accurate time even if the operator tab is backgrounded or
  // its JavaScript timers are throttled by the browser.
  setInterval(()=>{ if(latestPayload) apply(latestPayload); },250);
  window.addEventListener('focus',()=>{ if(latestPayload) apply(latestPayload); });
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&latestPayload) apply(latestPayload); });
})();
