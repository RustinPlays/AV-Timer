const test = require('node:test');const assert=require('node:assert/strict');const {normalize}=require('../src/state')
test('HH MM SS values remain strings',()=>{const r=normalize({hours:'01',minutes:'04',secondsPart:'07',formatted:'01:04:07'});assert.equal(r.hours,'01');assert.equal(r.minutes,'04');assert.equal(r.secondsPart,'07');assert.equal(r.formatted,'01:04:07')})
test('negative countdown recognized as overtime',()=>{assert.equal(normalize({countUp:false,duration:120,seconds:-3}).finished,true)})
test('count up not mistaken for overtime',()=>{assert.equal(normalize({countUp:true,duration:120,seconds:130}).finished,false)})
test('pause flag survives state update',()=>{assert.equal(normalize({running:true,paused:true}).paused,true)})

test('clock mode and format are preserved',()=>{const r=normalize({displayMode:'clock',clockFormat:'12',clockTime:'02:05:09 PM'});assert.equal(r.displayMode,'clock');assert.equal(r.clockFormat,'12');assert.equal(r.clockTime,'02:05:09 PM')})
test('invalid clock options fall back safely',()=>{const r=normalize({displayMode:'bad',clockFormat:'99'});assert.equal(r.displayMode,'timer');assert.equal(r.clockFormat,'24')})
