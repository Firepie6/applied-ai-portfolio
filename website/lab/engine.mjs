/**
 * Maintenance Workflow Lab — portfolio reference implementation.
 * Synthetic structured inputs, deterministic policy, no LLM and no external calls.
 * This is not HMA's production implementation or a production safety guarantee.
 */
export class WorkflowError extends Error {
  constructor(code, message) { super(message); this.name = 'WorkflowError'; this.code = code; }
}
const fail = (code, message) => { throw new WorkflowError(code, message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const roles = new Set(['agent', 'staff', 'maintenance_lead']);
const validTime = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) return false;
  const normalized=new Date(value).toISOString();
  return value===normalized || value===normalized.replace('.000Z','Z');
};
const clone = value => structuredClone(value);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export const demoCatalog = Object.freeze({
  'DEMO-01': Object.freeze({name: 'Demo property one', leadId: 'lead-one'}),
  'DEMO-02': Object.freeze({name: 'Demo property two', leadId: 'lead-two'})
});

export function createRequest(id) {
  if (!nonempty(id)) fail('INVALID_REQUEST', 'A request identifier is required.');
  return {id, revision: 0, status: 'collecting', control: 'agent', report: null, task: null,
    lastEventAt: null, audit: [], processedEvents: {}};
}

function actorIs(event, ...allowedRoles) {
  if (!allowedRoles.includes(event.actor.role)) fail('NOT_AUTHORIZED', `This action requires ${allowedRoles.join(' or ')} authority.`);
}
function agentOwns(state) {
  if (state.control !== 'agent') fail('HUMAN_OWNED', 'Staff owns this request. An explicit staff authorization is required to resume automation.');
}
function ensureCollecting(state) {
  if (state.task) fail('TASK_ALREADY_CREATED', 'A task already exists. Material changes need a separately designed replanning flow.');
}
function validateReport(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) fail('INVALID_REPORT', 'The report must be structured data.');
  const permitted = ['propertyId','issue','urgency','slot'];
  if (Object.keys(report).some(key => !permitted.includes(key))) fail('INVALID_REPORT', 'The report contains unsupported fields.');
  if (report.propertyId !== null && !nonempty(report.propertyId)) fail('INVALID_REPORT', 'Property must be a non-empty ID or null.');
  if (typeof report.issue !== 'string') fail('INVALID_REPORT', 'Issue must be text.');
  if (!['routine','urgent','unknown'].includes(report.urgency)) fail('INVALID_REPORT', 'Urgency must be routine, urgent or unknown.');
  if (report.slot !== null && (typeof report.slot !== 'object' || Array.isArray(report.slot))) fail('INVALID_REPORT', 'Availability must be a structured slot or null.');
  if (report.slot !== null && Object.keys(report.slot).some(key=>!['start','end'].includes(key))) fail('INVALID_REPORT', 'Availability supports start and end only.');
}
function slotValid(slot, at) {
  return slot && validTime(slot.start) && validTime(slot.end) &&
    Date.parse(slot.start) > Date.parse(at) && Date.parse(slot.end) > Date.parse(slot.start);
}
function routeToStaff(state, catalog, effects) {
  const r = state.report;
  const reasons = [];
  if (r.urgency === 'urgent') reasons.push('urgent');
  if (r.urgency === 'unknown') reasons.push('urgency_unknown');
  if (r.propertyId && !Object.hasOwn(catalog, r.propertyId)) reasons.push('unknown_property');
  if (reasons.length) {
    state.control = 'human';
    state.status = 'needs_staff';
    effects.push({type:'staff_review', key:`${state.id}:review:${state.revision + 1}`, reasons});
  }
}
export function readiness(state, catalog = demoCatalog, at = '2030-06-01T08:00:00Z') {
  const missing = [];
  const r = state.report;
  if (!r) return {ready:false, missing:['report']};
  if (!r.propertyId || !Object.hasOwn(catalog, r.propertyId)) missing.push('known_property');
  if (!nonempty(r.issue)) missing.push('issue_details');
  if (r.urgency !== 'routine') missing.push('routine_urgency');
  if (!slotValid(r.slot, at)) missing.push('future_availability');
  if (state.control !== 'agent') missing.push('staff_authorization');
  if (state.task) missing.push('task_already_exists');
  return {ready:missing.length === 0, missing};
}

/**
 * Pure transition: returns a new state and effect INTENTS. Never executes effects.
 * expectedRevision models optimistic concurrency. Actor identity is trusted input
 * in this demo; a production adapter must authenticate it server-side.
 */
