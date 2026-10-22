'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const normalize = value => String(value).normalize('NFC').toLocaleLowerCase('fi').trim();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const stable = value => JSON.stringify(value, function(key, item) {
  if (item && typeof item === 'object' && !Array.isArray(item)) return Object.fromEntries(Object.keys(item).sort().map(k => [k, item[k]]));
  return item;
});
function checkDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(value + 'T12:00:00Z').toISOString().slice(0,10) !== value) throw new Error('Expected a real YYYY-MM-DD date');
  return value;
}
const today = () => new Date().toLocaleDateString('sv-SE', {timeZone:'Europe/Helsinki'});
function addDays(date, count) { const d = new Date(checkDate(date) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + count); return d.toISOString().slice(0,10); }
function atomic(file, value) {
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const tmp = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(tmp, typeof value === 'string' ? value : JSON.stringify(value,null,2)+'\n', {encoding:'utf8',flag:'wx'}); fs.renameSync(tmp,file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function fresh(meta) {
  return {...meta,score:0,correct:0,incorrect:0,attempts:0,status:'Not mastered',last_practised:null,last_outcome:null,last_form:null,last_evidence:null,last_error:null,practice_days:[],forms:{},next_review:null};
}
function createTracker(vaultRoot) {
  const root = path.resolve(vaultRoot);
  const statePath = path.join(root,'00-Dashboard','Mastery State.json');
  const historyDir = path.join(root,'00-Dashboard','Mastery History');
  const lockPath = statePath + '.lock';
  const load = () => { const state=JSON.parse(fs.readFileSync(statePath,'utf8')); if(state.schema_version!==2 || state.threshold!==50) throw new Error('Unsupported mastery schema'); return state; };
  function locked(work) {
    fs.mkdirSync(path.dirname(lockPath),{recursive:true});
    let fd;
    try { fd=fs.openSync(lockPath,'wx'); }
    catch(e) { if(e.code==='EEXIST') throw new Error('Mastery tracker is locked by another update; retry after it completes. Inspect a stale lock before removing it.'); throw e; }
    try { fs.writeFileSync(fd,JSON.stringify({pid:process.pid,created:new Date().toISOString()})); return work(); }
    finally { fs.closeSync(fd); fs.unlinkSync(lockPath); }
  }
  function resolve(state, kind, key) {
    if(!['word','grammar'].includes(kind)) throw new Error('kind must be word or grammar');
    const table = kind==='word' ? state.words : state.grammar;
    if(typeof key!=='string' || !key.trim()) throw new Error('Supply an item ID or exact name');
    if(Object.hasOwn(table,key)) return table[key];
    const needle=normalize(key);
    if(kind==='word' && Object.hasOwn(state.word_aliases,needle)) return table[state.word_aliases[needle]];
    const found=Object.values(table).filter(item=>normalize(item.name)===needle || normalize(item.id)===needle);
    if(found.length!==1) throw new Error(found.length ? 'Ambiguous item; use its stable ID' : 'Unknown '+kind+': '+key+'; use search or add the item explicitly');
    return found[0];
  }
  function compact(item, kind, details=false) {
    const result={kind,id:item.id,name:item.name,score:item.score,meter:item.score+'/50',status:item.status,correct:item.correct,incorrect:item.incorrect,practice_days:item.practice_days.length,last_practised:item.last_practised,last_form:item.last_form};
    if(item.last_error) result.last_error=item.last_error;
    if(details) { result.forms=item.forms; result.next_review=item.next_review; result.evidence=item.last_evidence; }
    return result;
  }
  function limitValue(value, fallback=6) { const n=value===undefined?fallback:Number(value); if(!Number.isInteger(n)||n<1||n>50) throw new Error('limit must be 1–50'); return n; }
  function render(state) {
    const rules=Object.values(state.grammar);
    let out='# Grammar Mastery\n\nGenerated view of [Mastery State.json](Mastery%20State.json). Update through tools/study/FinnishMastery.cjs; do not edit scores here. **+1** correct, **−1** incorrect, clamped to **0–50**. **Mastered = 50/50**; an error at 50 returns it to 49. Untested rules have zero attempts. Each rule counts at most once per exercise. Correctness concerns the targeted rule, not unrelated vocabulary errors.\n\nThis expandable catalogue covers foundations through advanced Finnish; a label is a practice milestone, not CEFR placement. [Topic reference](https://uusikielemme.fi/finnish-grammar). Detailed originals and support remain in the portfolio and Mastery History.\n\n';
    const safe=s=>String(s??'—').replace(/\|/g,'&#124;').replace(/\r?\n/g,' ');
    for(const group of [...new Set(rules.map(r=>r.group))]) {
      out+='## '+safe(group)+'\n\n| ID | Rule | Progress | Status | Correct | Incorrect | Days | Last practised |\n|---|---|---|---|---|---|---|---|\n';
      for(const r of rules.filter(r=>r.group===group)) out+='| '+[r.id,r.name,r.score+'/50',r.status,r.correct,r.incorrect,r.practice_days.length,r.last_practised].map(safe).join(' | ')+' |\n';
      out+='\n';
    }
    atomic(path.join(root,'00-Dashboard','Grammar Mastery.md'),out);
  }
  function evidencePath(relative) {
    if(typeof relative!=='string'||!relative.trim()||path.isAbsolute(relative)) throw new Error('Evidence must be a vault-relative path to an assessed record');
    const full=path.resolve(root,relative);
    const rel=path.relative(root,full);
    if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)) throw new Error('Evidence must stay inside this subject vault');
    if(rel.split(path.sep).includes('90-Session-Notes')) throw new Error('Keep assessment evidence outside session notes');
    if(!fs.statSync(full).isFile()) throw new Error('Evidence is not a file');
    return rel.split(path.sep).join('/');
  }
  function prepare(state,input) {
    if(!input||typeof input!=='object'||typeof input.id!=='string'||!input.id.trim()||input.id.length>200) throw new Error('Each exercise requires a stable unique id');
    checkDate(input.date);
    const evidence=evidencePath(input.evidence);
    if(typeof input.support!=='string'||!input.support.trim()) throw new Error('Document support used');
    if(!Array.isArray(input.responses)||!input.responses.length||input.responses.some(r=>typeof r!=='string'||!r.trim())) throw new Error('Original explicit responses are required');
    if(!Array.isArray(input.results)||!input.results.length||input.results.length>100) throw new Error('Supply 1–100 assessed results per exercise');
    const seen=new Set();
    const results=input.results.map(r=>{
      const item=resolve(state,r.kind,r.key);
      const unique=r.kind+':'+item.id;
      if(seen.has(unique)) throw new Error('An item can be counted only once per exercise: '+item.name);
      seen.add(unique);
      if(!['correct','incorrect','practice'].includes(r.outcome)) throw new Error('Outcome must be correct, incorrect or practice');
      if(typeof r.form!=='string'||!r.form.trim()) throw new Error('Record the observed form or construction');
      if(r.outcome==='incorrect'&&(typeof r.error!=='string'||!r.error.trim())) throw new Error('An incorrect use needs an error explanation');
      if(r.outcome==='correct' && input.model_supplied===true) throw new Error('A supplied model earns practice only, not a correct-use point');
      return {kind:r.kind,key:item.id,outcome:r.outcome,form:r.form,error:r.error||null};
    }).sort((a,b)=>(a.kind+':'+a.key).localeCompare(b.kind+':'+b.key));
    return {id:input.id,date:input.date,evidence,support:input.support,model_supplied:input.model_supplied===true,responses:input.responses,results};
  }
  return {
    initialize({words,grammar,aliases={}}) {
      return locked(()=>{
        if(fs.existsSync(statePath)) throw new Error('State exists; initialization never overwrites progress');
        const state={schema_version:2,threshold:50,created:today(),words:{},grammar:{},word_aliases:aliases,applied_exercises:{}};
        for(const [kind,items] of [['words',words],['grammar',grammar]]) {
          if(!Array.isArray(items)||!items.length) throw new Error('Both catalogues are required');
          const names=new Set();
          for(const meta of items) {
            if(!meta.id||!meta.name||Object.hasOwn(state[kind],meta.id)||names.has(normalize(meta.name))) throw new Error('Duplicate or invalid catalogue item');
            names.add(normalize(meta.name));state[kind][meta.id]=fresh(meta);
          }
        }
        for(const [alias,id] of Object.entries(aliases)) if(!Object.hasOwn(state.words,id)||alias!==normalize(alias)) throw new Error('Invalid word alias');
        atomic(statePath,state);render(state);return {words:words.length,grammar:grammar.length};
      });
    },
    lookup({kind='word',keys,details=false}) {
      if(!Array.isArray(keys)||!keys.length||keys.length>50) throw new Error('Supply 1–50 lookup keys');
      const state=load();return keys.map(key=>compact(resolve(state,kind,key),kind,details));
    },
    search({kind='word',query,limit=6}) {
      limit=limitValue(limit); if(!['word','grammar'].includes(kind)||typeof query!=='string'||!query.trim()) throw new Error('Supply kind and search query');
      const state=load();return Object.values(kind==='word'?state.words:state.grammar).filter(r=>normalize(r.name).includes(normalize(query))).slice(0,limit).map(r=>compact(r,kind));
    },
    review({kind='word',limit=6,date=today(),include_names=false}) {
      limit=limitValue(limit);checkDate(date);if(!['word','grammar'].includes(kind)) throw new Error('Invalid kind');
      const state=load();
      const candidates=Object.values(kind==='word'?state.words:state.grammar).filter(r=>(include_names||r.attempts>0||!/(proper|abbreviation|affix)/i.test(r.part_of_speech||'')) && (r.score<50 || (r.next_review&&r.next_review<=date)));
      function priority(r) { if(r.last_outcome==='incorrect') return 0; if(r.attempts>0&&r.next_review&&r.next_review<=date) return 1; if(r.attempts>0&&r.score<50) return 2; return 3; }
      candidates.sort((a,b)=>priority(a)-priority(b)||(a.next_review||date).localeCompare(b.next_review||date)||(a.source_rank??Number(a.id.replace(/^G/,''))??0)-(b.source_rank??Number(b.id.replace(/^G/,''))??0)||a.id.localeCompare(b.id));
      return candidates.slice(0,limit).map(r=>({...compact(r,kind),reason:r.last_outcome==='incorrect'?'recent error':r.attempts===0?'new':r.next_review<=date?'due review':'building progress'}));
    },
    summary() {
      const state=load();const result={threshold:50,exercises:Object.keys(state.applied_exercises).length};
      for(const [kind,items] of [['words',state.words],['grammar',state.grammar]]){const values=Object.values(items);result[kind]={total:values.length,tested:values.filter(r=>r.attempts>0).length,mastered:values.filter(r=>r.score===50).length,not_mastered:values.filter(r=>r.score<50).length,correct:values.reduce((s,r)=>s+r.correct,0),incorrect:values.reduce((s,r)=>s+r.incorrect,0)};}
      return result;
    },
    recordMany(inputs) {
      if(!Array.isArray(inputs)||!inputs.length||inputs.length>100) throw new Error('Supply 1–100 exercises');
      return locked(()=>{
        const state=load();const writes=[];const report=[];
        for(const input of inputs){
          const event=prepare(state,input);const digest=hash(stable(event));
          if(Object.hasOwn(state.applied_exercises,event.id)) {
            if(state.applied_exercises[event.id]!==digest) throw new Error('Exercise ID already used with different content: '+event.id);
            report.push({id:event.id,applied:false,reason:'already recorded'});continue;
          }
          const changes=[];
          for(const r of event.results){
            const item=resolve(state,r.kind,r.key);
            if(item.last_practised && event.date<item.last_practised) throw new Error('Record exercises chronologically for '+item.name);
            const before=item.score;
            if(r.outcome!=='practice') {
              item.score=Math.max(0,Math.min(50,item.score+(r.outcome==='correct'?1:-1)));
              item[r.outcome==='correct'?'correct':'incorrect']++;item.attempts++;
              item.status=item.score===50?'Mastered':'Not mastered';
              item.last_practised=event.date;item.last_outcome=r.outcome;item.last_form=r.form;item.last_evidence=event.evidence;
              if(!item.practice_days.includes(event.date)) item.practice_days.push(event.date);
              if(!Object.hasOwn(item.forms,r.form)) item.forms[r.form]={correct:0,incorrect:0};
              item.forms[r.form][r.outcome==='correct'?'correct':'incorrect']++;
              if(r.outcome==='incorrect') item.last_error={date:event.date,form:r.form,message:r.error};
              item.next_review=addDays(event.date,r.outcome==='incorrect'?1:item.score===50?7:1);
            }
            changes.push({kind:r.kind,id:item.id,name:item.name,before,after:item.score,status:item.status});
          }
          state.applied_exercises[event.id]=digest;
          writes.push({event,digest});report.push({id:event.id,applied:true,changes});
        }
        // Validate every exercise before writing history or committing any score.
        fs.mkdirSync(historyDir,{recursive:true});
        for(const {event,digest} of writes){
          const file=path.join(historyDir,hash(event.id)+'.json');
          if(fs.existsSync(file)) {const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.digest!==digest) throw new Error('History conflict for '+event.id);}
          else atomic(file,{digest,...event});
        }
        if(writes.length) atomic(statePath,state);
        render(state);return report;
      });
    },
    add({kind,id,name,group='Personal additions',part_of_speech='personal vocabulary'}) {
      return locked(()=>{
        if(!['word','grammar'].includes(kind)||typeof name!=='string'||!name.trim())throw new Error('Supply item kind and name');
        const state=load(),table=kind==='word'?state.words:state.grammar;
        if(Object.values(table).some(r=>normalize(r.name)===normalize(name))||Object.hasOwn(state.word_aliases,normalize(name)))throw new Error('Item already exists');
        id=id||(kind==='word'?'personal-'+hash(normalize(name)).slice(0,12):'G'+String(Math.max(...Object.keys(state.grammar).map(k=>Number(k.slice(1))))+1).padStart(3,'0'));
        if(!/^[A-Za-z0-9-]+$/.test(id)||Object.hasOwn(table,id))throw new Error('Invalid or duplicate stable ID');
        const item=fresh({id,name:name.normalize('NFC'),...(kind==='grammar'?{group}:{part_of_speech,personal:true,source_rank:null})});
        table[id]=item;atomic(statePath,state);render(state);return compact(item,kind);
      });
    },
    render() {const state=load();render(state);return {rendered:'Grammar Mastery.md'};}
  };
}
module.exports={createTracker};
if(require.main===module) {
  try {
    const args=process.argv.slice(2);const action=args.shift();
    const tracker=createTracker(path.resolve(__dirname,'../../StudyVault/Finnish'));
    let result;
    if(action==='lookup'){const kind=args.shift();result=tracker.lookup({kind,keys:args});}
    else if(action==='search'){result=tracker.search({kind:args.shift(),query:args.shift(),limit:args.shift()});}
    else if(action==='review'){result=tracker.review({kind:args.shift(),limit:args.shift()});}
    else if(action==='summary'){result=tracker.summary();}
    else if(action==='record'){const data=JSON.parse(fs.readFileSync(args[0],'utf8'));result=tracker.recordMany(Array.isArray(data)?data:[data]);}
    else if(action==='render'){result=tracker.render();}
    else throw new Error('Usage: node tools/study/FinnishMastery.cjs lookup word palautua | lookup grammar G017 | search grammar partitive | review word 6 | summary | record <assessed-exercises.json> | render');
    process.stdout.write(JSON.stringify(result)+'\n');
  } catch(e) {process.stderr.write(e.message+'\n');process.exitCode=1;}
}
