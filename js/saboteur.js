/* THE CURRICULUM SABOTEUR (social deduction): host board + student device.
   Plugs into js/waka.js through window.ET (shared PeerJS room, join, lobby, avatars, sounds), same as the Auction.
   The host is the single source of truth. Roles go ONLY to the owning device. The correct answer is ONLY ever sent inside sb_rev.

   host -> student
     sb_intro {th}                                      upbeat safeguard screen
     sb_role  {role,th,show,ready,ej,acc,mates,n,pts}   secret role (mates = fellow saboteurs, saboteurs only)
     sb_q     {i,n,q,strand,opts,left,ans,cf}           question + this student's shuffled options
     sb_rev   {ok,correct,exp,total,streak,acc,pass,secDone,secFailed,strand,timedOut,out}
     sb_hold  {msg}      sb_time {left}
     sb_meet  {n,left,prompts,vote,ej}                  emergency meeting: debate
     sb_vote_open {n,left,cands:[{k,name,av}],done}     k is a public key, never the player's rejoin id
     sb_vwait {}         sb_vres {rows,skip,sus,ej,you,role,bonus,eject}
     sb_end   {w,why,role,ej,acc,pts,th,sabs}
   student -> host
     sb_ready {}   sb_ans {i,v}   sb_conf {i,c}   sb_vote {k}   (k = a candidate key or 'skip')

   Phases: lobby -> intro -> roles -> q -> rev -> (debate -> vote -> vres) -> q ... -> end
   Per-answer log row: {playerId,name,avatarId,qIndex,strand,difficulty,chosen,correct,timeMs,confidence,wager,role,
     powerUpUsed,timedOut,ejected,accused,sabotage,points,classAccuracy}. role is 'builder' or 'saboteur'.
   Saboteur rows are logged but MUST be excluded from mastery. Option distribution per question: G.dist[i].counts */
