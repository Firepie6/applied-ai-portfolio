'use strict';
const steps = [
  ['01 / THE TRIGGER','A guest describes a maintenance problem in the chat. That conversation starts the workflow.'],
  ['02 / CONTEXT BEFORE ACTION','The agent asks follow-up questions and gathers required issue details. Staff-defined rules guide when the request needs human attention.'],
  ['03 / AN ACTIONABLE TASK','The agent asks for the guest’s day and time availability, then creates a scheduled task assigned to the maintenance lead.'],
  ['04 / OPERATIONAL OWNERSHIP','The maintenance lead accepts the task. Guest confirmation follows that acceptance.'],
  ['05 / CLOSE THE LOOP','The agent confirms the appointment to the guest. Another automation asks about the outcome three hours after the appointment.']
];
document.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('[aria-current="step"]')?.removeAttribute('aria-current');
  button.setAttribute('aria-current','step');
  const [label,description]=steps[Number(button.dataset.step)];
  document.getElementById('step-label').textContent=label;
  document.getElementById('step-description').textContent=description;
}));
const cases = {
maintenance:`<span class="case-kicker">HEART MILAN APARTMENTS / AGENT WORKFLOW</span><h2>AI Maintenance Dispatch</h2><p>A guest complaint used to require staff to gather details, exchange messages about availability, create a task and confirm the appointment. I designed a workflow that connects those steps inside the operations platform.</p><h3>What I owned</h3><ul><li>Configured the agent and workflow using the platform’s existing builders.</li><li>Agreed required information and escalation examples with the operational team.</li><li>Tested guest conversations manually and through hundreds of API-driven simulated cases.</li><li>Established staff takeover and manual fallback procedures for exceptions and outages.</li></ul><h3>How it works</h3><p>The agent gathers issue details and guest availability, creates an assigned maintenance task, and confirms the appointment after the maintenance lead accepts. A follow-up message asks about the outcome three hours after the visit.</p><div class="evidence-note"><p><strong>Initial live checkpoint:</strong> 47 requests processed without reported corrective intervention. This is an operational observation, rather than an independently audited reliability measure.</p><p><strong>Early estimate:</strong> approximately 30 minutes per request, based on staff discussion and message timing. The method mixed waiting between messages with assumed writing time, so it is not a measured active-handling baseline or a savings figure.</p></div><h3>What the project taught me</h3><p>Required information, escalation criteria and operational ownership need to be designed with the team. Written agent instructions and workflow-enforced controls provide different levels of assurance; testing needs to account for that distinction.</p>`,
brain:`<span class="case-kicker">PERSONAL PROJECT / KNOWLEDGE INFRASTRUCTURE</span><h2>Brain</h2><p>I built Brain to turn fragmented digital archives into connected context that both I and AI tools can use. The result is approximately 14,000 interconnected Markdown notes, stored locally and accessible through an MCP interface.</p><h3>What I built</h3><ul><li>Knowledge structure and machine-readable conventions for linked notes.</li><li>Python ingestion and distillation pipelines built with AI-assisted development.</li><li>An MCP interface for context retrieval and knowledge-base updates.</li><li>Automation hooks that bring new information back into the archive.</li></ul><h3>Archive scale</h3><p>The source archive spans approximately 177,000 messages across 12 years, more than 1,300 AI conversations and 93,000 photos, alongside email, calendar and other exports.</p><h3>Why Markdown</h3><p>Ordinary files make the knowledge base inspectable and portable. AI tools can use structured context while the underlying material remains directly accessible.</p><div class="evidence-note"><p>These are project-owner-reported archive counts, not retrieval-quality or accuracy benchmarks. The public portfolio contains architecture documentation; personal archives, messages and photographs remain private.</p></div>`,
autoflip:`<span class="case-kicker">PERSONAL PROJECT / MARKET RESEARCH</span><h2>Auto-Flip</h2><p>Vehicle research involves repeated reading, comparison and judgement. I built a nightly pipeline that collects listings from two Italian marketplaces and turns them into a structured shortlist for further assessment.</p><h3>What I built</h3><ul><li>Ingestion and structured listing data using AI-assisted development.</li><li>Evaluation across six scoring dimensions.</li><li>Condition and modification assessment.</li><li>Ownership-cost estimates using reference data and suggested negotiation targets.</li><li>Overnight scheduling and automated tests supporting iteration.</li></ul><h3>The design principle</h3><p>Make the criteria explicit and the output reviewable. Automate repeated research, then preserve human judgement for the purchasing decision.</p><div class="evidence-note"><p>The output is a research shortlist with estimates. The project does not establish realized trading profit, purchase outcomes or predictive accuracy. Any visual listing scores on this site are illustrative.</p></div>`
};
const dialog=document.getElementById('case-dialog');
let opener;
document.querySelectorAll('[data-case]').forEach(button=>button.addEventListener('click',()=>{
  opener=button;
  document.getElementById('case-content').innerHTML=cases[button.dataset.case];
  document.querySelector('#case-content h2').id='case-title';
  dialog.showModal();
  document.getElementById('close-case').focus();
}));
document.getElementById('close-case').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
dialog.addEventListener('close',()=>opener?.focus());

