// Local filesystem preservation only. Importing or executing this file never connects.
import * as fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const ARTIFACT_FILES=Object.freeze(['baseline.json','seed.json','restore-body.sql','precommit-record.json','setup-commit-ack.json']);
const RUN_ID='6d2d9276-205e-4689-b7e4-596b482cc719';
const RESTORATION_ID='0bd631f0-16c0-4fa1-b1c0-4758702e6609';
const RUN='scenarios-6-12-2026-10-17T03-22-20-709Z-'+RUN_ID+'.json';
const RESTORATION='restoration-2026-10-17T04-06-52-403Z-'+RESTORATION_ID+'.json';
const RUN_SHA='e24992d2d42ad0d8e2a4dec8d094413c505825cbe5591831e33f0e0f532ad12f';
const RESTORATION_SHA='8c57c880c2d5b25c25d09042052b5128ad66d90ae831deb9f9133c6bfa82cd19';
const sha=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw Object.assign(new Error(code),{stopCode:code});};
const equalPath=(a,b)=>resolve(a).toLowerCase()===resolve(b).toLowerCase();
function plainDirectory(path,io){need(io.lstatSync(path).isDirectory()&&!io.lstatSync(path).isSymbolicLink()&&equalPath(io.realpathSync(path),path),'DIRECTORY_REDIRECTION');}
function plainFile(path,io){const s=io.lstatSync(path);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&equalPath(io.realpathSync(path),path),'FILE_REDIRECTION');return s;}
const sameStat=(a,b)=>['dev','ino','size','mtimeMs','ctimeMs'].every(k=>a[k]===b[k]);

export function verifyArchive(archiveDirectory,{directory,expectedHashes,provenance}={},io=fs) {
 plainDirectory(archiveDirectory,io);
 const manifestPath=join(archiveDirectory,'manifest.json');plainFile(manifestPath,io);
 const bytes=io.readFileSync(manifestPath),m=JSON.parse(bytes);
 need(m.version===1&&m.artifacts?.length===5&&equalPath(m.archiveDirectory,archiveDirectory),'ARCHIVE_MANIFEST');
 need(isDeepStrictEqual(m.artifacts.map(e=>basename(e.originalPath)).sort(),[...ARTIFACT_FILES].sort()),'ARCHIVE_ALLOWLIST');
 if(provenance)need(isDeepStrictEqual(m.provenance,provenance),'ARCHIVE_PROVENANCE');
 for(const e of m.artifacts){
  const name=basename(e.originalPath);
  need(equalPath(e.archivedPath,join(archiveDirectory,name))&&(!directory||equalPath(e.originalPath,join(directory,name))),'ARCHIVE_PATH');
  const stat=plainFile(e.archivedPath,io),copy=io.readFileSync(e.archivedPath);
  need(stat.size===e.size&&copy.length===e.size&&sha(copy)===e.sha256&&(!expectedHashes||e.sha256===expectedHashes[name]),'ARCHIVE_COPY_MISMATCH');
 }
 need(io.readFileSync(manifestPath).equals(bytes),'ARCHIVE_MANIFEST_CHANGED');
 return m;
}

export function archiveArtifacts({directory,expectedHashes,provenance,archiveName,io=fs}) {
 directory=resolve(directory);plainDirectory(directory,io);
 need(provenance&&/^[a-z0-9-]+$/.test(provenance.runId)&&/^[a-z0-9-]+$/.test(provenance.restorationId),'ARCHIVE_IDENTITY');
 need(isDeepStrictEqual(Object.keys(expectedHashes).sort(),[...ARTIFACT_FILES].sort())&&Object.values(expectedHashes).every(h=>/^[a-f0-9]{64}$/.test(h)),'SOURCE_HASH_MANIFEST');
 const sources=ARTIFACT_FILES.map(name=>{
  const path=join(directory,name),stat=plainFile(path,io),bytes=io.readFileSync(path);
  need(sameStat(stat,plainFile(path,io))&&stat.size===bytes.length&&sha(bytes)===expectedHashes[name],'SOURCE_CHANGED_OR_HASH_MISMATCH');
  return {name,path,stat,bytes};
 });
 const archiveRoot=join(directory,'archives');
 if(!io.existsSync(archiveRoot))io.mkdirSync(archiveRoot,{mode:0o700});
 plainDirectory(archiveRoot,io);
 archiveName??=`recovered-${provenance.runId.slice(0,8)}-${new Date().toISOString().replace(/[-:.]/g,'')}-${randomUUID()}`;
 need(/^recovered-[a-zA-Z0-9-]+$/.test(archiveName),'ARCHIVE_NAME');
 const archiveDirectory=join(archiveRoot,archiveName);
 need(!io.existsSync(archiveDirectory),'ARCHIVE_DESTINATION_EXISTS');
 io.mkdirSync(archiveDirectory,{mode:0o700});plainDirectory(archiveDirectory,io);
 const writeNew=(path,bytes)=>{
  const fd=io.openSync(path,'wx',0o600);
  try{io.writeFileSync(fd,bytes);io.fsyncSync(fd);}finally{io.closeSync(fd);}
  const actual=io.readFileSync(path);need(actual.length===bytes.length&&sha(actual)===sha(bytes),'DURABLE_COPY_MISMATCH');
 };
 const manifest={version:1,createdAt:new Date().toISOString(),archiveDirectory,provenance,
  verification:'All copies and this manifest are flushed and verified before any working-path removal.',
  artifacts:sources.map(s=>({originalPath:s.path,archivedPath:join(archiveDirectory,s.name),size:s.bytes.length,sha256:sha(s.bytes)}))};
 for(const [i,s] of sources.entries())writeNew(manifest.artifacts[i].archivedPath,s.bytes);
 const manifestPath=join(archiveDirectory,'manifest.json'),manifestBytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');
 writeNew(manifestPath,manifestBytes);
 for(const path of [...manifest.artifacts.map(e=>e.archivedPath),manifestPath]){
  io.chmodSync(path,0o444);need((plainFile(path,io).mode&0o222)===0,'ARCHIVE_SEAL_FAILED');
 }
 io.chmodSync(archiveDirectory,0o555);
 verifyArchive(archiveDirectory,{directory,expectedHashes,provenance},io);
 need(io.readFileSync(manifestPath).equals(manifestBytes),'ARCHIVE_MANIFEST_CHANGED');
 const verifySource=s=>{
  need(sameStat(s.stat,plainFile(s.path,io))&&sha(io.readFileSync(s.path))===expectedHashes[s.name]&&
   sameStat(s.stat,plainFile(s.path,io)),'SOURCE_CHANGED_DURING_ARCHIVE');
 };
 // Recheck every original after all durable copies/manifest, before the first unlink.
 sources.forEach(verifySource);
 const cleared=[];
 for(const s of sources){verifySource(s);io.unlinkSync(s.path);cleared.push(s.path);}
 need(sources.every(s=>!io.existsSync(s.path)),'WORKING_PATH_NOT_CLEAR');
 verifyArchive(archiveDirectory,{directory,expectedHashes,provenance},io);
 return {archiveDirectory,manifestPath,manifestSha256:sha(manifestBytes),cleared,hashes:expectedHashes};
}

