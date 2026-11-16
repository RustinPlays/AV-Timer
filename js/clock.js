// Shared wall clock formatter for operator and output displays.
// The host's IANA timezone is transmitted with each output state, so remote
// viewers see the operator's local clock, not their own timezone.
(() => {
  'use strict';
  function timezone(){
    try{return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}catch{return 'UTC'}
  }
  function format(when=Date.now(),hourFormat='24',zone=timezone()){
    let parts;
    try{
      parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
        timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
      }).formatToParts(new Date(when)).map(x=>[x.type,x.value]));
    }catch{
      parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
        timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
      }).formatToParts(new Date(when)).map(x=>[x.type,x.value]));
    }
    const h=Number(parts.hour)||0,mm=parts.minute||'00',ss=parts.second||'00';
    if(String(hourFormat)==='12') return `${String(h%12||12).padStart(2,'0')}:${mm}:${ss} ${h>=12?'PM':'AM'}`;
    return `${String(h).padStart(2,'0')}:${mm}:${ss}`;
  }
  window.JCClock={format,timezone};
})();
