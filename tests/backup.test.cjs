const assert = require('node:assert/strict');
const esbuild = require('esbuild');
(async () => {
 const bundle = await esbuild.build({stdin:{contents:"export * from './src/controllers/backupData'; export * from './src/controllers/dataAccess';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false});
 const mod={exports:{}};new Function('module','exports',bundle.outputFiles[0].text)(mod,mod.exports);
 const api=mod.exports;
 const year = n => ({year:n,months:Object.fromEntries(Array.from({length:12},(_,i)=>[i+1,{history:[]}]))});
 const data = {format:'financial-accounting-backup',formatVersion:1,pluginVersion:'1.0.3',createdAt:'2026-10-19T10:00:00Z',settings:{startYear:2025,baseCurrency:'KZT',backupFolder:'Financial Accounting Backups'},files:{
  'accounts.json':{accounts:[{id:'a',name:'Account',emoji:'',balance:'999999999999999999.123456789',currency:'KZT',generalBalance:true,archived:false}]},
  'categories.json':{categories:{income_plan:[],expenditure_plan:[{id:'c',name:'Food',emoji:'',type:'expense',archived:false}]}},
  '2025.json':year(2025), '2026.json':year(2026)
 }};
 data.files['2026.json'].months[10].history=[{id:'op',type:'expense',amount:'1.23456789',bill:{id:'a'},category:{id:'c'},date:'2026-10-19T12:30:00'}];
 function setup() {
  const files=new Map(Object.entries(data.files).map(([n,v])=>['db/'+n,JSON.stringify(v)]));const dirs=new Set(['db']);
  let saved=structuredClone(data.settings),fail=()=>false;
  const adapter={exists:async p=>files.has(p)||dirs.has(p),read:async p=>{if(!files.has(p))throw Error('Missing '+p);return files.get(p);},list:async p=>({files:[...files.keys()].filter(f=>f.startsWith(p+'/')&&!f.slice(p.length+1).includes('/')),folders:[]}),
   write:async(p,t)=>{if(fail(p,'write'))throw Error('write failure');files.set(p,t);},remove:async p=>{if(fail(p,'remove'))throw Error('remove failure');files.delete(p);},rename:async(a,b)=>{files.set(b,files.get(a));files.delete(a);}};
  const plugin={dbPath:'db',manifest:{version:'1.0.3'},settings:structuredClone(data.settings),loadData:async()=>structuredClone(saved),saveData:async s=>{if(fail('settings','write'))throw Error('settings failure');saved=structuredClone(s);},app:{vault:{adapter,createFolder:async p=>dirs.add(p),create:async(p,t)=>{assert(!files.has(p));if(fail(p,'create'))throw Error('create failure');files.set(p,t);}}}};
  return {plugin,files,setFail:fn=>{fail=fn;}};
 }
 const parsed=api.parseBackup(JSON.stringify(data));assert.match(api.backupSummary(parsed),/operations: 1/);
 for(const mutate of [d=>d.formatVersion=2,d=>d.files['../escape.json']={},d=>d.files['2026.json'].months[10].history[0].bill.id='missing',d=>d.files['2026.json'].months[10].history.push(d.files['2026.json'].months[10].history[0]),d=>d.files['accounts.json'].accounts[0].balance='NaN',d=>d.files['2026.json'].months[10].history[0].date='2026-02-31T12:00:00',d=>delete d.files['2026.json'].months[1]]){
  const copy=structuredClone(data);mutate(copy);assert.throws(()=>api.parseBackup(JSON.stringify(copy)));
 }
 for(const p of ['../outside','/absolute','C:\\outside','.obsidian/backups','a/../b'])assert.throws(()=>api.backupFolder(p));
 const s=setup();const path=await api.createBackup(s.plugin);const second=await api.createBackup(s.plugin);assert.notEqual(path,second);
 assert.deepEqual(api.parseBackup(s.files.get(path)).files,data.files);assert.equal(JSON.parse(s.files.get(path)).files['accounts.json'].accounts[0].balance,'999999999999999999.123456789');
 const before=[...s.files].filter(([p])=>p.startsWith('db/'));
 const target=structuredClone(data);delete target.files['2025.json'];target.settings.baseCurrency='USD';target.files['accounts.json'].accounts[0].balance='42';
 const safety=await api.restoreBackup(s.plugin,target);assert(s.files.has(safety));assert(!s.files.has('db/2025.json'));assert.equal(JSON.parse(s.files.get('db/accounts.json')).accounts[0].balance,'42');assert.equal(s.plugin.settings.baseCurrency,'USD');assert(!s.files.has('db/restore-journal.json'));
 await api.restoreBackup(s.plugin,api.parseBackup(s.files.get(safety)));assert.deepEqual([...s.files].filter(([p])=>p.startsWith('db/')).sort().map(([p,t])=>[p,JSON.parse(t)]),before.sort().map(([p,t])=>[p,JSON.parse(t)]));
 // Safety backup failure must leave the database untouched.
 const safetyFailure=setup();const safetyBefore=[...safetyFailure.files];safetyFailure.setFail((p,op)=>op==='create');await assert.rejects(api.restoreBackup(safetyFailure.plugin,target),/create failure/);assert.deepEqual([...safetyFailure.files],safetyBefore);
 // Failure halfway through applying a restore rolls back all files and settings.
 const failed=setup();const failedBefore=[...failed.files];let once=true;failed.setFail((p,op)=>p==='db/categories.json'&&op==='write'&&once?(once=false,true):false);
 await assert.rejects(api.restoreBackup(failed.plugin,target),/previous data was recovered/);assert.deepEqual([...failed.files].filter(([p])=>p.startsWith('db/')),failedBefore);
 // Persistent disk failure leaves the journal; startup recovery retries it.
 const crash=setup();crash.setFail((p,op)=>p==='db/categories.json'&&op==='write');await assert.rejects(api.restoreBackup(crash.plugin,target),/recovery is pending/);assert(crash.files.has('db/restore-journal.json'));
 await assert.rejects(api.createBackup(crash.plugin),/awaiting recovery/);
 crash.setFail(()=>false);assert.equal(await api.recoverInterruptedRestore(crash.plugin),true);assert.deepEqual([...crash.files].filter(([p])=>p.startsWith('db/')),failedBefore);assert.equal(await api.recoverInterruptedRestore(crash.plugin),false);
 // Settings write failure also rolls the database back.
 const settingsFailure=setup();let failSettings=true;settingsFailure.setFail(p=>p==='settings'&&failSettings?(failSettings=false,true):false);await assert.rejects(api.restoreBackup(settingsFailure.plugin,target),/previous data was recovered/);assert.equal(settingsFailure.plugin.settings.baseCurrency,'KZT');
 // First use before opening the finance panel is supported.
 const empty=setup();empty.files.clear();const emptyPath=await api.createBackup(empty.plugin);assert.equal(api.parseBackup(empty.files.get(emptyPath)).files['accounts.json'].accounts.length,0);
 // Backup and restore cannot overlap an in-flight financial operation.
 let finish;const pending=api.protectDataOperation(()=>new Promise(resolve=>{finish=resolve;}))();await assert.rejects(api.createBackup(s.plugin),/busy/);finish({status:'success'});await pending;
 const release=api.acquireBackupLock();assert.equal((await api.protectDataOperation(async()=>({status:'success'}))()).status,'error');release();
 console.log('Backup validation, round-trip, safety copy, rollback, startup recovery and concurrency checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
