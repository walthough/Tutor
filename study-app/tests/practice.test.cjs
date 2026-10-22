const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {build}=require('esbuild');
const {fixture,cleanup}=require('./fixture.cjs');
const noteText='# Session\n\nPalautua means to recover after effort. A relaxing weekend can help you recover from a busy working week. We discussed rest, exercise, and everyday routines.';
async function setup(generator){const root=await fixture();await build({entryPoints:[path.join(__dirname,'../src/practice.ts')],outfile:path.join(root,'practice.cjs'),bundle:true,platform:'node',format:'cjs'});await build({entryPoints:[path.join(__dirname,'../src/data.ts')],outfile:path.join(root,'data.cjs'),bundle:true,platform:'node',format:'cjs'});const {StudyStore}=require(path.join(root,'data.cjs'));const store=new StudyStore(root),mod=require(path.join(root,'practice.cjs'));const note=await store.createNotes('Finnish');await fs.writeFile(path.join(store.vault('Finnish'),note),noteText);return{root,store,note,service:new mod.PracticeService(store,generator)};}
const meaning={meaning:'to recover',example:'Haluan palautua viikonloppuna.'};
const prompt={title:'A relaxing weekend',prompt:'Write about how you recover during a weekend.',guidance:['Describe your routine.'],targetWords:80};
const feedback={summary:'Clear ideas.',strengths:['Your meaning is understandable.'],corrections:[{original:'Minä halua',replacement:'Minä haluan',explanation:'Use the first-person form.'}],correctedParagraph:'Minä haluan palautua viikonloppuna.'};
test('flashcards save before generation, deduplicate, survive failure, isolate subjects and preserve manual edits',async()=>{let fail=true;const c=await setup(async()=>{if(fail)throw Error('offline');return meaning;});try{const [a,b]=await Promise.all([c.service.add('Finnish',c.note,'Palautua'),c.service.add('Finnish',c.note,'palautua')]);assert.equal(a.id,b.id);assert.equal(a.meaning,'');await assert.rejects(c.service.enrich('Finnish',a.id),/offline/);assert.equal((await c.service.cards('Finnish')).length,1);fail=false;const enriched=await c.service.enrich('Finnish',a.id);assert.equal(enriched.meaning,'to recover');const edited=await c.service.edit('Finnish',a.id,'recover from effort','Tarvitsen aikaa palautua.');assert.equal(edited.revision,2);assert.deepEqual(await c.service.enrich('Finnish',a.id),edited);assert.deepEqual(await c.service.cards('React'),[]);await assert.rejects(c.service.enrich('React',a.id));await assert.rejects(c.service.add('Finnish',c.note,'absent'));await assert.rejects(c.service.add('Finnish',c.note,'two words'));await assert.rejects(c.service.add('Finnish','../secret.md','Palautua'));await assert.rejects(c.service.edit('Finnish',a.id,'',''));}finally{await cleanup(c.root);}});
test('a manual card edit wins over an in-flight Codex response',async()=>{let release,entered;const started=new Promise(r=>entered=r);const c=await setup(async()=>{entered();return new Promise(r=>release=r);});try{const card=await c.service.add('Finnish',c.note,'Palautua');const pending=c.service.enrich('Finnish',card.id);await started;await c.service.edit('Finnish',card.id,'my meaning','my example');release(meaning);assert.equal((await pending).meaning,'my meaning');}finally{await cleanup(c.root);}});
test('writing requires explicit submission, preserves original response, rejects invented corrections and never updates tutor progress',async()=>{let calls=0,bad=false;const c=await setup(async(_p,schema)=>{calls++;return schema.properties.targetWords?prompt:bad?{...feedback,corrections:[{...feedback.corrections[0],original:'Not in the response'}]}:feedback;});try{const coverage=await fs.readFile(path.join(c.store.vault('Finnish'),'00-Dashboard/Curriculum Coverage.md'),'utf8');const timer=await fs.readFile(path.join(c.store.cache('Finnish'),'study-session.json'),'utf8');const task=await c.service.createWriting('Finnish',c.note,'weekend');assert.equal(task.attempt,null);assert.equal(calls,1);assert.deepEqual(await c.service.writing('React'),[]);await assert.rejects(c.service.submitWriting('React',task.id,'Minä halua palautua viikonloppuna.'));await assert.rejects(c.service.submitWriting('Finnish',task.id,''));bad=true;await assert.rejects(c.service.submitWriting('Finnish',task.id,'Minä halua palautua viikonloppuna.'),/did not match/);assert.equal((await c.service.writing('Finnish'))[0].attempt,null);bad=false;const [a,b]=await Promise.all([c.service.submitWriting('Finnish',task.id,'Minä halua palautua viikonloppuna.'),c.service.submitWriting('Finnish',task.id,'Minä halua palautua viikonloppuna.')]);assert.deepEqual(a,b);assert.equal(a.attempt.response,'Minä halua palautua viikonloppuna.');const before=calls;assert.deepEqual(await c.service.submitWriting('Finnish',task.id,'Different paragraph.'),a);assert.equal(calls,before);assert.equal(await fs.readFile(path.join(c.store.vault('Finnish'),'00-Dashboard/Curriculum Coverage.md'),'utf8'),coverage);assert.equal(await fs.readFile(path.join(c.store.cache('Finnish'),'study-session.json'),'utf8'),timer);}finally{await cleanup(c.root);}});
test('malformed generated practice output is rejected without overwriting saved words',async()=>{const c=await setup(async()=>({unexpected:'bad'}));try{const card=await c.service.add('Finnish',c.note,'Palautua');await assert.rejects(c.service.enrich('Finnish',card.id),/Invalid study output format/);assert.equal((await c.service.cards('Finnish'))[0].meaning,'');await assert.rejects(c.service.createWriting('Finnish',c.note,''));assert.deepEqual(await c.service.writing('Finnish'),[]);}finally{await cleanup(c.root);}});
test('automatic session terms import definitions and phrases once, preserving manual edits and subject isolation',async()=>{let calls=0;const c=await setup(async()=>{calls++;throw Error('offline');});try{
 const notes='# Session\n\n## Summary\n- Ignore: ordinary summary text.\n\n## Terms & definitions\n- **Palautua**: to recover\n- **vowel harmony** — Vowels follow harmony rules.\n- `lepo`: rest\n- palautua: duplicate\n\n## Examples\n- Ignore: not a term.\n';
 await Promise.all([c.service.syncNotes('Finnish',c.note,notes),c.service.syncNotes('Finnish',c.note,notes)]);
 let cards=await c.service.cards('Finnish');assert.equal(cards.length,3);assert.deepEqual(cards.map(c=>c.word).sort(),['Palautua','lepo','vowel harmony']);assert.equal(cards.find(c=>c.word==='Palautua').meaning,'to recover');
 await c.service.edit('Finnish',cards.find(c=>c.word==='Palautua').id,'My meaning','My example');
 await c.service.syncNotes('Finnish',c.note,notes+'\n');cards=await c.service.cards('Finnish');assert.equal(cards.length,3);assert.equal(cards.find(c=>c.word==='Palautua').meaning,'My meaning');assert.deepEqual(await c.service.cards('React'),[]);
 const updated=notes.replace('## Examples','- **arki**: everyday life\n\n## Examples');await c.service.syncNotes('Finnish',c.note,updated);assert.equal((await c.service.cards('Finnish')).length,4);
 await c.service.syncNotes('Finnish',c.note,'# Empty\n\n## Terms & definitions\n');assert.equal((await c.service.cards('Finnish')).length,4);
 await new Promise(r=>setTimeout(r,40));const before=calls;await c.service.syncNotes('Finnish',c.note,'# Empty\n\n## Terms & definitions\n');assert.equal(calls,before);
 }finally{c.service.cancel();await new Promise(r=>setTimeout(r,40));await cleanup(c.root);}});

