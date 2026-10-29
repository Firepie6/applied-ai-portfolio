import {createRequest} from './engine.mjs';
import {scenarios,runScenario} from './scenarios.mjs';
const $=id=>document.getElementById(id);
const labels={collecting:'Collecting',needs_staff:'Needs staff',awaiting_acceptance:'Awaiting lead',accepted:'Accepted',confirmed:'Confirmed'};
let active=scenarios[0],result=runScenario(active),cursor=0;
const select=$('scenario');
for(const s of scenarios){const option=document.createElement('option');option.value=s.id;option.textContent=s.name;select.append(option);}
function text(tag,value,className){const el=document.createElement(tag);el.textContent=value;if(className)el.className=className;return el;}
function visibleState(){return cursor?result.records[cursor-1].snapshot:createRequest(`demo:${active.id}`);}
function render(){
  const state=visibleState();
  $('category').textContent=active.category.toUpperCase();$('scenario-title').textContent=active.name;
  $('question').textContent=active.question;$('guest-message').textContent=active.message;
  $('input-json').textContent=JSON.stringify(active.steps[0].payload,null,2);
  $('step-count').textContent=`${cursor} / ${result.records.length} EVENTS`;
  $('control').textContent=state.control==='human'?'Staff':'Agent';$('control').dataset.control=state.control;
  $('status').textContent=labels[state.status]??state.status;$('revision').textContent=state.revision;
  const effects=result.records.slice(0,cursor).flatMap(r=>r.effects);
  $('task-count').textContent=effects.filter(e=>e.type==='create_task').length;
  $('confirmation-count').textContent=effects.filter(e=>e.type==='guest_confirmation').length;
  $('review-count').textContent=effects.filter(e=>e.type==='staff_review').length;
  const {processedEvents,audit,...publicState}=state;
  $('state-json').textContent=JSON.stringify(publicState,null,2);
  $('empty-trace').hidden=cursor>0;
  const trace=$('trace');trace.replaceChildren();
  result.records.slice(0,cursor).forEach((record,index)=>{
    const row=document.createElement('li');row.className=`trace-row ${record.outcome} ${record.check?'':'failed'}`;
    const head=document.createElement('header');head.append(text('span',String(index+1).padStart(2,'0'),'trace-number'));
    const outcome=record.outcome==='blocked'?'BLOCKED AS EXPECTED':record.outcome==='replayed'?'REPLAY / NO NEW EFFECT':'APPLIED';
    head.append(text('span',record.check?outcome:'UNEXPECTED RESULT','outcome'));row.append(head,text('h3',record.label));
    if(record.errorCode){row.append(text('span',record.errorCode,'rule-code'),text('p',record.errorMessage));}
    if(record.outcome==='replayed')row.append(text('p','This identical event was already accepted. The state is preserved and no new effect intent is emitted.'));
    for(const effect of record.effects)row.append(text('span',`INTENT → ${effect.type}`,'effect-tag'));
    const meta=document.createElement('div');meta.className='trace-meta';
    meta.append(text('span',`REV ${record.revision}`),text('span',labels[record.status]??record.status),text('span',record.control==='human'?'STAFF OWNS REQUEST':'AGENT OWNS REQUEST'));row.append(meta);trace.append(row);
  });
  const done=cursor===result.records.length;const box=$('scenario-result');box.hidden=!done;
  box.className=`scenario-result ${result.passed?'':'failed'}`;
  box.textContent=result.passed?'Expected policy outcome verified for this synthetic scenario.':'This scenario did not match its expected policy outcome.';
  $('step').disabled=done;$('run').disabled=done;$('reset').disabled=cursor===0;$('download').disabled=!done;
}
select.addEventListener('change',()=>{active=scenarios.find(s=>s.id===select.value);result=runScenario(active);cursor=0;render();});
$('run').addEventListener('click',()=>{cursor=result.records.length;render();});
$('step').addEventListener('click',()=>{cursor=Math.min(cursor+1,result.records.length);render();});
$('reset').addEventListener('click',()=>{cursor=0;render();});
$('download').addEventListener('click',()=>{
  const payload={kind:'synthetic_reference_workflow_trace',scenario:active.name,classification:'Supplied fixture, not model output',passed:result.passed,expected:active.expected,
    records:result.records.map(({snapshot,...record})=>record),finalState:visibleState(),productionReliabilityClaim:false};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`workflow-trace-${active.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('run-suite').addEventListener('click',()=>{
  const results=scenarios.map(runScenario),passed=results.filter(r=>r.passed).length;
  $('suite-summary').textContent=`${passed} / ${results.length} synthetic scenarios match their expected outcomes. This is a policy-fixture result, not a live reliability estimate.`;
  const list=$('suite-results');list.replaceChildren();
  results.forEach((r,index)=>{const card=document.createElement('article');card.className=`suite-case ${r.passed?'':'failed'}`;
    card.append(text('span',r.passed?'PASS / EXPECTED OUTCOME':'FAIL / INVESTIGATE'),text('h3',scenarios[index].name),
      text('p',`${r.records.length} events · ${r.records.filter(e=>e.outcome==='blocked').length} blocked as designed`));list.append(card);});
});
render();