// Explicit historical read location for local tests/review. Never a live recovery fallback.
export function findArchivedArtifacts(root) {
 const directory=join(root,'scratch/phase3n-n2-evidence'),archiveRoot=join(directory,'archives');
 plainDirectory(directory,fs);plainDirectory(archiveRoot,fs);
 const matches=[];
 for(const name of fs.readdirSync(archiveRoot)){
  if(!name.startsWith('recovered-'))continue;
  const path=join(archiveRoot,name),manifestPath=join(path,'manifest.json');
  if(!fs.existsSync(manifestPath))continue;
  const m=verifyArchive(path,{directory});
  if(m.provenance.runId===RUN_ID&&m.provenance.restorationId===RESTORATION_ID&&
   m.provenance.scenario.sha256===RUN_SHA&&m.provenance.restoration.sha256===RESTORATION_SHA)matches.push(path);
 }
 need(matches.length===1,'UNIQUE_HISTORICAL_ARCHIVE_REQUIRED');return matches[0];
}

async function main(){
 need(process.argv.length===3&&process.argv[2]==='--archive','ARGUMENTS');
 const root=fileURLToPath(new URL('../../../',import.meta.url)).replace(/[\\/]$/,'');
 const directory=join(root,'scratch/phase3n-n2-evidence');
 need(directory.startsWith(root+sep)&&/^\/scratch\/$/m.test(fs.readFileSync(join(root,'.gitignore'),'utf8').replaceAll('\r','')),'IGNORED_WORKSPACE_REQUIRED');
 plainDirectory(directory,fs);
 const runPath=join(directory,RUN),restorationPath=join(directory,RESTORATION);
 const historical=fs.readFileSync(runPath),restoration=fs.readFileSync(restorationPath);
 need(sha(historical)===RUN_SHA&&sha(restoration)===RESTORATION_SHA,'HISTORICAL_EVIDENCE_HASH');
 const r=JSON.parse(restoration);
 need(r.cleanupCommitAcknowledged&&r.clients.every(c=>c.closed&&c.exitCode===0),'CAPTURED_RESTORATION_REQUIRED');
 const proof=r.clients.find(c=>c.label==='O-post')?.frames.find(f=>f.name==='independent-baseline-comparison');
 need(proof?.text.includes('RECOVERY_BASELINE_MATCH\nROLLBACK')&&!proof.stderr,'CAPTURED_BASELINE_PROOF');
 const {loadRecoveryArtifacts}=await import('./recover-committed-setup.mjs');
 const original=loadRecoveryArtifacts(root);
 need(isDeepStrictEqual(original.hashes,r.originalArtifacts),'RECOVERED_RUN_PROVENANCE');
 const {loadSources,compareCatalog}=await import('./execute-scenarios-6-12.mjs');
 compareCatalog(r.clients.find(c=>c.label==='final-catalog').frames.find(f=>f.name==='final-catalog').text,loadSources(root).catalogReference);
 const keys=['baseline','seed','restore','precommit','commitAcknowledgement'];
 const expectedHashes=Object.fromEntries(ARTIFACT_FILES.map((name,i)=>[name,original.hashes[keys[i]]]));
 const provenance={runId:RUN_ID,restorationId:RESTORATION_ID,scenario:{path:runPath,sha256:RUN_SHA},restoration:{path:restorationPath,sha256:RESTORATION_SHA}};
 const result=archiveArtifacts({directory,expectedHashes,provenance});
 need(sha(fs.readFileSync(runPath))===RUN_SHA&&sha(fs.readFileSync(restorationPath))===RESTORATION_SHA,'HISTORICAL_EVIDENCE_CHANGED');
 const verified=loadRecoveryArtifacts(root,fs.readFileSync,result.archiveDirectory);
 need(isDeepStrictEqual(verified.hashes,original.hashes),'ARCHIVED_PROVENANCE_MISMATCH');
 process.stdout.write(JSON.stringify({result:'DURABLE ARTIFACTS ARCHIVED',...result},null,2)+'\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{
 process.stderr.write('NO-GO - LOCAL ARCHIVE: '+(e.stopCode??'FILESYSTEM_FAILURE')+'. Preserve all partial copies; no automatic retry.\n');process.exitCode=1;
});