test('self-rated reviews schedule due dates idempotently without changing mastery or timers',async()=>{
 const c=await setup(async()=>meaning);try{
 const card=await c.service.add('Finnish',c.note,'Palautua');await c.service.enrich('Finnish',card.id);
 const timer=await fs.readFile(path.join(c.store.cache('Finnish'),'study-session.json'),'utf8');
 const id=require('node:crypto').randomUUID();const first=await c.service.review('Finnish',card.id,true,id);
 assert.equal(first.intervalDays,1);assert.equal(first.reviews.length,1);assert.ok(Date.parse(first.dueAt)>Date.now());
 assert.deepEqual(await c.service.review('Finnish',card.id,true,id),first);
 const second=await c.service.review('Finnish',card.id,true,require('node:crypto').randomUUID());assert.equal(second.intervalDays,2);
 const missed=await c.service.review('Finnish',card.id,false,require('node:crypto').randomUUID());assert.equal(missed.intervalDays,0);assert.equal(missed.reviews.length,3);
 await assert.rejects(c.service.review('React',card.id,true,id));await assert.rejects(c.service.review('Finnish',card.id,'yes',id));
 assert.equal(await fs.readFile(path.join(c.store.cache('Finnish'),'study-session.json'),'utf8'),timer);
 }finally{await cleanup(c.root);}
});
test('legacy cards remain readable and edits/reviews write only the changed card, preserving history', async () => {
 const c=await setup(async()=>meaning);try {
  const first=await c.service.add('Finnish',c.note,'Palautua');
  const legacy={...first,meaning:'recover',example:'Palautua rauhassa.',reviews:[{id:require('node:crypto').randomUUID(),at:'2026-10-14T10:00:00Z',remembered:true}]};
  const folder=path.join(c.store.cache('Finnish'),'practice');
  const legacyText=JSON.stringify([legacy]);await fs.writeFile(path.join(folder,'flashcards.json'),legacyText);
  await fs.rm(path.join(folder,'cards',first.id+'.json'));
  const other=await c.service.add('Finnish',c.note,'weekend');
  const otherPath=path.join(folder,'cards',other.id+'.json'),untouched=await fs.readFile(otherPath,'utf8');
  await c.service.edit('Finnish',first.id,'my meaning','my example');
  const reviewId=require('node:crypto').randomUUID();const reviewed=await c.service.review('Finnish',first.id,true,reviewId);
  const reopened=new c.service.constructor(c.store,async()=>meaning);
  assert.deepEqual(await reopened.review('Finnish',first.id,true,reviewId),reviewed);
  assert.equal(reviewed.reviews.length,2);assert.deepEqual(reviewed.reviews[0],legacy.reviews[0]);
  assert.equal((await reopened.cards('Finnish')).length,2);
  assert.equal(await fs.readFile(path.join(folder,'flashcards.json'),'utf8'),legacyText);
  assert.equal(await fs.readFile(otherPath,'utf8'),untouched);
  assert.match((await c.store.dashboard('Finnish')).nextTask,/1 due flashcards/);
 }finally {await cleanup(c.root);}
});

