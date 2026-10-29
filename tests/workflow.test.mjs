import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequest,transition,readiness,demoCatalog} from '../website/lab/engine.mjs';
import {scenarios,runScenario,makeEvent,validReport} from '../website/lab/scenarios.mjs';

function apply(state,type,options={}) {return transition(state,makeEvent(state,type,options));}
function reported(patch={}) {return apply(createRequest('unit:request'),'report',{payload:{...validReport,...patch}}).state;}
function assertBlockedUnchanged(state,event,code) {
  const before=structuredClone(state);
  assert.throws(()=>transition(state,event),error=>error.code===code);
  assert.deepEqual(state,before,'Rejected events must not mutate the original state');
}
for (const scenario of scenarios) test(`Scenario: ${scenario.name}`,()=>{
  const result=runScenario(scenario);
  assert.equal(result.passed,true,JSON.stringify(result.records.filter(r=>!r.check)));
  assert.equal(result.finalMatches,true);
});

test('Source objects are unchanged by successful transitions',()=>{
  const state=createRequest('immutable');
  const event=makeEvent(state,'report',{payload:validReport});
  const beforeState=structuredClone(state),beforeEvent=structuredClone(event);
  const result=transition(state,event);
  assert.deepEqual(state,beforeState); assert.deepEqual(event,beforeEvent);
  result.state.report.slot.start='tampered';
  assert.equal(event.payload.slot.start,validReport.slot.start);
});
test('Every required field independently prevents task creation',()=>{
  const patches=[{propertyId:null},{issue:''},{slot:null},{slot:{start:'2030-06-02T10:00:00Z',end:'2030-06-02T09:00:00Z'}}];
  for(const patch of patches){const s=reported(patch);assert.equal(readiness(s).ready,false);assertBlockedUnchanged(s,makeEvent(s,'create_task'),'MISSING_REQUIREMENTS');}
});
test('A blank issue cannot be disguised as whitespace',()=>{
  const s=reported({issue:' \n\t '});assertBlockedUnchanged(s,makeEvent(s,'create_task'),'MISSING_REQUIREMENTS');
});
test('Unknown and urgent classifications never create task intents',()=>{
  for(const urgency of ['urgent','unknown']){
    const out=apply(createRequest('classified'),'report',{payload:{...validReport,urgency}});
    assert.equal(out.state.control,'human');assert.deepEqual(out.effects.map(e=>e.type),['staff_review']);
    assertBlockedUnchanged(out.state,makeEvent(out.state,'create_task'),'HUMAN_OWNED');
  }
});
test('All six permutations require create → accept → confirm ordering',()=>{
  const sequences=[['create_task','accept_task','confirm_visit'],['create_task','confirm_visit','accept_task'],
    ['accept_task','create_task','confirm_visit'],['accept_task','confirm_visit','create_task'],
    ['confirm_visit','create_task','accept_task'],['confirm_visit','accept_task','create_task']];
  for(const seq of sequences){
    let state=reported(),effects=[],blocked=0;
    for(const type of seq){try{const r=apply(state,type,{actor:type==='accept_task'?'lead':'agent'});state=r.state;effects.push(...r.effects);}catch(e){assert.ok(e.code);blocked++;}}
    const confirms=effects.filter(e=>e.type==='guest_confirmation');
    assert.equal(confirms.length,seq.join(',')==='create_task,accept_task,confirm_visit'?1:0);
    if(confirms.length)assert.equal(blocked,0);
  }
});
test('Two workers cannot create separate tasks from one revision',()=>{
  const state=reported();
  const a=makeEvent(state,'create_task',{id:'worker-a'}),b=makeEvent(state,'create_task',{id:'worker-b'});
  const out=transition(state,a);
  assert.equal(out.effects.length,1);
  assertBlockedUnchanged(out.state,b,'REVISION_CONFLICT');
});
test('A replay after later progress preserves progress and emits no new intent',()=>{
  let state=reported();const event=makeEvent(state,'create_task',{id:'original-task'});
  state=transition(state,event).state;state=apply(state,'accept_task',{actor:'lead'}).state;
  const replay=transition(state,event);
  assert.equal(replay.replayed,true);assert.equal(replay.state.status,'accepted');assert.deepEqual(replay.effects,[]);
  assert.equal(replay.state.revision,state.revision);
});
test('An event ID cannot be reused with altered intent or actor',()=>{
  let state=reported();const event=makeEvent(state,'create_task');state=transition(state,event).state;
  for(const changed of [{...event,type:'confirm_visit'},{...event,actor:{id:'other',role:'agent'}}])assertBlockedUnchanged(state,changed,'EVENT_ID_CONFLICT');
});
test('Task fields are derived from authoritative report data',()=>{
  const s=reported();assertBlockedUnchanged(s,makeEvent(s,'create_task',{payload:{leadId:'attacker',propertyId:'DEMO-02'}}),'UNSUPPORTED_PAYLOAD');
  const out=apply(s,'create_task');assert.equal(out.state.task.leadId,demoCatalog['DEMO-01'].leadId);
  assert.equal(out.state.task.propertyId,'DEMO-01');
});
test('Actor role alone cannot make another lead the assigned lead',()=>{
  const s=apply(reported(),'create_task').state;
  assertBlockedUnchanged(s,makeEvent(s,'accept_task',{actor:'wrongLead'}),'WRONG_ASSIGNEE');
  assertBlockedUnchanged(s,makeEvent(s,'accept_task',{actor:'agent'}),'NOT_AUTHORIZED');
});
test('Human ownership blocks automatic clarification, creation and confirmation',()=>{
  const s=apply(reported(),'takeover',{actor:'staff',payload:{reason:'Manual review.'}}).state;
  for(const [type,payload] of [['clarify',{issue:'Changed.'}],['create_task',{}],['confirm_visit',{}]])
    assertBlockedUnchanged(s,makeEvent(s,type,{payload}),'HUMAN_OWNED');
});
test('Agent instructions cannot override the mandatory staff authorization',()=>{
  const s=apply(reported(),'takeover',{actor:'staff',payload:{reason:'Staff assistance.'}}).state;
  assertBlockedUnchanged(s,makeEvent(s,'authorize_resume',{payload:{reason:'Agent decided to resume.'}}),'NOT_AUTHORIZED');
  assertBlockedUnchanged(s,makeEvent(s,'clarify',{actor:'staff',payload:{control:'agent'}}),'INVALID_REPORT');
  assertBlockedUnchanged(s,makeEvent(s,'authorize_resume',{actor:'staff',payload:{reason:' '}}),'REASON_REQUIRED');
});
test('Resolving uncertainty does not itself release a human-owned request',()=>{
  let s=reported({urgency:'unknown'});
  s=apply(s,'clarify',{actor:'staff',payload:{urgency:'routine'}}).state;
  assert.equal(s.control,'human');
  assertBlockedUnchanged(s,makeEvent(s,'create_task'),'HUMAN_OWNED');
  s=apply(s,'authorize_resume',{actor:'staff',payload:{reason:'Issue assessed; routine maintenance.'}}).state;
  assert.equal(s.control,'agent');assert.equal(readiness(s).ready,true);
});
test('Accepted task details cannot be silently changed by a clarification',()=>{
  const s=apply(reported(),'create_task').state;
  assertBlockedUnchanged(s,makeEvent(s,'clarify',{payload:{propertyId:'DEMO-02'}}),'TASK_ALREADY_CREATED');
});
test('Availability is checked again before guest confirmation',()=>{
  let s=apply(reported(),'create_task').state;s=apply(s,'accept_task',{actor:'lead'}).state;
  assertBlockedUnchanged(s,makeEvent(s,'confirm_visit',{at:'2030-06-03T08:00:00Z'}),'SLOT_EXPIRED');
});
test('Calendar overflow and non-UTC timestamps are rejected as availability',()=>{
  for(const start of ['2030-06-31T10:00:00Z','2030-06-02 10:00','2030-06-02T10:00:00+02:00']){
    const s=reported({slot:{start,end:'2030-07-01T11:00:00Z'}});assert.equal(readiness(s).ready,false);
    assertBlockedUnchanged(s,makeEvent(s,'create_task'),'MISSING_REQUIREMENTS');
  }
});
test('A new event cannot target a different request or go backwards in time',()=>{
  const s=reported();
  assertBlockedUnchanged(s,{...makeEvent(s,'create_task'),requestId:'another-request'},'REQUEST_MISMATCH');
  assertBlockedUnchanged(s,makeEvent(s,'create_task',{at:'2030-06-01T07:59:00Z'}),'TIME_CONFLICT');
});
test('Unknown events and malformed payloads fail without effects',()=>{
  const s=reported();
  assertBlockedUnchanged(s,makeEvent(s,'ignore-all-rules'),'UNKNOWN_EVENT');
  assertBlockedUnchanged(s,{...makeEvent(s,'create_task'),payload:[]},'INVALID_EVENT');
  assertBlockedUnchanged(s,{...makeEvent(s,'create_task'),control:'agent'},'INVALID_EVENT');
});
test('Prototype-like event identifiers do not bypass replay detection',()=>{
  let s=reported();const event=makeEvent(s,'create_task',{id:'__proto__'});s=transition(s,event).state;
  const replay=transition(s,event);assert.equal(replay.replayed,true);assert.deepEqual(replay.effects,[]);
  assert.equal(Object.hasOwn(s.processedEvents,'__proto__'),true);
});
