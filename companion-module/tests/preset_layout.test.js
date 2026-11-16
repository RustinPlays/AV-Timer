const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),Module=require('node:module');
const {liveTimeParts,fields}=require('../src/state');
const manifest=require('../companion/manifest.json');
const C={};const save=Module._load;
class FakeBase {setActionDefinitions(x){this.actionsDefs=x}setFeedbackDefinitions(x){this.feedbackDefs=x}setVariableDefinitions(x){this.vars=x}setPresetDefinitions(x){this.presetDefs=x}setVariableValues(x){this.values=x}checkAllFeedbacks(){}updateStatus(){} }
Module._load=function(id,...args){if(id==='@companion-module/base')return {InstanceBase:FakeBase,InstanceStatus:{Ok:1,Connecting:2,ConnectionFailure:3},combineRgb:(r,g,b)=>(r<<16)|(g<<8)|b,runEntrypoint:X=>C.Class=X};return save.call(this,id,...args)};
try{require('../src/main.js')}finally{Module._load=save}
const i=new C.Class({});i.state={seconds:90061,formatted:'25:01:01',finished:false,displayMode:'timer',status:'RUNNING'};
test('days/hours component calculations are accurate',()=>{assert.deepEqual(liveTimeParts(90061),{days:'01',hours:'25',hoursInDay:'01',minutes:'01',secondsPart:'01',totalHours:'25',totalMinutes:'1501',totalSeconds:'90061'})});
test('module retains original identity',()=>{assert.equal(manifest.id,'jc-av-timer');assert.equal(manifest.name,'JC - AV Timer')});
test('live variables are published with correct fields',()=>{i.lastUpdate=Date.now();i.refresh(true);for(const k of ['days','hours','hoursInDay','minutes','secondsPart','totalHours','totalMinutes','totalSeconds'])assert.equal(i.values[k],liveTimeParts(90061)[k]);});
test('all presets use real module variables, not button-local this variables',()=>{const p=i.presets();for(const v of Object.values(p)){assert(!v.style.text.includes('$(this:'),v.name);for(const m of v.style.text.matchAll(/\$\(jc-av-timer:([^)]*)\)/g))assert(fields.includes(m[1])||['connected','time','overtime','next_cue'].includes(m[1]),`${v.name}: ${m[1]}`);assert(v.style.size!=='auto');assert(Number(v.style.size)<=14 || v.name.includes('timer'));}});
test('adds, minuses, playback, live, clock all separate categories',()=>{const p=i.presets();const group=(id)=>p[id].category;assert(group('add_1')===group('add_60'));assert(group('subtract_1')===group('subtract_60'));assert(group('add_1')!==group('subtract_1'));assert(group('start')===group('stop'));assert(group('live_days')===group('live_seconds'));assert(group('clock_live')!==group('live_days'))});
test('grouped presets point to defined feedback IDs and action IDs',()=>{const p=i.presets(),a=i.actions(),f=i.feedbacks();for(const v of Object.values(p)){for(const x of v.steps.flatMap(y=>y.down))assert(a[x.actionId],`unknown action ${x.actionId}`);for(const x of v.feedbacks)assert(f[x.feedbackId],`unknown feedback ${x.feedbackId}`)}});