test('imports never enqueue AI; cancellation rejects queued work and allows a later retry',async()=>{
 let calls=0,entered;const started=new Promise(r=>entered=r);
 const c=await setup(async(_p,_s,signal)=>{calls++;entered();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true}));});try{
 await c.service.syncNotes('Finnish',c.note,'## Terms & definitions\n- **Palautua**: recover');assert.equal(calls,0);
 const card=(await c.service.cards('Finnish'))[0];const a=c.service.enrich('Finnish',card.id);const b=c.service.createWriting('Finnish',c.note,'');
 const results=Promise.allSettled([a,b]);await started;while(!c.service.status.includes("1 queued")) await new Promise(r=>setImmediate(r));c.service.cancelPending();assert.ok((await results).every(r=>r.status==='rejected'));assert.equal(calls,1);assert.equal(c.service.status,'');
 c.service.generate=async()=>meaning;assert.equal((await c.service.enrich('Finnish',card.id)).meaning,'recover');
 }finally{c.service.cancel();await cleanup(c.root);}
});
test('linked revision and transfer preserve original evidence and feed a bounded subject-specific tutor handoff',async()=>{
 const c=await setup(async(_p,schema)=>schema.properties.targetWords?prompt:feedback);try{
 const original=await c.service.createWriting('Finnish',c.note,'');await c.service.submitWriting('Finnish',original.id,'Min\u00e4 halua palautua viikonloppuna.');
 const revision=await c.service.followup('Finnish',original.id,'revision');assert.equal(revision.parentId,original.id);assert.equal(revision.kind,'revision');assert.equal(revision.attempt,null);
 assert.equal((await c.service.followup('Finnish',original.id,'revision')).id,revision.id);
 const transfer=await c.service.followup('Finnish',original.id,'transfer');assert.equal(transfer.kind,'transfer');
 assert.ok(Date.parse(transfer.dueAt)>Date.now()+23*3600000);
 await assert.rejects(c.service.submitWriting('Finnish',transfer.id,'Minä halua palautua viikonloppuna.'),/scheduled/);
 await assert.rejects(c.service.followup('Finnish',revision.id,'revision'));await assert.rejects(c.service.followup('React',original.id,'transfer'));
 const handoff=JSON.parse(await fs.readFile(await c.store.tutorEvidence('Finnish'),'utf8'));assert.equal(handoff.writing.length,1);assert.equal(handoff.writing[0].id,original.id);assert.equal(handoff.writing[0].response,'Min\u00e4 halua palautua viikonloppuna.');assert.deepEqual(handoff.recognition,[]);
 assert.equal(JSON.parse(await fs.readFile(await c.store.tutorEvidence('React'),'utf8')).writing.length,0);
 const dash=await c.store.dashboard('Finnish');assert.match(dash.nextTask,/Continue writing/);
 await fs.writeFile(path.join(c.store.vault('React'),'00-Dashboard/CEFR Skill Profile.md'),'| Skill | Available evidence | Provisional level | Next sample |\n|---|---|---|---|\n| Listening | None | Not assessed | Listen to actual audio |');
 assert.match((await c.store.dashboard('React')).nextTask,/Listen to actual audio/);
 assert.equal((await c.service.writing('Finnish')).find(t=>t.id===original.id).attempt.response,'Min\u00e4 halua palautua viikonloppuna.');
 }finally{await cleanup(c.root);}
});