(()=>{
const {E,av,SH,SYM,LET,beep,good,bad,sv}=ET;
const g=()=>ET.G(),P=()=>Object.values(g().p),ACT=()=>P().filter(p=>p.on);
const send=(p,m)=>{const c=g().c[p.id];if(c&&p.on){try{c.send(m)}catch(e){}}};
const left=()=>{const G=g();return G.endAt?Math.max(0,G.endAt-Date.now()):0};
const EVERY=3,MEET=60e3,VOTE=30e3,RING=326.7;
const TH={saboteur:{title:'The Curriculum Saboteur',sab:'Saboteur',sabs:'Saboteurs',ic:'🕵️'},gremlin:{title:'The Curriculum Gremlins',sab:'Gremlin',sabs:'Gremlins',ic:'👾'}};
const PROMPTS=['Which strand surprised you?','Who is suspiciously wrong on easy questions?','Which answer did you expect more people to get right?','What would you say to someone who is wrong a lot but seems very sure?','Who has been answering oddly? Give a reason, and be kind.','Which strand do we most need to rescue?'];
const WHY=w=>({done:'The project was finished!',caught:`Every ${w.sab.toLowerCase()} was caught!`,project:'Too many sections failed.',outnumber:`The ${w.sabs.toLowerCase()} outnumbered the builders.`,teacher:'Your teacher ended the game.'});
const SAFE=w=>`${w.sabs} are part of the game. Being one doesn't mean you're mean, and being accused doesn't mean you did something wrong.`;
let CN=0,BC=0;

/* ================= HOST ================= */
const panel=(bar,inner)=>`<div class="panel" style="margin:0 0 24px"><div class="bar">${bar}</div><div class="in">${inner}</div></div>`;
const ctl=x=>`<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px">${x}<button class="btn" style="background:var(--paper)" onclick="SB.stop()">End game</button></div>`;
const W=()=>TH[g().sb.theme];

/* every player object gets the engine's fields once. pub is a public key used in vote lists (never the rejoin id) */
function ensure(p){if(!p.pub)p.pub='c'+(++CN);if(p.pts==null)Object.assign(p,{role:null,pts:0,ej:false,acc:false,ready:false,a:null,rev:null,cf:null,vk:null,streak:0})}

function start(){const G=g();
 if(ACT().length<3){const m=$('#lmsg');m.className='msg bad';m.textContent='The Saboteur needs at least 3 students. Wait for more to join, or add practice bots.';return}
 const sb=G.sb={theme:$('#sbth').value,struct:$('#sbst').value,vote:$('#sbvo').value==='on',eject:$('#sbej').value==='on',mi:0,fresh:null,secs:[],qs:[],win:null,why:'',nSab:0,vr:null,cand:[],pr:[],roof:0};
 Q.forEach((q,i)=>{let k=sb.secs.findIndex(s=>s.name===q.strand);if(k<0){k=sb.secs.length;sb.secs.push({name:q.strand,total:0,asked:0,accSum:0,pieces:[],done:false,failed:false,avg:null})}sb.secs[k].total++;sb.qs[i]=k});
 clearInterval(G.tm);clearTimeout(G.rv);clearTimeout(G.vt);G.vt=0;G.vfn=null;
 G.i=-1;G.log=[];G.dist=[];G.meet=[];G.allAt=0;
 P().forEach(p=>{p.pts=null;ensure(p)});
 G.phase='intro';ACT().forEach(p=>send(p,{t:'sb_intro',th:sb.theme}));
 go('play');$('#pv').innerHTML='<div class="sb-board"><div id="sbtop"></div><div id="sbmain"></div></div>';top();renderIntro();beep(300,.1,'square')}

/* ---- the build tracker: one section per strand, one brick per question ---- */
function svg(){const G=g(),sb=G.sb,S=sb.secs.length,st=sb.struct==='station',
 sw=Math.max(34,Math.min(120,Math.floor(840/S)-10)),gap=10,tw=S*sw+(S-1)*gap,x0=(1000-tw)/2,y0=st?72:98,h=110,H=y0+h+56,
 tot=Q.length,done=sb.secs.reduce((n,s)=>n+s.pieces.filter(x=>x==='ok').length,0),pr=tot?done/tot:0,prev=sb.roof;sb.roof=pr;
 const fr=sb.fresh;sb.fresh=null;let back='',front='';
 const roofD=st?`M500 ${y0} L500 24`:`M${x0-34} ${y0} L500 22 L${x0+tw+34} ${y0}`,
  roof=`<path class="sb-guide" d="${roofD}"/><path class="sb-roof" d="${roofD}" pathLength="100" style="stroke-dashoffset:${(100-pr*100).toFixed(1)};--from:${(100-prev*100).toFixed(1)}"/>${st?`<circle cx="500" cy="20" r="9" class="sb-dot ${pr>=1?'on':''}"/>`:''}`;
 if(st){const cy=y0+h/2;back=`<line x1="${x0-56}" y1="${cy}" x2="${x0+tw+56}" y2="${cy}" stroke="#1a1a1a" stroke-width="10"/>`+[-1,1].map(d=>{const px=d<0?x0-130:x0+tw+56;return `<rect x="${px}" y="${cy-34}" width="74" height="68" fill="#fff" stroke="#1a1a1a" stroke-width="3"/><path d="M${px+25} ${cy-34}v68M${px+49} ${cy-34}v68M${px} ${cy}h74" stroke="#1a1a1a" stroke-width="2" fill="none"/>`}).join('')}
 else back=`<rect x="${x0-24}" y="${y0+h}" width="${tw+48}" height="14" fill="#fff" stroke="#1a1a1a" stroke-width="3"/>`;
 sb.secs.forEach((s,k)=>{const x=x0+k*(sw+gap),bh=(h-6)/s.total;
  front+=`<rect class="sb-sec ${s.failed?'fail':s.done?'done':''}" x="${x}" y="${y0}" width="${sw}" height="${h}" rx="${st?16:0}"/>`;
  for(let j=0;j<s.total;j++){const y=y0+h-3-(j+1)*bh,state=s.pieces[j]||'pend',f=fr&&fr.s===k&&fr.k===j?' fresh':'';
   front+=`<rect class="sb-b ${state}${f}" x="${x+4}" y="${(y+1.5).toFixed(1)}" width="${sw-8}" height="${Math.max(2,bh-3).toFixed(1)}" pathLength="100"/>`;
   if(state==='no'){const a=x+4,b=y+1.5,w=sw-8,hh=Math.max(2,bh-3);front+=`<polyline class="sb-crack" points="${a+w*.15},${b} ${a+w*.4},${b+hh*.5} ${a+w*.3},${b+hh*.6} ${a+w*.6},${b+hh}"/><polygon class="sb-hole" points="${a+w},${b} ${a+w-w*.22},${b} ${a+w},${b+hh*.4}"/>`}}
  const cx=x+sw/2,cy=y0+h+(st?34:36);
  front+=`<g><rect class="sb-pill ${s.failed?'fail':s.done?'done':''}" x="${cx-24}" y="${cy-13}" width="48" height="26" rx="13"/><text class="sb-pt" x="${cx}" y="${cy}">${k+1}${s.done?(s.failed?'✖':'✔'):''}</text></g>`});
 return `<svg class="sb-svg" viewBox="0 0 1000 ${H}" role="img" aria-label="Build tracker: ${sb.secs.filter(s=>s.done&&!s.failed).length} of ${S} sections built, ${sb.secs.filter(s=>s.failed).length} failed.">${back}${roof}${front}</svg>`}

function top(){const el=$('#sbtop');if(!el)return;const G=g(),sb=G.sb,w=W(),
 built=sb.secs.filter(s=>s.done&&!s.failed).length,fail=sb.secs.filter(s=>s.failed).length,hid=P().filter(p=>p.role==='saboteur'&&!p.ej).length,dealt=!['intro'].includes(G.phase);
 el.innerHTML=`<div class="panel sb-bp" style="margin:0 0 24px"><div class="bar">${w.title} · ${sb.struct==='station'?'Building the space station':'Building the wharenui'}</div><div class="in">${svg()}
 <div class="players" style="align-items:center"><span class="chip">✔ Built ${built} of ${sb.secs.length}</span><span class="chip" style="background:var(--pink)">✖ Failed ${fail}</span>${dealt?`<span class="chip" style="background:var(--paper)">${w.ic} ${hid} ${hid===1?w.sab:w.sabs} still hiding</span>`:''}</div>
 <ol class="sb-leg" aria-label="Sections">${sb.secs.map((s,k)=>`<li><i>${k+1}</i><span><b>${E(s.name)}</b><br><small>${s.pieces.map(x=>x==='ok'?'✔':'✖').join('')}${'·'.repeat(s.total-s.asked)} ${s.failed?'FAILED':s.done?'BUILT':'in progress'}</small></span></li>`).join('')}</ol></div></div>`}

function renderIntro(){const sb=g().sb,w=W();
 $('#sbmain').innerHTML=panel(`${w.title} · Before we start`,`<div class="big" style="font-size:clamp(24px,3.2vw,40px)">${SAFE(w)}</div>
  <ul class="sb-how"><li><b>Builders</b> answer honestly to build the structure together.</li><li><b>${w.sabs}</b> are secret. They pick wrong answers on purpose, but they still have to answer.</li>
  <li>Every ${EVERY} questions: an <b>emergency meeting</b>. Talk it out${sb.vote?', then vote by tapping a name':''}.</li><li>No accusing out loud outside meetings. Be kind. It's a game!</li></ul>
  <p class="msg bad" id="sbwarn" role="status"></p>${ctl('<button class="btn k" onclick="SB.deal()">Deal the roles</button>')}`)}

function deal(){const G=g(),sb=G.sb;if(G.phase!=='intro')return;const ps=ACT();
 if(ps.length<3){$('#sbwarn').textContent='Need at least 3 students connected. Wait for more to join.';return}
 let n=Math.round(ps.length/8);n=ps.length>=10?Math.max(2,n):Math.max(1,n);n=Math.min(3,n,ps.length-2);
 const sabs=SH(ps).slice(0,n);sb.nSab=n;
 P().forEach(p=>{p.role=sabs.includes(p)?'saboteur':'builder';p.ready=!!p.bot;p.ej=false;p.acc=false;p.pts=0;p.streak=0});
 G.phase='roles';ACT().forEach(p=>send(p,roleMsg(p,true)));top();
 $('#sbmain').innerHTML=panel('Roles dealt',`<div class="big">🤫 Check your device! There ${n>1?'are':'is'} <b>${n}</b> ${n>1?W().sabs:W().sab} among you.</div>
  <div class="big" id="cnt" aria-live="polite"></div><div class="bar2"><div id="cbar" style="width:0"></div></div>
  <p style="font-size:22px;margin:0">Hold the button on your device to peek at your secret role. Keep it to yourself!</p>${ctl('<button class="btn k" onclick="SB.build()">Start building</button>')}`);upd();beep(220,.15,'square')}

const roleMsg=(p,show)=>{const sb=g().sb;return{t:'sb_role',role:p.role,th:sb.theme,show,ready:!!p.ready,ej:!!(p.role==='saboteur'&&p.ej),acc:!!p.acc,
 mates:p.role==='saboteur'?P().filter(x=>x.role==='saboteur'&&x!==p).map(x=>({name:x.name,av:x.av})):[],n:sb.nSab,pts:p.pts}};
const qMsg=p=>{const G=g();if(p.oi!==G.i||!p.opts){p.opts=ET.SHO(Q[G.i].options);p.oi=G.i}
 return{t:'sb_q',i:G.i,n:Q.length,q:Q[G.i].question,strand:Q[G.i].strand,opts:p.opts,left:left(),ans:p.a?p.opts.indexOf(p.a.v):-1,cf:p.cf||0}};
const meetMsg=p=>{const sb=g().sb;return{t:'sb_meet',n:sb.mi,left:left(),prompts:sb.pr,vote:sb.vote,ej:!!(p.role==='saboteur'&&p.ej)}};
const voters=()=>ACT().filter(p=>p.role&&!(p.role==='saboteur'&&p.ej));
const voteMsg=p=>({t:'sb_vote_open',n:g().sb.mi,left:left(),cands:g().sb.cand.filter(x=>x!==p).map(x=>({k:x.pub,name:x.name,av:x.av})),done:p.vk!=null});
const vresMsg=p=>{const sb=g().sb,vr=sb.vr;return{t:'sb_vres',rows:vr.rows,skip:vr.skip,sus:vr.sus,ej:vr.ej,you:!!(vr.ej&&vr.ej.pub===p.pub),role:p.role,bonus:p.role==='saboteur'&&!p.ej?vr.bonus:0,eject:sb.eject}};
const endMsg=p=>{const sb=g().sb;return{t:'sb_end',w:sb.win,why:sb.why,role:p.role,ej:!!(p.role==='saboteur'&&p.ej),acc:!!p.acc,pts:p.pts||0,th:sb.theme,sabs:P().filter(x=>x.role==='saboteur').map(x=>({name:x.name,av:x.av}))}};

/* a student (re)joins, or a late joiner arrives: give them the current screen. Late joiners play as builders. */
function join(p){ensure(p);const G=g();if(G.phase==='lobby')return;const ph=G.phase;
 if(ph==='intro')send(p,{t:'sb_intro',th:G.sb.theme});
 else{if(!p.role){p.role='builder';p.pts=p.pts||0}
  send(p,roleMsg(p,ph==='roles'));
  if(ph==='q')send(p,qMsg(p));
  else if(ph==='rev')send(p,p.rev||{t:'sb_hold',msg:'This question is over. The next one starts soon!'});
  else if(ph==='debate')send(p,meetMsg(p));
  else if(ph==='vote')send(p,voters().includes(p)?voteMsg(p):{t:'sb_hold',msg:'You are out of the vote. Keep answering questions!'});
  else if(ph==='vres'&&G.sb.vr)send(p,vresMsg(p));
  else if(ph==='end')send(p,endMsg(p))}
 top();upd()}
function drop(){const G=g();if(!G.sb||G.phase==='lobby')return;top();upd();if(G.phase==='q')chkQ();else if(G.phase==='vote')chkVote()}

function host(c,d){const G=g(),p=ET.pOf(c);if(!p||!G.sb)return;
 if(d.t==='sb_ready'&&G.phase==='roles'&&p.role){p.ready=true;upd()}
 else if(d.t==='sb_ans'&&G.phase==='q'&&d.i===G.i&&p.role&&!p.a&&(p.opts||[]).includes(d.v)){p.a={v:d.v,ms:Date.now()-G.t0};upd();chkQ()}
 else if(d.t==='sb_conf'&&d.i===G.i&&[1,2,3].includes(d.c)&&p.a){p.cf=d.c;const r=G.log.findLast(x=>x.playerId===p.id&&x.qIndex===d.i);if(r)r.confidence=d.c;chkQ()}
 else if(d.t==='sb_vote'&&G.phase==='vote'&&p.vk==null&&voters().includes(p)&&(d.k==='skip'||G.sb.cand.some(x=>x.pub===d.k&&x!==p))){p.vk=d.k;send(p,{t:'sb_vwait'});upd();chkVote()}}

/* ---- questions ---- */
function nextQ(){const G=g();flush();G.i++;if(G.i>=Q.length)return finish('builders','done');
 clearInterval(G.tm);clearTimeout(G.rv);G.phase='q';G.t0=Date.now();G.endAt=G.sec?G.t0+G.sec*1e3:0;G.allAt=0;
 P().forEach(p=>{p.a=null;p.cf=null;p.rev=null;p.opts=ET.SHO(Q[G.i].options);p.oi=G.i});
 ACT().forEach(p=>send(p,qMsg(p)));top();renderQ();G.tm=setInterval(tick,250);botsAnswer()}
function chkQ(){const G=g();if(G.phase!=='q')return;const a=ACT();if(!a.length||!a.every(p=>p.a))return;
 if(!G.allAt)G.allAt=Date.now();clearTimeout(G.rv);
 /* everyone answered: give the "how sure" taps up to 2.5s, then reveal */
 G.rv=setTimeout(()=>G.phase==='q'&&reveal(),a.every(p=>p.cf)?600:Math.max(300,2500-(Date.now()-G.allAt)))}
function more(){const G=g(),ph=G.phase;if(!G.endAt||!['q','debate','vote'].includes(ph))return;const add=ph==='debate'?30e3:1e4;G.endAt+=add;if(G.mTot&&ph!=='q')G.mTot+=add;ACT().forEach(p=>send(p,{t:'sb_time',left:left()}))}
function stop(){if(confirm('End the game now? All the roles will be revealed.'))finish(null,'teacher')}
function flush(){const G=g();if(G.vt){clearTimeout(G.vt);G.vt=0}if(G.vfn){const f=G.vfn;G.vfn=null;f()}}

function reveal(){const G=g(),sb=G.sb;if(G.phase!=='q')return;G.phase='rev';clearInterval(G.tm);clearTimeout(G.rv);
 const q=Q[G.i],si=sb.qs[G.i],S=sb.secs[si],
  part=P().filter(p=>p.role&&(p.on||p.a)),base=part.filter(p=>!(p.role==='saboteur'&&p.ej)),
  okN=base.filter(p=>p.a&&p.a.v===q.correct).length,acc=base.length?okN/base.length*100:0,pass=acc>=G.th,
  hon=base.filter(p=>p.role==='builder'),honOk=hon.filter(p=>p.a&&p.a.v===q.correct).length;
 S.pieces.push(pass?'ok':'no');S.asked++;S.accSum+=acc;sb.fresh={s:si,k:S.pieces.length-1};
 let secDone=false;if(S.asked>=S.total){S.done=secDone=true;S.avg=S.accSum/S.total;S.failed=S.avg<G.th}
 const dist={},wrong={};q.options.forEach(o=>dist[o]=0);
 part.forEach(p=>{const a=p.a,ok=!!a&&a.v===q.correct,sab=p.role==='saboteur',out=sab&&p.ej;let pts=0,bonus=0,sabotage=false;
  if(a){dist[a.v]++;if(!ok)wrong[a.v]=(wrong[a.v]||0)+1}
  /* builders +10 per correct. Saboteurs +10 for a wrong answer on a question the class failed, +5 per failed strand. Ejected saboteurs earn nothing. */
  if(!out){if(sab){if(a&&!ok&&!pass){pts=10;sabotage=true}if(secDone&&S.failed)bonus=5}else if(ok)pts=10}
  p.pts+=pts+bonus;p.streak=ok?p.streak+1:0;
  G.log.push({playerId:p.id,name:p.name,avatarId:p.av+1,qIndex:G.i,strand:q.strand,difficulty:q.difficulty||'',chosen:a?a.v:'',correct:ok,timeMs:a?a.ms:(G.sec*1e3),confidence:p.cf||'',wager:'',role:p.role,powerUpUsed:'',timedOut:!a,ejected:!!out,accused:!!p.acc,sabotage,points:pts+bonus,classAccuracy:Math.round(acc)});
  p.rev={t:'sb_rev',ok,correct:q.correct,exp:q.explanation,total:p.pts,streak:p.streak,acc:Math.round(acc),pass,secDone,secFailed:secDone&&S.failed,strand:q.strand,timedOut:!a,out};send(p,p.rev)});
 G.dist[G.i]={qIndex:G.i,strand:q.strand,counts:dist,classAccuracy:Math.round(acc),builderAccuracy:hon.length?Math.round(honOk/hon.length*100):null,passed:pass};
 const tot=Object.values(dist).reduce((s,n)=>s+n,0),wr=Object.entries(wrong).sort((a,b)=>b[1]-a[1])[0];
 top();
 $('#sbmain').innerHTML=`<div class="warn ${pass?'okc':''}" style="margin:0 0 24px"><span class="tag">${E(q.strand)}</span>
  <div class="big" style="margin:10px 0">${pass?'🧱 A piece is built!':'💥 Crack! The structure is damaged'}</div>
  <p style="font-size:22px"><b>${Math.round(acc)}%</b> of the class got it (need ${G.th}%).</p>
  ${secDone?`<p style="font-size:22px"><b>Section ${si+1} · ${E(S.name)}:</b> ${S.failed?'FAILED ✖':'BUILT ✔'} (${Math.round(S.avg)}% average)</p>`:''}
  <p style="font-size:22px">Answer: <b>${E(q.correct)}</b>. ${E(q.explanation)}</p>
  <div class="dists" aria-label="How many chose each option">${q.options.map(o=>`<div class="dr ${o===q.correct?'ok':''}"><span class="dt">${E(o)}${o===q.correct?' ✔':''}</span><div class="bar2"><div style="width:${tot?dist[o]/tot*100:0}%"></div></div><span>${dist[o]}</span></div>`).join('')}</div>
  ${wr?`<p style="font-size:20px"><b>Ask the class:</b> why might “${E(wr[0])}” seem right? (${wr[1]} chose it)</p>`:''}
  ${ctl(`<button class="btn k" onclick="SB.next()">${nextLabel()}</button>`)}</div>`;
 pass?good():bad()}

/* ---- win/lose rules ---- */
function check(){const G=g(),sb=G.sb;if(sb.secs.filter(s=>s.failed).length>sb.secs.length/2)return{w:'saboteurs',why:'project'};
 const sabs=P().filter(p=>p.role==='saboteur'),live=sabs.filter(p=>!p.ej),bld=P().filter(p=>p.role==='builder');
 if(sabs.length&&!live.length)return{w:'builders',why:'caught'};
 if(live.length>bld.length)return{w:'saboteurs',why:'outnumber'};return null}
const nextLabel=()=>{const G=g();if(check()||G.i+1>=Q.length)return'See results';return G.phase==='rev'&&(G.i+1)%EVERY===0?'Emergency meeting 🚨':'Next question'};
function next(){const G=g(),ph=G.phase;flush();const f=check();if(f)return finish(f.w,f.why);
 if(G.i+1>=Q.length)return finish('builders','done');
 if(ph==='rev'&&(G.i+1)%EVERY===0)return meeting();nextQ()}

/* ---- emergency meeting: debate, vote, reveal ---- */
function meeting(){const G=g(),sb=G.sb;clearInterval(G.tm);sb.mi++;sb.pr=SH(PROMPTS).slice(0,3);G.phase='debate';G.mTot=MEET;G.endAt=Date.now()+MEET;G.lastBeep=0;
 ACT().forEach(p=>send(p,meetMsg(p)));top();
 const st=sb.secs.map((s,k)=>({k,name:s.name,acc:s.asked?s.accSum/s.asked:null})),hid=P().filter(p=>p.role==='saboteur'&&!p.ej).length;
 $('#sbmain').innerHTML=panel(`🚨 Emergency meeting ${sb.mi}`,`<div class="sb-md"><div class="sb-ringw">${ring('60')}</div><div style="flex:1;min-width:260px">
  <div class="big">How is each strand going?</div><div class="dists" aria-label="Strand breakdown">${st.map(s=>`<div class="dr"><span class="dt">${s.k+1}. ${E(s.name)}</span><div class="bar2"><div style="width:${s.acc==null?0:s.acc}%"></div></div><span>${s.acc==null?'–':s.acc>=G.th?'✔':'✖'}</span></div>`).join('')}</div>
  <small>✔ at or above ${G.th}% · ✖ below the pass line</small></div></div>
  <div class="big" style="font-size:clamp(22px,2.6vw,32px)">Talk about it:</div><ul class="sb-how">${sb.pr.map(x=>`<li>${E(x)}</li>`).join('')}</ul>
  <p style="font-size:22px;margin:0">${W().ic} ${hid} ${hid===1?W().sab:W().sabs} still hiding. ${sb.vote?'Voting opens when the timer ends.':'No voting this time. Just talk!'}</p>
  <p class="big" id="dmsg" aria-live="polite"></p>
  ${ctl(`<button class="btn c" onclick="SB.more()">+30s</button>${sb.vote?'<button class="btn k" onclick="SB.vote()">Go to voting</button>':''}<button class="btn" onclick="SB.next()">${sb.vote?'Skip voting, next question':'Next question'}</button>`)}`);
 G.tm=setInterval(tick,250);beep(880,.12,'square');setTimeout(()=>beep(660,.12,'square'),160);setTimeout(()=>beep(880,.12,'square'),320)}
const ring=t=>`<svg class="sb-ring" viewBox="0 0 120 120" role="img" aria-label="Countdown timer"><circle class="rb" cx="60" cy="60" r="52"/><circle class="rf" id="rf" cx="60" cy="60" r="52" stroke-dasharray="${RING}" stroke-dashoffset="0"/><text id="rt" x="60" y="62">${t}</text></svg>`;

function tick(){const G=g(),ph=G.phase,l=left();
 if(ph==='q'){if(G.endAt&&l<=0)reveal();else renderT();return}
 if(ph!=='debate'&&ph!=='vote')return;
 const rf=$('#rf'),rt=$('#rt');if(rf)rf.style.strokeDashoffset=String(+(RING*(1-(G.mTot?l/G.mTot:0))).toFixed(1));if(rt)rt.textContent=Math.ceil(l/1e3);
 const s=Math.ceil(l/1e3);if(l>0&&s<=5&&G.lastBeep!==s){G.lastBeep=s;beep(900,.05)}
 if(l<=0){clearInterval(G.tm);if(ph==='debate'){if(G.sb.vote)openVote();else{const m=$('#dmsg');if(m)m.textContent="Time's up! Wrap up your discussion."}}else closeVote()}}

function openVote(){const G=g(),sb=G.sb;if(G.phase!=='debate')return;clearInterval(G.tm);G.phase='vote';G.mTot=VOTE;G.endAt=Date.now()+VOTE;G.lastBeep=0;
 sb.cand=P().filter(p=>p.role&&p.on&&!p.ej&&!p.acc);P().forEach(p=>p.vk=null);
 const vs=voters();vs.forEach(p=>send(p,voteMsg(p)));ACT().filter(p=>!vs.includes(p)).forEach(p=>send(p,{t:'sb_hold',msg:'You are out of the vote. Keep answering questions!'}));
 $('#sbmain').innerHTML=panel('🗳️ Time to vote',`<div class="sb-md"><div class="sb-ringw">${ring('30')}</div><div style="flex:1;min-width:260px"><div class="big">Who seems suspicious?</div>
  <p style="font-size:22px">Tap a name on your device, or skip if you're not sure. Votes stay secret until everyone has voted.</p><div class="big" id="cnt" aria-live="polite"></div><div class="bar2"><div id="cbar" style="width:0"></div></div></div></div>
  <div class="players">${sb.cand.map(c=>`<span class="chip">${av(c.av)} ${c.name}</span>`).join('')}</div>${ctl('<button class="btn k" onclick="SB.closeVote()">Close voting</button>')}`);
 upd();G.tm=setInterval(tick,250);botVotes();beep(500,.1,'square')}
function chkVote(){const G=g();if(G.phase==='vote'&&voters().length&&voters().every(p=>p.vk!=null))setTimeout(()=>G.phase==='vote'&&closeVote(),900)}

function closeVote(){const G=g(),sb=G.sb;if(G.phase!=='vote')return;clearInterval(G.tm);G.phase='vres';
 const vs=voters(),tally=new Map(sb.cand.map(c=>[c,0])),rec=[];let skip=0,none=0;
 vs.forEach(v=>{const t=v.vk==null?null:v.vk==='skip'?'skip':sb.cand.find(x=>x.pub===v.vk);
  if(t===null)none++;else if(t==='skip')skip++;else tally.set(t,tally.get(t)+1);
  rec.push({voter:v.name,voterRole:v.role,target:t===null?'(no vote)':t==='skip'?'skip':t.name})});
 const rows=[...tally].filter(([c,n])=>n>0).sort((a,b)=>a[1]-b[1]),top1=rows[rows.length-1],sec=rows[rows.length-2];
 /* a clear suspect needs more votes than anyone else and more than "skip"; ejecting also needs 2 votes (or 1 if only one voter) */
 const sus=top1&&top1[1]>(sec?sec[1]:0)&&top1[1]>skip?top1[0]:null,ej=sus&&sb.eject&&top1[1]>=Math.min(2,vs.length)?sus:null;
 let bonus=0;
 if(ej){if(ej.role==='saboteur')ej.ej=true;else{ej.acc=true;bonus=15;P().filter(p=>p.role==='saboteur'&&!p.ej).forEach(p=>p.pts+=15)}}
 const pub=c=>c&&{name:c.name,av:c.av,pub:c.pub};
 sb.vr={rows:rows.slice().reverse().map(([c,n])=>({name:c.name,av:c.av,n})),skip,sus:pub(sus),ej:ej&&{...pub(ej),role:ej.role},bonus};
 G.meet.push({meeting:sb.mi,afterQuestion:G.i+1,votes:rec,tally:sb.vr.rows.map(r=>({name:r.name,votes:r.n})),skips:skip,noVote:none,suspect:sus?sus.name:null,ejected:ej?ej.name:null,ejectedRole:ej?ej.role:null});
 vs.forEach(p=>send(p,{t:'sb_vwait'}));
 const ms=rows.length*800+2400;clearTimeout(G.vt);G.vfn=()=>ACT().forEach(p=>send(p,vresMsg(p)));G.vt=setTimeout(()=>{G.vt=0;const f=G.vfn;G.vfn=null;f&&f()},ms);
 const w=W(),r=sb.vr,d0=rows.length*.8+.5;let verdict;
 if(ej&&ej.role==='saboteur')verdict=`<div class="sb-verdict" style="--d:${d0}s"><div class="sbc" style="height:auto"><div class="stk">🎯 Caught!</div></div><div class="big" style="margin-top:12px">${ej.name} was a ${w.sab}!</div><p style="font-size:22px">They are ejected and earn no more points.</p></div>`;
 else if(ej)verdict=`<div class="sb-verdict" style="--d:${d0}s"><div class="stk">😮 Oh no!</div><div class="big" style="margin-top:12px">${ej.name} was a Builder, wrongly accused.</div><p style="font-size:22px">Everyone makes guesses, that's the game! They stay on the team, and the ${w.sabs.toLowerCase()} gain +15.</p></div>`;
 else if(sus&&!sb.eject)verdict=`<div class="sb-verdict" style="--d:${d0}s"><div class="big">The class suspects ${sus.name} (${top1[1]} vote${top1[1]>1?'s':''}).</div><p style="font-size:22px">No ejection this time.</p></div>`;
 else verdict=`<div class="sb-verdict" style="--d:${d0}s"><div class="big">No clear suspect. Nobody is ejected.</div></div>`;
 top();
 $('#sbmain').innerHTML=panel('🗳️ The votes are in',`<div class="sb-votes" aria-label="Vote results">${r.rows.slice().reverse().map((x,i)=>`<div class="sb-vr" style="--d:${i*.8}s"><span>${av(x.av)} ${x.name}</span><div class="bar2"><div style="width:${x.n/Math.max(1,vs.length)*100}%"></div></div><span>${x.n}</span></div>`).join('')||'<p class="big">Nobody got a vote.</p>'}
  <div class="sb-vr" style="--d:${rows.length*.8}s"><span>⏭️ Skip</span><div class="bar2"><div style="width:${skip/Math.max(1,vs.length)*100}%"></div></div><span>${skip}</span></div></div>${verdict}
  ${ctl(`<button class="btn k" onclick="SB.next()">${nextLabel()}</button>`)}`);
 beep(300,.2,'square');setTimeout(()=>ej?(ej.role==='saboteur'?good():bad()):beep(400,.2),ms-1500)}

/* ---- the end ---- */
function finish(w,why){const G=g(),sb=G.sb;FX.confetti();flush();clearInterval(G.tm);clearTimeout(G.rv);G.phase='end';sb.win=w;sb.why=why;
 ACT().forEach(p=>send(p,endMsg(p)));top();
 const th=W(),hon=G.log.filter(x=>x.role==='builder'&&!x.timedOut),honOk=hon.filter(x=>x.correct).length,sabOk=G.log.filter(x=>x.sabotage).length,
  built=sb.secs.filter(s=>s.done&&!s.failed).length,rs=P().filter(p=>p.role),t5=[...rs].sort((a,b)=>b.pts-a.pts||a.name.localeCompare(b.name)).slice(0,5);
 $('#sbmain').innerHTML=`<div class="warn ${w==='builders'?'okc':''}" style="margin:0 0 24px"><div class="stk">${w==='builders'?'Builders win! 🏗️':w==='saboteurs'?`${th.sabs} win! ${th.ic}`:'Game over'}</div>
  <h2 style="margin:18px 0 8px">${WHY(th)[why]||''}</h2>
  <p style="font-size:20px;margin:0 0 14px">Sections built: <b>${built} of ${sb.secs.length}</b> · Builders' accuracy: <b>${hon.length?Math.round(honOk/hon.length*100):0}%</b> · Successful sabotages: <b>${sabOk}</b>. In the CSV and JSON, ${th.sab.toLowerCase()} answers are labelled so they can be left out of mastery.</p>
  ${rs.length?`<div class="big" style="margin:8px 0">The roles are revealed…</div><div class="sb-rv">${rs.map((p,i)=>{const s=p.role==='saboteur';return `<div class="sbc"><div class="sbc-in" style="--d:${(i*.15).toFixed(2)}s"><div class="sbc-f ${s?'s':''}">${av(p.av)}<b>${p.name}</b><span>${s?th.ic+' '+th.sab:'🔨 Builder'}</span>${s&&p.ej?'<small>ejected</small>':''}${p.acc?'<small>wrongly accused</small>':''}</div><div class="sbc-b" aria-hidden="true">?</div></div></div>`}).join('')}</div>
  <div class="panel" style="margin:24px 0 0;box-shadow:5px 5px 0 var(--ink)"><div class="bar">Top 5 points</div><div class="in"><ol class="lb">${t5.map((p,i)=>`<li><span class="rk">${i+1}</span>${av(p.av)}<b>${p.name}</b><span class="cs">${p.pts}</span></li>`).join('')}</ol></div></div>`:''}
  <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:18px"><button class="btn k" onclick="SB.again()">Play again, same questions</button><button class="btn" onclick="SB.csv()">Download CSV</button><button class="btn c" onclick="SB.json()">Download JSON</button></div></div>`;
 w==='builders'?(good(),setTimeout(()=>beep(1100,.4),300)):bad()}

/* ---- host screens ---- */
function renderQ(){const G=g(),q=Q[G.i];
 $('#sbmain').innerHTML=panel(`Question ${G.i+1} of ${Q.length} · ${E(q.strand)} · <span id="tl"></span>`,`<div class="big">${E(q.question)}</div>
  <div class="ans">${q.options.map(o=>`<div class="mode" style="font-size:24px;cursor:default">${E(o)}</div>`).join('')}</div>
  <div class="big" id="cnt" aria-live="polite"></div><div class="bar2"><div id="cbar" style="width:0"></div></div>
  ${ctl('<button class="btn" onclick="SB.reveal()">Reveal now</button><button class="btn c" onclick="SB.more()">+10s</button>')}`);upd();renderT()}
function renderT(){const t=$('#tl');if(t){const G=g();t.textContent=G.endAt?Math.max(0,Math.ceil((G.endAt-Date.now())/1e3))+'s':'untimed'}}
function upd(){const c=$('#cnt');if(!c)return;const G=g(),ph=G.phase;let a=ACT(),n=0,t='';
 if(ph==='roles'){n=a.filter(p=>p.ready).length;t=`${n} of ${a.length} ready`}
 else if(ph==='q'){n=a.filter(p=>p.a).length;t=`${n} of ${a.length} have answered`}
 else if(ph==='vote'){a=voters();n=a.filter(p=>p.vk!=null).length;t=`${n} of ${a.length} votes locked in`}
 c.textContent=t;const b=$('#cbar');if(b)b.style.width=(a.length?n/a.length*100:0)+'%'}
function build(){const G=g();if(G.phase!=='roles')return;nextQ()}

/* ---- exports (CSV text is neutralised so a name starting with = can't run as a formula) ---- */
const cell=v=>{let s=String(v);if(typeof v==='string'&&/^[=+\-@]/.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`};
const dl=(name,type,text)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click()};
function csv(){const G=g(),k=Object.keys(G.log[0]||{playerId:1});dl('saboteur-answers.csv','text/csv',[k.join(',')].concat(G.log.map(o=>k.map(x=>cell(o[x])).join(','))).join('\n'))}
function json(){const G=g(),sb=G.sb,by={};
 G.log.filter(x=>x.role==='builder'&&!x.timedOut).forEach(x=>{const s=by[x.strand]=by[x.strand]||{strand:x.strand,answered:0,correct:0};s.answered++;if(x.correct)s.correct++});
 dl('saboteur-session.json','application/json',JSON.stringify({mode:'saboteur',topic:G.topic,year:$('#yr').value,theme:sb.theme,structure:sb.struct,votingEnabled:sb.vote,ejectionEnabled:sb.eject,secondsPerQuestion:G.sec,passThreshold:G.th,winner:sb.win,why:sb.why,
  masteryNote:'Rows with role "saboteur" are deliberate wrong answers. Exclude them from mastery. honestStrandAccuracy uses builder rows only.',
  questions:Q,players:P().filter(p=>p.role).map(p=>({playerId:p.id,name:p.name,avatarId:p.av+1,role:p.role,ejected:p.role==='saboteur'&&p.ej,wronglyAccused:!!p.acc,points:p.pts})),
  log:G.log,perQuestion:G.dist,sections:sb.secs.map(s=>({strand:s.name,questions:s.total,pieces:s.pieces,averageClassAccuracy:s.avg==null?null:Math.round(s.avg),failed:s.failed})),
  meetings:G.meet,honestStrandAccuracy:Object.values(by).map(s=>({...s,percent:Math.round(s.correct/s.answered*100)}))},null,1))}

window.SB={deal,build,reveal,more,stop,next,vote:openVote,closeVote,again:start,csv,json};

/* ---- practice bots (host testing only, until the general demo mode is built) ---- */
const BN=['Aroha','Tane','Mia','Liam','Ruby','Kahu','Zoe','Noah','Isla','Rawiri','Ella','Jack','Maia','Finn','Lily','Hemi','Anika','Sam','Tia','Eli'];
function addBots(){const G=g();if(!G||G.mode!=='saboteur'||G.phase!=='lobby')return;
 for(let k=0;k<10;k++){const n=++BC,id='bot'+n;G.p[id]={id,name:'Bot '+BN[(n-1)%BN.length]+(n>BN.length?' '+Math.ceil(n/BN.length):''),av:Math.random()*10|0,on:true,ok:0,tot:0,streak:0,bot:true,skill:.35+Math.random()*.6};ensure(G.p[id])}
 ET.renderP();ET.bc({t:'lobby',n:ET.cnt()})}
function botsAnswer(){const G=g(),i=G.i,q=Q[i];P().filter(p=>p.bot&&p.role).forEach(p=>setTimeout(()=>{if(G.phase!=='q'||G.i!==i||p.a)return;
 const right=p.role==='saboteur'?Math.random()<.15:Math.random()<p.skill,wr=q.options.filter(o=>o!==q.correct);
 p.a={v:right?q.correct:wr[Math.random()*wr.length|0],ms:Date.now()-G.t0};p.cf=1+(Math.random()*3|0);upd();chkQ()},600+Math.random()*Math.min(G.sec||20,20)*600))}
function botVotes(){const G=g(),sb=G.sb,mi=sb.mi;voters().filter(p=>p.bot).forEach(p=>setTimeout(()=>{if(G.phase!=='vote'||sb.mi!==mi||p.vk!=null)return;
 const c=sb.cand.filter(x=>x!==p);p.vk=Math.random()<.55&&c.length?c[Math.random()*c.length|0].pub:'skip';upd();chkVote()},1500+Math.random()*8000))}

/* ---- host setup: Saboteur-only settings + bots button ---- */
$('#hmsg').insertAdjacentHTML('beforebegin',`<div id="sbset" style="display:none;gap:16px;border:3px dashed var(--ink);padding:16px"><div class="row" style="grid-template-columns:1fr 1fr"><div><label for="sbst">Build</label><select id="sbst"><option value="wharenui">Wharenui</option><option value="station">Space station</option></select></div><div><label for="sbth">Theme</label><select id="sbth"><option value="saboteur">Saboteur</option><option value="gremlin">Gremlins (gentler)</option></select></div></div>
 <div class="row" style="grid-template-columns:1fr 1fr"><div><label for="sbvo">Voting</label><select id="sbvo"><option value="on">Students vote on their devices</option><option value="off">Verbal debate only (no voting)</option></select></div><div><label for="sbej">Ejection</label><select id="sbej"><option value="on">On: top-voted player is revealed</option><option value="off">Off: votes are only shown</option></select></div></div></div>`);
$('#start').insertAdjacentHTML('afterend',' <button class="btn c" id="sbbots" type="button" hidden>Add 10 practice bots</button>');
$('#sbbots').onclick=addBots;
document.querySelectorAll('#mm .mode').forEach(b=>b.addEventListener('click',()=>{const on=b.dataset.m==='saboteur';$('#sbset').style.display=on?'grid':'none';$('#sbbots').hidden=!on}));

/* ================= STUDENT ================= */
let R={role:null,mates:[],th:'saboteur',n:0,ej:false,acc:false,pts:0},T=null,END=0,SRN=null;
const w_=()=>TH[R.th];
const show=h=>{sv(h);bindPeek()};
const wcard=(cls,inner)=>show(`<div class="warn ${cls}" style="text-align:center">${inner}</div>`);
function clock(ms){END=ms?Date.now()+ms:0;clearInterval(T);if(!END)return;
 const tick=()=>{const t=$('#st');if(!t){clearInterval(T);return 0}const s=Math.max(0,Math.ceil((END-Date.now())/1e3));t.textContent=s+'s';return s};
 tick();T=setInterval(()=>{const s=tick();if(s>0&&s<=5)beep(900,.05)},500)}
const say=t=>{if(!SRN){SRN=document.createElement('div');SRN.className='sr';SRN.setAttribute('aria-live','polite');document.body.appendChild(SRN)}SRN.textContent=t};
const pkBtn=()=>'<button class="btn sb-pk" id="pk" type="button">👁 Hold to peek at your role</button>';

/* press-and-hold helper (pointer + keyboard). A neighbour can't read a role you aren't holding. */
function hold(b,on,off){if(!b)return;let d=false;const a=()=>{if(!d){d=true;on()}},z=()=>{if(d){d=false;off()}};
 b.onpointerdown=e=>{e.preventDefault();a()};['onpointerup','onpointerleave','onpointercancel','onblur'].forEach(k=>b[k]=z);
 b.onkeydown=e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();a()}};b.onkeyup=e=>{if(e.key===' '||e.key==='Enter')z()};b.oncontextmenu=e=>e.preventDefault()}
function face(){const w=w_();
 if(R.role==='saboteur')return `<img src="assets/saboteur.png" alt="" style="max-height:100px;max-width:70%" onerror="this.style.display='none'"><div style="font-size:40px" aria-hidden="true">${w.ic}</div><h2>${w.sab}</h2><p style="margin:0">Pick wrong answers on purpose. You must still answer every question. Don't get caught!</p>${R.mates.length?`<p style="margin:0"><b>Your partner${R.mates.length>1?'s':''}:</b> ${R.mates.map(m=>m.name).join(', ')}</p>`:''}${R.ej?'<p style="margin:0"><b>You were ejected.</b></p>':''}`;
 return `<div style="font-size:54px" aria-hidden="true">🔨</div><h2>Builder</h2><p style="margin:0">Answer honestly and help the class build. Watch for who seems suspicious!</p>${R.acc?'<p style="margin:0"><b>Wrongly accused. You did nothing wrong!</b></p>':''}`}
const roleText=()=>R.role==='saboteur'?`You are a ${w_().sab}.${R.mates.length?' Your partners: '+R.mates.map(m=>m.name).join(', ')+'.':''}`:'You are a Builder.';
function bindPeek(){const b=$('#pk');if(!b||!R.role)return;let o=document.getElementById('sbp');
 if(!o){o=document.createElement('div');o.id='sbp';o.className='sb-pov';o.hidden=true;document.body.appendChild(o)}
 hold(b,()=>{o.innerHTML=`<div class="sb-big ${R.role==='saboteur'?'s':''}">${face()}</div>`;o.hidden=false;say(roleText())},()=>{o.hidden=true;o.innerHTML='';say('')})}

function student(d){
 if(d.t==='sb_time'){END=Date.now()+d.left;return}
 clearInterval(T);
 ({sb_intro:introV,sb_role:roleV,sb_q:qV,sb_rev:revV,sb_hold:holdV,sb_meet:meetV,sb_vote_open:voteV,sb_vwait:vwaitV,sb_vres:vresV,sb_end:endV})[d.t]?.(d)}

function introV(d){R.th=d.th;const w=w_();
 wcard('okc',`<div class="stk">${w.title}</div><p style="font-size:20px;margin-top:18px"><b>${SAFE(w)}</b></p><p>Your secret role is coming up. Keep it to yourself!</p>`);beep(300,.1,'square')}

function roleV(d){R={role:d.role,mates:d.mates||[],th:d.th,n:d.n,ej:d.ej,acc:d.acc,pts:d.pts};if(!d.show)return;
 if(d.ready)return readyV();
 const w=w_();
 show(`<div class="panel" style="margin:0"><div class="bar">Your secret role</div><div class="in" style="justify-items:center;text-align:center">
  <p style="margin:0"><b>${SAFE(w)}</b></p>
  <div class="sb-flip" id="fl"><div class="sb-fi"><div class="sb-face sb-back"><div style="font-size:44px" aria-hidden="true">🔒</div><b class="d" style="font-size:24px">TOP SECRET</b><small>Hold the button to peek</small></div><div class="sb-face sb-front ${R.role==='saboteur'?'s':''}">${face()}</div></div></div>
  <p style="margin:0">There ${R.n>1?'are':'is'} <b>${R.n}</b> ${R.n>1?w.sabs:w.sab} in this game.</p>
  <button class="btn c sb-pk" id="hd" type="button">Hold to peek</button><button class="btn" id="rd" type="button">I've seen it. I'm ready</button></div></div>`);
 hold($('#hd'),()=>{$('#fl').classList.add('on');say(roleText())},()=>{$('#fl').classList.remove('on');say('')});
 $('#rd').onclick=()=>{ET.S().k.send({t:'sb_ready'});readyV();beep(660,.08)}}
const readyV=()=>wcard('okc',`<div class="stk">Ready!</div><p style="font-size:20px;margin-top:18px">Waiting for everyone else…</p>${pkBtn()}`);

function qV(d){const opts=d.opts,pre=d.ans>=0;
 show(`<div class="panel" style="margin:0"><div class="bar">Q${d.i+1} of ${d.n} · ${E(d.strand)} <span id="st" style="float:right"></span></div><div class="in">
  <div style="font:800 22px Syne">${E(d.q)}</div>
  <div class="ans" id="as">${opts.map((o,i)=>`<button data-i="${i}" aria-label="${LET[i]}: ${E(o)}" ${pre?'disabled':''} ${d.ans===i?'aria-pressed="true"':''}><b>${LET[i]}</b><span class="shp" aria-hidden="true">${SYM[i]}</span>${E(o)}</button>`).join('')}</div>
  <div id="cf" aria-live="polite"></div>${pkBtn()}</div></div>`);
 if(pre)d.cf?$('#cf').innerHTML='<p><b>Locked in. Eyes up!</b></p>':conf(d.i);
 $('#as').onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
  document.querySelectorAll('#as button').forEach(x=>x.disabled=true);b.setAttribute('aria-pressed',true);
  ET.S().k.send({t:'sb_ans',i:d.i,v:opts[+b.dataset.i]});navigator.vibrate?.(30);conf(d.i)};
 clock(d.left)}
function conf(i){const c=$('#cf');c.innerHTML='<p><b>How sure were you?</b></p><div class="conf"><button data-c="1">😬 Guessing</button><button data-c="2">🙂 Pretty sure</button><button data-c="3">😎 Certain</button></div>';
 c.onclick=e=>{const b=e.target.closest('button');if(!b)return;ET.S().k.send({t:'sb_conf',i,c:+b.dataset.c});c.innerHTML='<p><b>Locked in. Eyes up!</b></p>';c.onclick=null}}

/* every student sees the same kind of result screen, so a glance at a neighbour's phone gives nothing away */
function revV(d){R.pts=d.total;if(navigator.userActivation?.hasBeenActive)navigator.vibrate?.(d.ok?[40]:[80,40,80]);d.ok?good():bad();
 const msg=d.ok?['Nailed it!','Great thinking!','Yes!'][Math.random()*3|0]:d.timedOut?'Time ran out. Next one!':['So close!','Not yet!','Mistakes grow brains!'][Math.random()*3|0];
 wcard(d.ok?'okc':'',`<div class="stk">${msg}</div>${d.streak>=3?`<p class="big">🔥 ${d.streak} in a row!</p>`:''}
  <p style="font-size:20px;margin-top:16px"><b>Answer: ${E(d.correct)}</b></p><p>${d.ok?'':'Here is why: '}${E(d.exp)}</p>
  <p>Class score <b>${d.acc}%</b>: ${d.pass?'a piece was built! 🧱':'a crack appeared! 💥'}</p>${d.secDone?`<p><b>${E(d.strand)} section ${d.secFailed?'failed ✖':'built ✔'}</b></p>`:''}
  <p class="bal">⭐ ${d.total}</p><p>Watch the main screen.</p>${pkBtn()}`)}

const holdV=d=>wcard('',`<p class="big">${E(d.msg)}</p>${pkBtn()}`);

function meetV(d){wcard('',`<div class="stk">🚨 Emergency meeting!</div><p class="big" style="margin-top:14px"><span id="st"></span></p><p>Talk it out with your class. Be kind and give reasons.</p>
  <ul style="text-align:left">${d.prompts.map(x=>`<li>${E(x)}</li>`).join('')}</ul>${d.vote?'<p><b>Voting opens when the timer ends.</b></p>':'<p><b>No voting this time. Just talk!</b></p>'}${d.ej?'<p>You are out of the game, but keep answering questions.</p>':''}${pkBtn()}`);
 clock(d.left);beep(880,.12,'square')}

function voteV(d){if(d.done)return vwaitV();let sel=null;
 show(`<div class="panel" style="margin:0"><div class="bar">Vote <span id="st" style="float:right"></span></div><div class="in">
  <p style="margin:0"><b>Who seems suspicious?</b> Tap a name, then lock in. Or skip if you're not sure. Everyone makes guesses, and that's okay!</p>
  <div class="sb-cands" id="cd">${d.cands.map(c=>`<button data-k="${c.k}" aria-pressed="false">${av(c.av)}<span>${c.name}</span><span class="tick" aria-hidden="true">✔</span></button>`).join('')}<button data-k="skip" aria-pressed="false"><span>⏭️ Skip vote</span><span class="tick" aria-hidden="true">✔</span></button></div>
  <button class="btn" id="lv" type="button" disabled>Lock in my vote</button>${pkBtn()}</div></div>`);
 $('#cd').onclick=e=>{const b=e.target.closest('button');if(!b)return;sel=b.dataset.k;document.querySelectorAll('#cd button').forEach(x=>x.setAttribute('aria-pressed',x===b));$('#lv').disabled=false;beep(500,.05)};
 $('#lv').onclick=()=>{if(!sel)return;ET.S().k.send({t:'sb_vote',k:sel});vwaitV();beep(660,.08);navigator.vibrate?.(30)};
 clock(d.left)}
function vwaitV(){clearInterval(T);wcard('okc',`<div class="stk">Vote locked in!</div><p style="margin-top:18px">Eyes on the main screen…</p>${pkBtn()}`)}

function vresV(d){const w=w_(),e=d.ej;let head;
 if(d.you){if(R.role==='saboteur')R.ej=true;else R.acc=true}
 if(e&&e.role==='saboteur')head=`<div class="stk">🎯 Caught!</div><p class="big" style="margin-top:14px">${e.name} was a ${w.sab}!</p>${d.you?'<p>That was you. You earn no more points, but keep answering so the class data stays complete.</p>':''}`;
 else if(e)head=`<div class="stk">😮 Oh no!</div><p class="big" style="margin-top:14px">${e.name} was a Builder, wrongly accused.</p><p>Everyone makes guesses. That's the game!</p>${d.you?'<p><b>That was you, and you did nothing wrong.</b> You are still a Builder and still earning points.</p>':''}`;
 else if(d.sus&&!d.eject)head=`<div class="stk">The class suspects…</div><p class="big" style="margin-top:14px">${d.sus.name}</p><p>No ejection this time.</p>`;
 else head=`<div class="stk">No clear suspect</div><p style="margin-top:14px">Nobody is ejected.</p>`;
 wcard(e&&e.role==='saboteur'?'okc':'',`${head}${d.bonus?`<p><b>+${d.bonus} points for the ${w.sabs.toLowerCase()}</b></p>`:''}<p>Watch the main screen. The next question is coming…</p>${pkBtn()}`)}

function endV(d){const w=TH[d.th]||w_();R.th=d.th;
 if(d.role)R.role=d.role;
 const you=d.w&&d.role?(d.w==='builders')===(d.role==='builder'):null,why=(WHY(w)[d.why]||'');
 you&&FX.confetti();wcard(you?'okc':'',`<div class="stk">${you==null?'Game over':you?'Your team wins! 🎉':'Not this time. Great game!'}</div>
  <p style="font-size:20px;margin-top:18px"><b>${d.w==='builders'?'Builders win!':d.w==='saboteurs'?w.sabs+' win!':'The game has ended.'}</b> ${why}</p>
  ${d.role?`<p>You were a <b>${d.role==='saboteur'?w.sab:'Builder'}</b>${d.ej?' (ejected)':''}${d.acc?' (wrongly accused)':''}.</p>`:''}
  <p>The ${w.sabs.toLowerCase()} were: <b>${d.sabs.map(s=>s.name).join(', ')||'nobody'}</b></p><p class="bal">⭐ ${d.pts}</p><p>Great playing, ${ET.S().name}!</p>`);
 good();setTimeout(()=>beep(1100,.4),300)}

ET.eng.saboteur={start,join,drop,host,student};
})();
