import {createRequest, transition, demoCatalog} from './engine.mjs';

export const actors = Object.freeze({
  agent: {id:'agent-demo',role:'agent'}, staff:{id:'staff-demo',role:'staff'},
  lead:{id:'lead-one',role:'maintenance_lead'}, wrongLead:{id:'lead-two',role:'maintenance_lead'}
});
export const fixtureTime = '2030-06-01T08:00:00Z';
export const validReport = Object.freeze({propertyId:'DEMO-01', issue:'The bedroom blind will not close.',
  urgency:'routine', slot:{start:'2030-06-02T10:00:00Z',end:'2030-06-02T11:00:00Z'}});
const report = (patch={}) => ({type:'report',label:'Receive structured report',payload:{...validReport,...patch}});
const create = () => ({type:'create_task',label:'Create assigned task'});
const accept = () => ({type:'accept_task',actor:'lead',label:'Assigned lead accepts'});
const confirm = () => ({type:'confirm_visit',label:'Confirm guest appointment'});
export const scenarios = [
  {id:'routine',name:'A routine request',category:'Normal flow',message:'The bedroom blind will not close. Tomorrow between 10 and 11 works for us.',
    question:'Can a complete routine request reach confirmation after the assigned lead accepts?',
    steps:[report(),create(),accept(),confirm()],expected:{status:'confirmed',control:'agent',create_task:1,guest_confirmation:1,staff_review:0}},
  {id:'missing',name:'Missing information',category:'Required inputs',message:'Something is broken in the apartment. Can someone come?',
    question:'Does task creation wait for issue details and future availability?',
    steps:[report({issue:'',slot:null}),{...create(),error:'MISSING_REQUIREMENTS'},
      {type:'clarify',label:'Collect missing details and availability',payload:{issue:validReport.issue,slot:validReport.slot}},create(),accept(),confirm()],
    expected:{status:'confirmed',control:'agent',create_task:1,guest_confirmation:1,staff_review:0}},
  {id:'urgent',name:'An urgent issue',category:'Escalation',message:'Water is coming through the ceiling near a light fitting.',
    question:'Does an explicitly urgent classification route to staff and resist a premature restart?',
    steps:[report({issue:'Water near a light fitting.',urgency:'urgent'}),{...create(),error:'HUMAN_OWNED'},
      {type:'authorize_resume',actor:'staff',label:'Try resuming with unresolved urgency',payload:{reason:'Attempted early restart'},error:'UNRESOLVED_REVIEW'}],
    expected:{status:'needs_staff',control:'human',create_task:0,guest_confirmation:0,staff_review:1}},
  {id:'uncertain',name:'Uncertain urgency',category:'Escalation',message:'There is a strange smell. I cannot tell what it is.',
    question:'Does an unknown classification require staff review instead of being treated as routine?',
    steps:[report({issue:'Unidentified smell.',urgency:'unknown'}),{...create(),error:'HUMAN_OWNED'}],
    expected:{status:'needs_staff',control:'human',create_task:0,guest_confirmation:0,staff_review:1}},
  {id:'property',name:'An unknown property',category:'Routing',message:'We are in the other building. I do not know the apartment number.',
    question:'Can staff resolve property uncertainty without silently restarting automation?',
    steps:[report({propertyId:'DEMO-UNKNOWN'}),{...create(),error:'HUMAN_OWNED'},
      {type:'clarify',actor:'staff',label:'Staff resolves the property',payload:{propertyId:'DEMO-01'}},
      {...create(),error:'HUMAN_OWNED'},
      {type:'authorize_resume',actor:'staff',label:'Staff explicitly authorizes resumption',payload:{reason:'Property verified; routine request.'}},create(),accept(),confirm()],
    expected:{status:'confirmed',control:'agent',create_task:1,guest_confirmation:1,staff_review:1}},
  {id:'handoff',name:'A human takeover',category:'Ownership',message:'I would like someone from the team to handle this.',
    question:'Can the agent regain control merely by requesting it?',
    steps:[report(),create(),{type:'takeover',actor:'staff',label:'Staff takes ownership',payload:{reason:'Guest requests staff assistance.'}},
      {...confirm(),error:'HUMAN_OWNED'},
      {type:'authorize_resume',label:'Agent tries to authorize itself',payload:{reason:'Continue automatically.'},error:'NOT_AUTHORIZED'},
      accept(),{type:'authorize_resume',actor:'staff',label:'Staff completes the handoff',payload:{reason:'Guest agrees; task and availability verified.'}},confirm()],
    expected:{status:'confirmed',control:'agent',create_task:1,guest_confirmation:1,staff_review:0}},
  {id:'assignee',name:'The wrong assignee',category:'Routing',message:'Please arrange the visit with the right maintenance team.',
    question:'Does acceptance from a different lead fail before guest confirmation?',
    steps:[report(),create(),{...accept(),actor:'wrongLead',label:'A different lead attempts acceptance',error:'WRONG_ASSIGNEE'},
      {...confirm(),error:'TASK_NOT_ACCEPTED'},accept(),confirm()],
    expected:{status:'confirmed',control:'agent',create_task:1,guest_confirmation:1,staff_review:0}},
  {id:'retry',name:'A duplicated event',category:'Idempotency',message:'The platform retries the same task and confirmation events.',
    question:'Do identical event retries avoid duplicate task and confirmation intents?',
    steps:[report(),create(),{retryOf:1,label:'Retry the identical task event',replayed:true},accept(),confirm(),
      {retryOf:4,label:'Retry the identical confirmation event',replayed:true}],
    expected:{status:'confirmed',control:'agent',create_task:1,guest_confirmation:1,staff_review:0}},
  {id:'order',name:'Confirmation too early',category:'Ordering',message:'Can you confirm a time before anyone accepts the task?',
    question:'Is confirmation blocked until task creation and lead acceptance occur in order?',
    steps:[report(),{...confirm(),error:'TASK_NOT_ACCEPTED'},{...accept(),error:'TASK_NOT_PENDING'},create(),accept(),confirm()],
    expected:{status:'confirmed',control:'agent',create_task:1,guest_confirmation:1,staff_review:0}},
  {id:'availability',name:'Expired availability',category:'Required inputs',message:'The guest originally suggested a time that has already passed.',
    question:'Does an expired slot prevent task creation until new availability is supplied?',
    steps:[report({slot:{start:'2030-06-01T06:00:00Z',end:'2030-06-01T07:00:00Z'}}),{...create(),error:'MISSING_REQUIREMENTS'},
      {type:'clarify',label:'Collect fresh availability',payload:{slot:validReport.slot}},create(),accept(),confirm()],
    expected:{status:'confirmed',control:'agent',create_task:1,guest_confirmation:1,staff_review:0}},
  {id:'stale',name:'A stale update',category:'Concurrency',message:'Two workers try to act from different copies of the request.',
    question:'Does a stale revision fail without changing the state?',
    steps:[report(),{...create(),revision:0,label:'Task creation from an outdated revision',error:'REVISION_CONFLICT'},create(),accept(),confirm()],
    expected:{status:'confirmed',control:'agent',create_task:1,guest_confirmation:1,staff_review:0}},
  {id:'conflict',name:'A conflicting retry',category:'Idempotency',message:'The same event ID is reused with different data.',
    question:'Does conflicting event reuse fail instead of overwriting the accepted action?',
    steps:[report(),create(),{retryOf:1,override:{payload:{propertyId:'DEMO-02'}},label:'Reuse the event ID with altered data',error:'EVENT_ID_CONFLICT'}],
    expected:{status:'awaiting_acceptance',control:'agent',create_task:1,guest_confirmation:0,staff_review:0}}
];