// Decorative local animation only. No user data, network requests or tracking.
const canvas=document.getElementById('network');
const ctx=canvas.getContext('2d');
const motionQuery=matchMedia('(prefers-reduced-motion: reduce)');
let paused=motionQuery.matches, frame, width=0, height=0, tick=0, visible=true;
const nodes=Array.from({length:30},(_,i)=>({angle:i*2.39996,radius:.27+(i%5)*.042,phase:i*.7,size:i%4===0?2:1.1}));
function draw(){
  ctx.clearRect(0,0,width,height);
  const cx=width/2,cy=height/2,scale=Math.min(width,height);
  const points=nodes.map(n=>({x:cx+Math.cos(n.angle+Math.sin(tick*.25+n.phase)*.045)*scale*n.radius,y:cy+Math.sin(n.angle+Math.sin(tick*.22+n.phase)*.045)*scale*n.radius*.83,size:n.size}));
  points.forEach((p,i)=>{
    ctx.strokeStyle='rgba(131,223,207,.075)';ctx.lineWidth=.6;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(p.x,p.y);ctx.stroke();
    points.slice(i+1).forEach(q=>{if(Math.hypot(p.x-q.x,p.y-q.y)<scale*.2){ctx.strokeStyle='rgba(131,223,207,.14)';ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.stroke();}});
    ctx.fillStyle=i%4===0?'rgba(195,245,105,.85)':'rgba(131,223,207,.6)';ctx.beginPath();ctx.arc(p.x,p.y,p.size,0,Math.PI*2);ctx.fill();
    if(!paused&&i%5===0){const t=(tick*.12+i*.13)%1;ctx.fillStyle='rgba(195,245,105,.7)';ctx.beginPath();ctx.arc(p.x+(cx-p.x)*t,p.y+(cy-p.y)*t,1.4,0,Math.PI*2);ctx.fill();}
  });
}
function loop(){tick+=.016;draw();if(!paused&&visible&&!document.hidden)frame=requestAnimationFrame(loop);}
function syncMotion(){cancelAnimationFrame(frame);document.documentElement.classList.toggle('motion-paused',paused);document.getElementById('motion-toggle').textContent=paused?'Enable motion':'Pause motion';document.getElementById('motion-toggle').setAttribute('aria-pressed',String(paused));if(!paused&&visible&&!document.hidden)loop();else draw();}
new ResizeObserver(entries=>{const r=entries[0].contentRect;const dpr=Math.min(devicePixelRatio||1,2);width=r.width;height=r.height;canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);draw();}).observe(canvas);
new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;syncMotion();}).observe(canvas);
document.addEventListener('visibilitychange',syncMotion);
motionQuery.addEventListener('change',event=>{paused=event.matches;syncMotion();});
document.getElementById('motion-toggle').addEventListener('click',()=>{paused=!paused;syncMotion();});
syncMotion();