test('legacy grouped note bullets yield independently reviewable terms and preserve phrases',async()=>{
 const c=await setup(async()=>meaning);try{
  const {sessionTerms}=require(path.join(c.root,'practice.cjs'));
  const terms=sessionTerms('## Terms & definitions\n- **palautua / rento**: recover / relaxed; **sujuvammin**: more fluently.\n- **ehtiä / en ehdi**: have time / I do not have time; **myöhästyä treeneistä**: be late for training.\n');
  assert.deepEqual(terms.map(t=>t.word),['palautua','rento','sujuvammin','ehtiä','en ehdi','myöhästyä treeneistä']);
  assert.equal(terms.find(t=>t.word==='rento').meaning,'relaxed');
  assert.equal(terms.find(t=>t.word==='sujuvammin').meaning,'more fluently.');
 }finally{await cleanup(c.root);}
});

test('splitting grouped cards archives their history; corrected notes require explicit acceptance',async()=>{
 const c=await setup(async()=>meaning);try{
  const folder=path.join(c.store.cache('Finnish'),'practice');await fs.mkdir(folder,{recursive:true});
  const group={id:require('node:crypto').randomUUID(),subject:'Finnish',word:'palautua / rento',meaning:'recover / relaxed',example:'',notePath:c.note,context:noteText,createdAt:new Date().toISOString(),revision:0,reviews:[{id:require('node:crypto').randomUUID(),at:new Date().toISOString(),remembered:true}]};
  const legacy=JSON.stringify([group]);await fs.writeFile(path.join(folder,'flashcards.json'),legacy);
  const notes='## Terms & definitions\n- **palautua**: recover\n- **rento**: relaxed\n';
  await c.service.syncNotes('Finnish',c.note,notes);
  let cards=await c.service.cards('Finnish');assert.equal(cards.length,2);assert.ok(cards.every(c=>!c.reviews));
  const archived=JSON.parse(await fs.readFile(path.join(folder,'cards',group.id+'.json'),'utf8'));assert.ok(archived.archivedAt);assert.deepEqual(archived.reviews,group.reviews);
  assert.equal(await fs.readFile(path.join(folder,'flashcards.json'),'utf8'),legacy);
  const card=cards.find(c=>c.word==='palautua');await c.service.edit('Finnish',card.id,'my custom meaning','my example');
  await c.service.syncNotes('Finnish',c.note,notes.replace(': recover',': recover after exertion'));
  cards=await c.service.cards('Finnish');const suggested=cards.find(c=>c.id===card.id);assert.equal(suggested.meaning,'my custom meaning');assert.equal(suggested.suggestedMeaning,'recover after exertion');
  await assert.rejects(c.service.acceptNoteMeaning('React',card.id));
  const accepted=await c.service.acceptNoteMeaning('Finnish',card.id);assert.equal(accepted.meaning,'recover after exertion');assert.equal(accepted.example,'my example');assert.equal(accepted.suggestedMeaning,undefined);
  await assert.rejects(c.service.acceptNoteMeaning('Finnish',card.id),/No updated/);
 }finally{await cleanup(c.root);}
});

