import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { ARTIFACT_FILES, archiveArtifacts, verifyArchive } from '../docs/phase3n/phase3n-n/archive-recovered-artifacts.mjs';

const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture() {
 const directory=fs.mkdtempSync(join(tmpdir(),'revit-archive-'));
 const bytes=Object.fromEntries(ARTIFACT_FILES.map(n=>[n,Buffer.from('original '+n+'\n')]));
 for(const [n,b] of Object.entries(bytes))fs.writeFileSync(join(directory,n),b,{flag:'wx'});
 fs.writeFileSync(join(directory,'unrelated.json'),'preserve unrelated evidence');
 const expectedHashes=Object.fromEntries(Object.entries(bytes).map(([n,b])=>[n,sha(b)]));
 const provenance={runId:'fixture-run',restorationId:'fixture-restoration'};
 return {directory,bytes,options:{directory,archiveName:'recovered-fixture',expectedHashes,provenance},cleanup(){
  assert.equal(fs.realpathSync(dirname(directory)),fs.realpathSync(tmpdir()));assert.ok(basename(directory).startsWith('revit-archive-'));
  fs.rmSync(directory,{recursive:true,force:true});
 }};
}
const originalsPresent=f=>ARTIFACT_FILES.every(n=>fs.existsSync(join(f.directory,n)));
test('five byte-identical copies and sealed manifest precede clearing exactly five working paths',()=>{
 const f=fixture();try{
  const result=archiveArtifacts(f.options),manifest=verifyArchive(result.archiveDirectory,f.options);
  assert.equal(manifest.artifacts.length,5);assert.equal(result.cleared.length,5);
  for(const entry of manifest.artifacts){assert.deepEqual(fs.readFileSync(entry.archivedPath),f.bytes[basename(entry.archivedPath)]);assert.equal(fs.existsSync(entry.originalPath),false);assert.equal(fs.statSync(entry.archivedPath).mode&0o222,0);}
  assert.equal(fs.readFileSync(join(f.directory,'unrelated.json'),'utf8'),'preserve unrelated evidence');
  assert.equal(fs.statSync(result.manifestPath).mode&0o222,0);
 }finally{f.cleanup();}
});
for(const fault of ['missing','existing-destination','source-change','initial-hash','hash-mismatch','partial-copy','manifest-open','manifest-partial','manifest-flush','flush-failure','seal-failure'])test('fail closed without removing any source: '+fault,()=>{
 const f=fixture();try{
  const io={...fs},fds=new Map();let changed=false;
  if(fault==='missing')fs.unlinkSync(join(f.directory,'seed.json'));
  if(fault==='initial-hash')f.options.expectedHashes['seed.json']='0'.repeat(64);
  if(fault==='existing-destination'){fs.mkdirSync(join(f.directory,'archives'));fs.mkdirSync(join(f.directory,'archives','recovered-fixture'));}
  io.openSync=(path,...args)=>{if(fault==='manifest-open'&&basename(path)==='manifest.json')throw Error('manifest failure');const fd=fs.openSync(path,...args);fds.set(fd,String(path));return fd;};
  io.writeFileSync=(fd,b,...args)=>{
   const path=fds.get(fd)??'';
   if((fault==='partial-copy'&&basename(path)==='baseline.json')||(fault==='manifest-partial'&&basename(path)==='manifest.json'))return fs.writeFileSync(fd,b.subarray(0,Math.floor(b.length/2)),...args);
   fs.writeFileSync(fd,b,...args);
   if(fault==='source-change'&&!changed&&basename(path)==='manifest.json'){changed=true;fs.appendFileSync(join(f.directory,'seed.json'),'changed');}
  };
  io.readFileSync=(path,...args)=>fault==='hash-mismatch'&&String(path).includes('archives')&&basename(path)==='baseline.json'?Buffer.from('corrupted copy'):fs.readFileSync(path,...args);
  if(fault==='flush-failure')io.fsyncSync=()=>{throw Error('flush failure');};
  if(fault==='manifest-flush')io.fsyncSync=fd=>{if(basename(fds.get(fd)??'')==='manifest.json')throw Error('manifest flush failure');fs.fsyncSync(fd);};
  if(fault==='seal-failure')io.chmodSync=()=>{throw Error('seal failure');};
  assert.throws(()=>archiveArtifacts({...f.options,io}));
  for(const n of ARTIFACT_FILES)assert.equal(fs.existsSync(join(f.directory,n)),fault!=='missing'||n!=='seed.json');
  assert.equal(fs.readFileSync(join(f.directory,'unrelated.json'),'utf8'),'preserve unrelated evidence');
 }finally{f.cleanup();}
});
test('an existing archive/manifest is never overwritten',()=>{
 const f=fixture();try{
  const r=archiveArtifacts(f.options),before=fs.readFileSync(r.manifestPath);
  for(const [n,b] of Object.entries(f.bytes))fs.writeFileSync(join(f.directory,n),b,{flag:'wx'});
  assert.throws(()=>archiveArtifacts(f.options),/ARCHIVE_DESTINATION_EXISTS/);
  assert.deepEqual(fs.readFileSync(r.manifestPath),before);assert.ok(originalsPresent(f));
 }finally{f.cleanup();}
});
