import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadSources, compareCatalog } from '../docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs';

const reference=loadSources(process.cwd()).catalogReference.replaceAll('\r\n','\n');
const signature='check_and_unlock_achievements()|';
const entries=['postgres=X/postgres','authenticated=X/postgres','service_role=X/postgres'];
const acl=items=>'{'+items.join(',')+'}';
function withAcl(value,source=reference) {
 return source.split('\n').map(line=>{
  if(!line.startsWith(signature))return line;
  const fields=line.split('|');fields[4]=value;return fields.join('|');
 }).join('\n');
}

test('same routine ACL entries reordered pass',()=>compareCatalog(withAcl(acl([...entries].reverse())),reference));
for(const [name,value] of [
 ['missing grant',acl(entries.slice(0,2))],
 ['additional grant',acl([...entries,'anon=X/postgres'])],
 ['different privilege',acl(entries.map(x=>x.replace('authenticated=X/','authenticated=r/')))],
 ['different grantor',acl(entries.map(x=>x.replace('authenticated=X/postgres','authenticated=X/service_role')))],
 ['different grant option',acl(entries.map(x=>x.replace('authenticated=X/','authenticated=X*/')))],
 ['different grantee',acl(entries.map(x=>x.replace('authenticated=','other_role=')))],
 ['duplicate entry',acl([...entries,entries[1]])],
 ['NULL ACL','<NULL>'],['empty ACL','{}'],['malformed ACL','{broken,,array}'],
])test('routine ACL comparison rejects '+name,()=>assert.throws(()=>compareCatalog(withAcl(value),reference)));

test('quoted array entries with embedded comma and escaped quotes retain item boundaries',()=>{
 const items=['"\\"role,one\\"=X/postgres"','"\\"role\\\\two\\"=X/postgres"','postgres=X/postgres'];
 compareCatalog(withAcl(acl([...items].reverse())),withAcl(acl(items)));
 assert.throws(()=>compareCatalog(withAcl(acl(items.slice(1))),withAcl(acl(items))));
});
for(const field of [0,1,2,3,5,6,7,8])test('non-ACL routine field remains strict: '+field,()=>{
 const actual=reference.split('\n').map(line=>{if(!line.startsWith(signature))return line;const f=line.split('|');f[field]+='_drift';return f.join('|');}).join('\n');
 assert.throws(()=>compareCatalog(actual,reference));
});
test('ACL-looking result rows inside routine definitions remain byte-strict',()=>{
 const row=reference.split('\n').find(line=>line.startsWith(signature));
 const start=reference.indexOf('TRUSTED_ROUTINE_DEFINITIONS_AND_KNOWN_ROUTINE_PRIVILEGES');
 const offset=reference.indexOf('AS $function$\n',start);assert.ok(offset>start);
 const before=reference.slice(0,offset)+reference.slice(offset).replace('AS $function$\n','AS $function$\n/*\n'+row+'\n*/\n');
 const reordered=row.replace(acl(entries),acl([...entries].reverse()));
 const after=before.replace('/*\n'+row+'\n*/','/*\n'+reordered+'\n*/');
 assert.notEqual(after,before);
 assert.throws(()=>compareCatalog(after,before));
});
test('unproven table ACL order differences remain strict',()=>{
 const lines=reference.split('\n'),start=lines.indexOf('TABLE_COLUMN_SCHEMA_AND_DIRECT_ACLS');
 const i=lines.findIndex((line,index)=>index>start&&line.startsWith('profiles|')&&line.split('|')[4]?.includes(','));
 assert.ok(i>start);const f=lines[i].split('|');const items=f[4].slice(1,-1).split(',');f[4]=acl(items.reverse());lines[i]=f.join('|');
 assert.throws(()=>compareCatalog(lines.join('\n'),reference));
});
test('existing restored capture matches unchanged pinned pre-test reference',()=>{
 const path='scratch/phase3n-n2-evidence/restoration-2026-10-17T04-06-52-403Z-0bd631f0-16c0-4fa1-b1c0-4758702e6609.json';
 const capture=JSON.parse(readFileSync(path,'utf8'));
 const text=capture.clients.find(c=>c.label==='final-catalog').frames.find(f=>f.name==='final-catalog').text;
 compareCatalog(text,reference);
});