export function transition(original, event, catalog = demoCatalog) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) fail('INVALID_EVENT', 'Event must be an object.');
  const eventFields = ['id','requestId','type','actor','at','expectedRevision','payload'];
  if (Object.keys(event).some(key => !eventFields.includes(key))) fail('INVALID_EVENT', 'Unsupported event fields.');
  if (!nonempty(event.id) || !nonempty(event.type)) fail('INVALID_EVENT', 'Event ID and type are required.');
  if (event.requestId !== original.id) fail('REQUEST_MISMATCH', 'This event belongs to a different request.');
  if (!event.actor || !roles.has(event.actor.role) || !nonempty(event.actor.id)) fail('INVALID_ACTOR', 'Actor role and ID are required.');
  if (!validTime(event.at)) fail('INVALID_TIME', 'Event time must be an ISO UTC timestamp.');
  if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) fail('INVALID_EVENT', 'Payload must be an object.');
  const fingerprint = canonical(event);
  if (Object.hasOwn(original.processedEvents, event.id)) {
    if (original.processedEvents[event.id] !== fingerprint) fail('EVENT_ID_CONFLICT', 'An event ID cannot be reused for a different event.');
    return {state:clone(original), effects:[], replayed:true};
  }
  if (!Number.isInteger(event.expectedRevision) || event.expectedRevision !== original.revision) fail('REVISION_CONFLICT', 'State changed. Reload before applying a new event.');
  if (original.lastEventAt && Date.parse(event.at) < Date.parse(original.lastEventAt)) fail('TIME_CONFLICT', 'New events cannot precede the last accepted event.');
  const state = clone(original);
  const effects = [];
  const p = event.payload;
  switch (event.type) {
    case 'report': {
      actorIs(event, 'agent', 'staff');
      if (state.report) fail('REPORT_EXISTS', 'A report already exists. Use a clarification event.');
      const r = {propertyId:p.propertyId ?? null, issue:p.issue ?? '', urgency:p.urgency ?? 'unknown', slot:p.slot ?? null};
      if (Object.keys(p).some(key => !['propertyId','issue','urgency','slot'].includes(key))) fail('INVALID_REPORT', 'Unsupported report field.');
      validateReport(r);
      state.report = clone(r);
      routeToStaff(state, catalog, effects);
      break;
    }
    case 'clarify': {
      actorIs(event, 'agent', 'staff');
      if (event.actor.role === 'agent') agentOwns(state);
      ensureCollecting(state);
      if (!state.report) fail('REPORT_REQUIRED', 'A report must exist before clarification.');
      if (!Object.keys(p).length || Object.keys(p).some(key => !['propertyId','issue','urgency','slot'].includes(key))) fail('INVALID_REPORT', 'Clarification can update report fields only.');
      const next = {...state.report, ...p};
      validateReport(next);
      state.report = clone(next);
      routeToStaff(state, catalog, effects);
      break;
    }
    case 'create_task': {
      actorIs(event, 'agent'); agentOwns(state); ensureCollecting(state);
      const ready = readiness(state, catalog, event.at);
      if (!ready.ready) fail('MISSING_REQUIREMENTS', `Cannot create task: ${ready.missing.join(', ')}.`);
      if (Object.keys(p).length) fail('UNSUPPORTED_PAYLOAD', 'Task fields come from validated request data.');
      state.task = {id:`${state.id}:task`, propertyId:state.report.propertyId,
        leadId:catalog[state.report.propertyId].leadId, issue:state.report.issue,
        slot:clone(state.report.slot), acceptedBy:null, confirmed:false};
      state.status = 'awaiting_acceptance';
      effects.push({type:'create_task', key:state.task.id, task:clone(state.task)});
      break;
    }
    case 'accept_task': {
      actorIs(event, 'maintenance_lead');
      if (!state.task || state.status !== 'awaiting_acceptance') fail('TASK_NOT_PENDING', 'There is no task awaiting acceptance.');
      if (event.actor.id !== state.task.leadId) fail('WRONG_ASSIGNEE', 'Only the assigned maintenance lead can accept.');
      if (Object.keys(p).length) fail('UNSUPPORTED_PAYLOAD', 'Acceptance needs no payload.');
      state.task.acceptedBy = event.actor.id;
      state.status = 'accepted';
      break;
    }
    case 'confirm_visit': {
      actorIs(event, 'agent'); agentOwns(state);
      if (!state.task?.acceptedBy || state.status !== 'accepted') fail('TASK_NOT_ACCEPTED', 'Confirm only after the assigned lead accepts.');
      if (Object.keys(p).length) fail('UNSUPPORTED_PAYLOAD', 'Confirmation is derived from the accepted task.');
      if (!slotValid(state.task.slot, event.at)) fail('SLOT_EXPIRED', 'Appointment availability has expired. Staff must replan.');
      state.task.confirmed = true;
      state.status = 'confirmed';
      effects.push({type:'guest_confirmation', key:`${state.task.id}:confirmation`, propertyId:state.task.propertyId, slot:clone(state.task.slot)});
      break;
    }
    case 'takeover': {
      actorIs(event, 'staff');
      if (!nonempty(p.reason) || Object.keys(p).some(key => key !== 'reason')) fail('REASON_REQUIRED', 'A staff takeover needs a reason.');
      state.control = 'human';
      break;
    }
    case 'authorize_resume': {
      actorIs(event, 'staff');
      if (state.control !== 'human') fail('NOT_PAUSED', 'Automation is not waiting for staff authorization.');
      if (!nonempty(p.reason) || Object.keys(p).some(key => key !== 'reason')) fail('REASON_REQUIRED', 'Resumption needs an explicit staff reason.');
      // Authorization cannot override unresolved urgency or property uncertainty.
      if (!state.report || state.report.urgency !== 'routine' || !Object.hasOwn(catalog, state.report.propertyId)) fail('UNRESOLVED_REVIEW', 'Resolve urgency and property before authorizing automation.');
      state.control = 'agent';
      if (state.status === 'needs_staff') state.status = 'collecting';
      break;
    }
    default: fail('UNKNOWN_EVENT', `Unknown action: ${event.type}.`);
  }
  state.revision += 1;
  state.lastEventAt = event.at;
  Object.defineProperty(state.processedEvents,event.id,{value:fingerprint,enumerable:true,writable:true,configurable:true});
  state.audit.push({id:event.id, type:event.type, actor:clone(event.actor), at:event.at,
    revision:state.revision, status:state.status, control:state.control, effects:effects.map(e=>e.type)});
  return {state, effects, replayed:false};
}
