const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const Module=require('node:module');
const manifest=require('../companion/manifest.json');
test('same identity as original v0.9.1 module',()=>{
  assert.equal(manifest.id,'jc-av-timer');
  assert.equal(manifest.name,'JC - AV Timer');
  assert.ok(manifest.legacyIds.includes('jc-avtimer'));
});
test('bridge remains available while idle and browser has a 60-second grace',()=>{
  let Captured;
  const saved=Module._load;
  class FakeBase {
    constructor(){this.statuses=[];this.feedbackChecks=0;}
    updateStatus(s){this.statuses.push(s)}
    checkAllFeedbacks(){this.feedbackChecks++}
    setVariableValues(){}
  }
  Module._load=function(id,...args){
    if(id==='@companion-module/base')return {
      InstanceBase:FakeBase,
      InstanceStatus:{Ok:'ok',Connecting:'connecting',ConnectionFailure:'connection_failure'},
      combineRgb:(r,g,b)=>(r<<16)|(g<<8)|b,
      runEntrypoint:C=>{Captured=C},
    };
    return saved.call(this,id,...args);
  };
  try {require('../src/main.js');}finally{Module._load=saved;}
  const instance=new Captured({});
  instance.state={formatted:'00:00',seconds:0,finished:false};
  const now=Date.now();
  instance.lastUpdate=now-6000;
  instance.refresh();
  assert.equal(instance.connected,true,'6 seconds idle should not be disconnected');
  assert.deepEqual(instance.statuses,[],'browser idle must not affect listener status');
  instance.lastUpdate=now-61000;
  instance.refresh();
  assert.equal(instance.connected,false,'website is offline after a full minute without contact');
  assert.deepEqual(instance.statuses,[],'API server status never flaps due to browser inactivity');
});
