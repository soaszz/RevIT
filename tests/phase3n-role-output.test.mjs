import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as executor from '../docs/phase3n/phase3n-n/execute-scenarios-6-12.mjs';

const path='scratch/phase3n-n2-evidence/scenarios-6-12-2026-10-17T03-22-20-709Z-6d2d9276-205e-4689-b7e4-596b482cc719.json';
const capture=JSON.parse(readFileSync(path,'utf8'));
function historical(label) {
 const c=capture.clients.find(c=>c.label===label);
 return {client:{label,pid:c.backendPid},frame:c.frames.find(f=>f.name===`s6-${label}-call`)};
}
for(const label of ['B','C'])test('exact historical '+label+' role output passes (role proof only)',()=>{
 const {frame,client}=historical(label);
 assert.match(frame.text,new RegExp(`service_role\\|postgres\\|${client.pid}\\|read committed`));
 assert.doesNotThrow(()=>executor.roleResult(frame,client));
});
const valid='service_role|postgres|162646|read committed';
for(const [name,replace] of [
 ['owner instead of service_role',()=>valid.replace('service_role','postgres')],
 ['wrong session user',()=>valid.replace('|postgres|','|service_role|')],
 ['changed PID',()=>valid.replace('162646','162647')],
 ['wrong isolation',()=>valid.replace('read committed','repeatable read')],
 ['missing role row',()=> ''],
 ['duplicate role row',()=>valid+'\n'+valid],
 ['ambiguous role rows',()=>valid+'\n'+valid.replace('162646','162647')],
 ['missing isolation column',()=>valid.replace('|read committed','')],
 ['extra column',()=>valid+'|unexpected'],
 ['malformed separators',()=>valid.replaceAll('|',' ')],
 ['leading whitespace',()=> ' '+valid],
 ['trailing whitespace',()=>valid+' '],
 ['old PID-first format',()=> '162646|service_role|postgres|read committed'],
 ['substring only',()=> 'prefix '+valid+' suffix'],
 ['unexpected delimited output',()=>valid+'\nunexpected|row'],
 ['malformed second role row',()=>valid+'\nservice_role postgres 162646 read committed'],
 ['unexpected unstructured output',()=>valid+'\nunexpected output'],
])test('role parser rejects '+name,()=>{
 const {frame,client}=historical('B');const text=frame.text.replace(valid,replace());
 assert.notEqual(text,frame.text);
 assert.throws(()=>executor.roleResult({...frame,text},client),/ACTUAL_SERVICE_ROLE/);
});
test('claims/set_config output and transport owner header alone are insufficient',()=>{
 const {frame,client}=historical('C');
 const text=frame.text.split(/\r?\n/).filter(l=>!l.startsWith('service_role|postgres|')).join('\n');
 assert.throws(()=>executor.roleResult({...frame,text},client),/ACTUAL_SERVICE_ROLE/);
});
test('invalid expected PID fails closed',()=>{
 const {frame,client}=historical('B');
 for(const pid of [null,0,'162646',NaN])assert.throws(()=>executor.roleResult(frame,{...client,pid}),/ACTUAL_SERVICE_ROLE/);
});
