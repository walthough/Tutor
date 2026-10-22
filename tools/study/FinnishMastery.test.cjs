'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createTracker}=require('./FinnishMastery.cjs');
function fixture(t){
  const parent=path.resolve(os.tmpdir());
  const root=fs.mkdtempSync(path.join(parent,'finnish-mastery-test-'));
  t.after(()=>{const resolved=path.resolve(root);assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('finnish-mastery-test-'));fs.rmSync(resolved,{recursive:true,force:true});});
  fs.mkdirSync(path.join(root,'00-Dashboard','Portfolio'),{recursive:true});
  fs.writeFileSync(path.join(root,'00-Dashboard','Portfolio','test.md'),'Assessed test fixture.');
  const tracker=createTracker(root);
  tracker.initialize({words:[{id:'fi-1',name:'palautua',part_of_speech:'verb',source_rank:1},{id:'fi-2',name:'Suomi',part_of_speech:'proper noun',source_rank:2},{id:'fi-3',name:'sujuvasti',part_of_speech:'adverb',source_rank:3}],grammar:[{id:'G001',name:'Negation',group:'Verbs'}],aliases:{sujuvammin:'fi-3'}});
  const event=(id,outcome='correct',extra={})=>({id,date:'2026-10-15',evidence:'00-Dashboard/Portfolio/test.md',support:'No model; explicit original response.',responses:['Mä palaudun.'],results:[{kind:'word',key:'palautua',outcome,form:'palaudun',...(outcome==='incorrect'?{error:'Wrong form'}:{})}],...extra});
  return {root,tracker,event};
}
test('clamps at 0/50, preserves lifetime counters, reopens mastery at 49',t=>{
 const {tracker,event}=fixture(t);
 tracker.recordMany([event('wrong-first','incorrect')]);assert.equal(tracker.lookup({keys:['palautua']})[0].score,0);
 tracker.recordMany(Array.from({length:51},(_,i)=>event('right-'+i)));
 let item=tracker.lookup({keys:['palautua'],details:true})[0];assert.equal(item.score,50);assert.equal(item.status,'Mastered');assert.equal(item.correct,51);assert.equal(item.incorrect,1);assert.equal(item.practice_days,1);assert.equal(item.forms.palaudun.correct,51);
 tracker.recordMany([event('wrong-again','incorrect')]);item=tracker.lookup({keys:['palautua']})[0];assert.equal(item.score,49);assert.equal(item.status,'Not mastered');
 tracker.recordMany([event('right-again')]);assert.equal(tracker.lookup({keys:['palautua']})[0].score,50);
});
test('stable IDs, case-insensitive lookup and explicit form alias return compact results',t=>{
 const {tracker}=fixture(t);assert.equal(tracker.lookup({keys:['PALAUTUA','fi-1']})[0].id,'fi-1');assert.equal(tracker.lookup({keys:['sujuvammin']})[0].name,'sujuvasti');assert.throws(()=>tracker.lookup({keys:['palaudun']}),/Unknown/);assert.ok(JSON.stringify(tracker.lookup({keys:['palautua']})).length<500);assert.equal(tracker.search({kind:'grammar',query:'nega'})[0].id,'G001');
});
test('identical retry is a no-op; changed payload cannot reuse an exercise ID',t=>{
 const {tracker,event}=fixture(t);const e=event('one');tracker.recordMany([e]);assert.equal(tracker.recordMany([e])[0].applied,false);assert.equal(tracker.lookup({keys:['palautua']})[0].correct,1);assert.throws(()=>tracker.recordMany([event('one','incorrect')]),/different content/);
});
test('whole batch is validated before any score/history is committed',t=>{
 const {root,tracker,event}=fixture(t);assert.throws(()=>tracker.recordMany([event('valid'),event('invalid','correct',{responses:[]})]),/Original explicit/);assert.equal(tracker.summary().exercises,0);assert.equal(tracker.lookup({keys:['palautua']})[0].score,0);assert.equal(fs.existsSync(path.join(root,'00-Dashboard','Mastery History')),false);
});
test('duplicate item in one exercise, unknown item and out-of-order recording fail',t=>{
 const {tracker,event}=fixture(t);let e=event('duplicate');e.results.push({...e.results[0]});assert.throws(()=>tracker.recordMany([e]),/once per exercise/);assert.throws(()=>tracker.recordMany([event('unknown','correct',{results:[{kind:'word',key:'unknown',outcome:'correct',form:'x'}]})]),/Unknown/);
 tracker.recordMany([event('newer','correct',{date:'2026-10-16'})]);assert.throws(()=>tracker.recordMany([event('older')]),/chronologically/);
});
test('practice earns no points; a supplied model cannot earn correct-use credit',t=>{
 const {tracker,event}=fixture(t);tracker.recordMany([event('copy','practice',{model_supplied:true})]);assert.equal(tracker.lookup({keys:['palautua']})[0].correct,0);assert.equal(tracker.lookup({keys:['palautua']})[0].score,0);assert.throws(()=>tracker.recordMany([event('model','correct',{model_supplied:true})]),/practice only/);
});
test('grammar uses same scoring; generated view matches; review excludes untested names',t=>{
 const {root,tracker,event}=fixture(t);tracker.recordMany([event('grammar','correct',{results:[{kind:'grammar',key:'G001',outcome:'correct',form:'en ymmärrä'}]})]);assert.equal(tracker.lookup({kind:'grammar',keys:['G001']})[0].score,1);assert.match(fs.readFileSync(path.join(root,'00-Dashboard','Grammar Mastery.md'),'utf8'),/G001 \| Negation \| 1\/50 \| Not mastered/);assert.ok(!tracker.review({kind:'word'}).some(r=>r.name==='Suomi'));
});
test('evidence cannot escape subject or use session notes; lock blocks competing writes',t=>{
 const {root,tracker,event}=fixture(t);assert.throws(()=>tracker.recordMany([event('bad-path','correct',{evidence:'../other.md'})]),/inside/);fs.mkdirSync(path.join(root,'90-Session-Notes'));fs.writeFileSync(path.join(root,'90-Session-Notes','test.md'),'notes');assert.throws(()=>tracker.recordMany([event('notes','correct',{evidence:'90-Session-Notes/test.md'})]),/outside session/);fs.writeFileSync(path.join(root,'00-Dashboard','Mastery State.json.lock'),'busy');assert.throws(()=>tracker.recordMany([event('locked')]),/locked/);fs.unlinkSync(path.join(root,'00-Dashboard','Mastery State.json.lock'));
});
test('history-first recovery and subsequent retry apply an exercise exactly once',t=>{
 const {root,tracker,event}=fixture(t);const p=path.join(root,'00-Dashboard','Mastery State.json'),before=fs.readFileSync(p);tracker.recordMany([event('recover')]);fs.writeFileSync(p,before);tracker.recordMany([event('recover')]);assert.equal(tracker.lookup({keys:['palautua']})[0].score,1);tracker.recordMany([event('recover')]);assert.equal(tracker.lookup({keys:['palautua']})[0].score,1);
});
test('personal entries start at zero and adding duplicates cannot reset progress',t=>{
 const {tracker}=fixture(t);const r=tracker.add({kind:'word',name:'personal-example'});assert.equal(r.score,0);assert.equal(r.status,'Not mastered');assert.throws(()=>tracker.add({kind:'word',name:'palautua'}),/already exists/);assert.throws(()=>tracker.add({kind:'word',name:'sujuvammin'}),/already exists/);assert.throws(()=>tracker.initialize({}),/never overwrites/);
});