test('note recall saves only explicit assessments, schedules retries, preserves evidence and rejects premature review',async()=>{
 let successful=true,bad=false,calls=0;
 const c=await setup(async(_p,schema)=>{calls++;return schema.properties.targetWords?{...prompt,targetWords:30}:{...feedback,recallSuccessful:bad?'yes':successful};});try{
  const timer=await fs.readFile(path.join(c.store.cache('Finnish'),'study-session.json'),'utf8');
  const coverage=await fs.readFile(path.join(c.store.vault('Finnish'),'00-Dashboard/Curriculum Coverage.md'),'utf8');
  const [task,duplicate]=await Promise.all([c.service.createRecall('Finnish',c.note),c.service.createRecall('Finnish',c.note)]);
  assert.equal(task.id,duplicate.id);assert.equal(calls,1);assert.equal(task.kind,'recall');assert.equal(task.attempt,null);assert.equal(task.noteReference,noteText);
  await assert.rejects(c.service.submitWriting('React',task.id,'Minä halua palautua viikonloppuna.'));
  bad=true;await assert.rejects(c.service.submitWriting('Finnish',task.id,'Minä halua palautua viikonloppuna.'),/Invalid study output/);assert.equal((await c.service.writing('Finnish'))[0].attempt,null);
  bad=false;const assessed=await c.service.submitWriting('Finnish',task.id,'Minä halua palautua viikonloppuna.');assert.equal(assessed.attempt.response,'Minä halua palautua viikonloppuna.');
  await c.service.submitWriting('Finnish',task.id,'Another attempted submission.');
  let tasks=await c.service.writing('Finnish');assert.equal(tasks.length,2);const next=tasks.find(t=>!t.attempt);assert.equal(next.parentId,task.id);assert.equal(next.intervalDays,1);assert.ok(Date.parse(next.dueAt)>Date.now()+23*3600000);
  assert.equal((await c.service.createRecall('Finnish',c.note)).id,next.id);
  await assert.rejects(c.service.submitWriting('Finnish',next.id,'Minä halua palautua viikonloppuna.'),/scheduled/);
  assert.doesNotMatch((await c.store.dashboard('Finnish')).nextTask,/Continue writing/);
  next.dueAt=new Date(Date.now()-1000).toISOString();await fs.writeFile(path.join(c.store.cache('Finnish'),'practice/writing.json'),JSON.stringify(tasks));
  successful=false;await c.service.submitWriting('Finnish',next.id,'Minä halua palautua viikonloppuna.');
  tasks=await c.service.writing('Finnish');const retry=tasks.find(t=>!t.attempt);assert.equal(retry.intervalDays,0);assert.ok(Date.parse(retry.dueAt)>Date.now()+9*60000);assert.ok(Date.parse(retry.dueAt)<=Date.now()+10*60000);
  const evidence=JSON.parse(await fs.readFile(await c.store.tutorEvidence('Finnish'),'utf8'));assert.equal(evidence.writing.length,2);assert.equal(evidence.writing[0].kind,'recall');
  assert.equal(await fs.readFile(path.join(c.store.cache('Finnish'),'study-session.json'),'utf8'),timer);assert.equal(await fs.readFile(path.join(c.store.vault('Finnish'),'00-Dashboard/Curriculum Coverage.md'),'utf8'),coverage);
 }finally{await cleanup(c.root);}
});