export function makeEvent(state, type, options={}) {
  return {id:options.id ?? `${state.id}:event:${state.revision + 1}`, requestId:state.id, type,
    actor:structuredClone(actors[options.actor ?? 'agent']), at:options.at ?? fixtureTime,
    expectedRevision:options.revision ?? state.revision, payload:structuredClone(options.payload ?? {})};
}
export function runScenario(scenario) {
  let state=createRequest(`demo:${scenario.id}`);
  const records=[],events=[],allEffects=[];
  scenario.steps.forEach((step,index)=>{
    let event;
    if (step.retryOf !== undefined) event={...structuredClone(events[step.retryOf]),...structuredClone(step.override ?? {})};
    else event=makeEvent(state,step.type,{id:`${state.id}:step:${index}`,actor:step.actor,payload:step.payload,
      revision:step.revision,at:new Date(Date.parse(fixtureTime)+index*60000).toISOString()});
    events.push(event);
    try {
      const result=transition(state,event,demoCatalog);
      state=result.state;
      allEffects.push(...result.effects);
      const check=!step.error && Boolean(step.replayed)===result.replayed;
      records.push({label:step.label,action:event.type,outcome:result.replayed?'replayed':'applied',check,
        revision:state.revision,status:state.status,control:state.control,effects:result.effects,expectedError:step.error ?? null,snapshot:structuredClone(state)});
    } catch(error) {
      if (!error.code) throw error;
      records.push({label:step.label,action:event.type,outcome:'blocked',check:error.code===step.error,
        errorCode:error.code,errorMessage:error.message,revision:state.revision,status:state.status,control:state.control,effects:[],expectedError:step.error ?? null,snapshot:structuredClone(state)});
    }
  });
  const counts={create_task:0,guest_confirmation:0,staff_review:0};
  allEffects.forEach(e=>counts[e.type]++);
  const finalMatches=state.status===scenario.expected.status && state.control===scenario.expected.control &&
    Object.entries(counts).every(([key,value])=>value===scenario.expected[key]);
  return {id:scenario.id,passed:records.every(r=>r.check)&&finalMatches,finalMatches,state,records,effects:allEffects,counts};
}
