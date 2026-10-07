/* PHASE 5: MASTER TEACHER PRINT DIAGNOSTIC
   Reads the per-answer log every engine already writes (G.log) plus the question list (Q) and builds a printable,
   strand-by-strand report. Also owns: demo data, Session History (localStorage) and the "Names in report" setting.

   Log row (all engines): {playerId,name,avatarId,qIndex,strand,difficulty,chosen,correct,timeMs,confidence(1-3|''),
     wager?,role? ('builder'|'saboteur'|''),timedOut,...}
   Mastery rules:
     - Saboteur rows (role==='saboteur') are deliberate wrong answers and are EXCLUDED from every mastery figure.
     - Ejected-builder rows are kept. Timed-out rows count as "not yet" but are also counted separately.
     - A student needs MINP answers in a strand before they are placed in a strand group (no groups from 1 answer).
   Names: 'full' | 'initials' | 'none' (Student 1, 2...). Stored in localStorage 'et-names'. */
(()=>{
const MINP=2, SECURE=80, DEVEL=50, SHARED=30, HIST_MAX=12;
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v);return true}catch(e){return false}}};
const E=s=>String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const dec=s=>String(s??'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
const pct=(a,b)=>b?Math.round(a/b*100):null;
const MODE={waka:'The Great Waka Escape',auction:'The Knowledge Auction',saboteur:'The Curriculum Saboteur'};
const status=p=>p==null?'No data':p>=SECURE?'Secure':p>=DEVEL?'Developing':'Reteach';
const symb=p=>p==null?'–':p>=SECURE?'✔':p>=DEVEL?'▲':'✖'; /* shape + word, never colour alone */

let names=ls.get('et-names')||'full';if(!['full','initials','none'].includes(names))names='full';
let cur=null,from='home';

/* ================= ANALYSIS (pure) ================= */
function analyse(s){
 const Qs=s.questions||[],all=s.log||[];
 const sab=all.filter(r=>r.role==='saboteur'),rows=all.filter(r=>r.role!=='saboteur');
 const hasConf=rows.some(r=>r.confidence===1||r.confidence===2||r.confidence===3);
 const strands=[...new Set(Qs.map(q=>q.strand))];
 const tot=a=>({n:a.length,ok:a.filter(r=>r.correct).length,p:pct(a.filter(r=>r.correct).length,a.length),timed:a.filter(r=>r.timedOut).length});
 const T=tot(rows);
 /* calibration: confident = 3, unsure = 1, middle (2) is reported but not placed in a corner */
 const cal=a=>{const c=a.filter(r=>r.confidence===3),u=a.filter(r=>r.confidence===1);return{
  sureRight:c.filter(r=>r.correct).length,sureWrong:c.filter(r=>!r.correct).length,
  unsureRight:u.filter(r=>r.correct).length,unsureWrong:u.filter(r=>!r.correct).length,mid:a.filter(r=>r.confidence===2).length}};
 const byStrand=strands.map(st=>{const a=rows.filter(r=>r.strand===st),t=tot(a),c=cal(a);
  return{strand:st,qs:Qs.filter(q=>q.strand===st).length,...t,status:status(t.p),cal:c}});
 const byQ=Qs.map((q,i)=>{const a=rows.filter(r=>r.qIndex===i),t=tot(a),d={};
  q.options.forEach(o=>d[o]=0);a.forEach(r=>{if(r.chosen!==''&&r.chosen in d)d[r.chosen]++});
  const wr=Object.entries(d).filter(([o])=>o!==q.correct).sort((x,y)=>y[1]-x[1])[0],
   share=wr&&t.n?Math.round(wr[1]/t.n*100):0;
  return{i,q:q.question,strand:q.strand,correct:q.correct,exp:q.explanation,dist:d,...t,top:wr&&wr[1]>0?{opt:wr[0],n:wr[1],share}:null,shared:share>=SHARED,status:status(t.p)}});
 const ids=[...new Set(rows.map(r=>r.playerId))];
 const stu=ids.map(id=>{const a=rows.filter(r=>r.playerId===id),t=tot(a),c=cal(a),per={};
  strands.forEach(st=>{const b=a.filter(r=>r.strand===st);per[st]={n:b.length,p:pct(b.filter(r=>r.correct).length,b.length)}});
  return{id,name:a[0].name,av:a[0].avatarId,...t,status:status(t.p),per,cal:c,
   blind:c.sureWrong,hidden:c.unsureRight}});
 /* groups: overall + per-strand reteach lists */
 const grp={secure:stu.filter(x=>x.p!=null&&x.p>=SECURE),dev:stu.filter(x=>x.p!=null&&x.p>=DEVEL&&x.p<SECURE),need:stu.filter(x=>x.p!=null&&x.p<DEVEL)};
 const reteach=strands.map(st=>({strand:st,who:stu.filter(x=>x.per[st].n>=MINP&&x.per[st].p<DEVEL),
  stretch:stu.filter(x=>x.per[st].n>=MINP&&x.per[st].p>=SECURE).length})).filter(g=>g.who.length);
 const cT=cal(rows);
 /* plain-English priorities */
 const pri=[],ws=byStrand.filter(x=>x.p!=null).sort((a,b)=>a.p-b.p)[0],bs=byStrand.filter(x=>x.p!=null).sort((a,b)=>b.p-a.p)[0];
 if(ws&&ws.status!=='Secure')pri.push(`Reteach <b>${E(ws.strand)}</b> first: the class scored ${ws.p}% (${ws.status.toLowerCase()}).`);
 else if(ws)pri.push(`Every strand is secure. The lowest is <b>${E(ws.strand)}</b> at ${ws.p}%, so move to extension.`);
 const sh=byQ.filter(x=>x.shared).sort((a,b)=>b.top.share-a.top.share)[0];
 if(sh)pri.push(`Shared misconception on Q${sh.i+1}: ${sh.top.share}% chose “${E(sh.top.opt)}”. Ask the class why it looked right.`);
 if(hasConf&&cT.sureWrong>=Math.max(3,T.n*.08)){const bw=byStrand.slice().sort((a,b)=>b.cal.sureWrong-a.cal.sureWrong)[0];
  pri.push(`<b>${cT.sureWrong}</b> answers were “certain” but wrong, most in <b>${E(bw.strand)}</b>. These are blind spots, not guesses.`)}
 if(hasConf&&cT.unsureRight>=Math.max(3,T.n*.08))pri.push(`<b>${cT.unsureRight}</b> “guessing” answers were right: knowledge students did not trust. Praise it.`);
 if(grp.need.length)pri.push(`${grp.need.length} student${grp.need.length>1?'s':''} below ${DEVEL}% overall: plan a small-group session.`);
 if(T.timed&&T.n&&T.timed/T.n>.1)pri.push(`${pct(T.timed,T.n)}% of answers timed out. Consider more time per question.`);
 return{T,hasConf,strands,byStrand,byQ,stu,grp,reteach,cal:cT,pri,excluded:sab.length,players:ids.length};
}

/* ================= NAMES ================= */
function nameMap(stu){const m={};stu.forEach((s,i)=>{const n=dec(s.name).trim()||'?';
 m[s.id]=names==='none'?`Student ${i+1}`:names==='initials'?n.split(/\s+/).map(w=>w[0]).join('').toUpperCase().slice(0,3):n});
 if(names==='initials'){const seen={};stu.forEach(s=>{const k=m[s.id];seen[k]=(seen[k]||0)+1;if(seen[k]>1)m[s.id]=k+seen[k]})}return m}

/* ================= SNAPSHOT + HISTORY ================= */
function snap(){const G=ET.G();if(!G||!G.log||!G.log.length)return null;
 return{id:'s'+Date.now().toString(36),at:Date.now(),mode:G.mode,topic:dec(G.topic),year:$('#yr')?.value||'',th:G.th,sec:G.sec,
  questions:Q,log:G.log.map(r=>({...r})),demo:!!G.demo}}
const hist=()=>{try{return JSON.parse(ls.get('et-hist')||'[]')}catch(e){return[]}};
function saveHist(s){let h=hist();h.unshift(s);h=h.slice(0,HIST_MAX);
 while(h.length&&!ls.set('et-hist',JSON.stringify(h)))h.pop() /* storage full: drop oldest until it fits */}
const saved=new WeakSet();

/* ================= RENDER ================= */
const bar=p=>`<span class="rp-bar" aria-hidden="true"><i style="width:${p||0}%"></i></span>`;
const tag=p=>`<span class="rp-st ${status(p).toLowerCase().replace(' ','')}">${symb(p)} ${status(p)}</span>`;
function render(s){const a=analyse(s),nm=nameMap(a.stu),d=new Date(s.at).toLocaleDateString('en-NZ',{day:'numeric',month:'long',year:'numeric'});
 const strandRows=a.byStrand.map(x=>`<tr><td><b>${E(x.strand)}</b><br><small>${x.qs} question${x.qs>1?'s':''}</small></td><td class="n">${x.p==null?'–':x.p+'%'}</td><td>${bar(x.p)}</td><td>${tag(x.p)}</td>${a.hasConf?`<td class="n">${x.cal.sureWrong}</td><td class="n">${x.cal.unsureRight}</td>`:''}</tr>`).join('');
 const qRows=a.byQ.map(x=>`<tr class="${x.shared?'flag':''}"><td class="n">${x.i+1}</td><td>${E(x.q.length>90?x.q.slice(0,88)+'…':x.q)}<br><small>${E(x.strand)} · answer: ${E(x.correct)}</small></td><td class="n">${x.p==null?'–':x.p+'%'}</td><td>${x.top?`“${E(x.top.opt)}” (${x.top.share}%)${x.shared?' <b>⚠ shared misconception</b>':''}`:'<small>no common wrong answer</small>'}</td></tr>`).join('');
 const cl=a.cal,c4=a.hasConf?`<div class="rp-4"><div><b>${cl.sureWrong}</b>Certain + wrong<small>Blind spots. Reteach first.</small></div><div><b>${cl.sureRight}</b>Certain + right<small>Secure knowledge.</small></div><div><b>${cl.unsureWrong}</b>Guessing + wrong<small>Known gaps. Students know they need help.</small></div><div><b>${cl.unsureRight}</b>Guessing + right<small>Hidden knowledge. Build confidence.</small></div></div><p class="rp-note">${cl.mid} “pretty sure” answers are not placed in a corner.${s.mode==='auction'?' In the Auction, confidence comes from the size of the bid (10–39 guessing, 40–69 pretty sure, 70+ certain).':''}</p>`:'<p class="rp-note">No confidence data was collected in this session, so blind-spot analysis is not shown.</p>';
 const list=(arr)=>arr.length?arr.map(x=>E(nm[x.id])+` <small>(${x.p}%)</small>`).join(', '):'<small>nobody</small>';
 const groups=`<div class="rp-grp"><div><h4>${symb(90)} Secure (${a.grp.secure.length})</h4><p>${list(a.grp.secure)}</p><small>Extension or peer-tutor roles.</small></div><div><h4>${symb(60)} Developing (${a.grp.dev.length})</h4><p>${list(a.grp.dev)}</p><small>Practice and feedback.</small></div><div><h4>${symb(20)} Needs support (${a.grp.need.length})</h4><p>${list(a.grp.need)}</p><small>Small-group reteach.</small></div></div>
 ${a.reteach.length?`<h4 style="margin:14px 0 6px">Reteach groups by strand (${MINP}+ answers, under ${DEVEL}%)</h4><ul class="rp-ul">${a.reteach.map(g=>`<li><b>${E(g.strand)}:</b> ${g.who.map(x=>E(nm[x.id])).join(', ')}${g.stretch?` <small>· ${g.stretch} secure student${g.stretch>1?'s':''} could help</small>`:''}</li>`).join('')}</ul>`:''}`;
 const sRows=a.stu.slice().sort((x,y)=>(x.p??101)-(y.p??101)||nm[x.id].localeCompare(nm[y.id])).map(x=>`<tr><td>${E(nm[x.id])}</td><td class="n">${x.p==null?'–':x.p+'%'}</td>${a.strands.map(st=>`<td class="n">${x.per[st].p==null?'–':symb(x.per[st].p)+' '+x.per[st].p+'%'}</td>`).join('')}${a.hasConf?`<td class="n">${x.blind}</td><td class="n">${x.hidden}</td>`:''}</tr>`).join('');
 return`<article class="rp-doc">
 <header class="rp-h"><div><h1>Exit Ticket Diagnostic</h1><p class="rp-sub">${E(s.topic||'Untitled')}${s.year?` · Year ${E(s.year)}`:''} · ${E(MODE[s.mode]||s.mode)} · ${d}${s.demo?' · <b>DEMO DATA</b>':''}</p></div>
  <div class="rp-tiles"><div><b>${a.T.p==null?'–':a.T.p+'%'}</b>Class accuracy</div><div><b>${a.players}</b>Students</div><div><b>${a.T.n}</b>Answers</div><div><b>${a.byQ.length}</b>Questions</div></div></header>
 <section><h2>1. What to do next</h2>${a.pri.length?`<ol class="rp-pri">${a.pri.map(x=>`<li>${x}</li>`).join('')}</ol>`:'<p>Not enough data for priorities.</p>'}</section>
 <section><h2>2. Strand picture</h2><table class="rp-t"><thead><tr><th>Strand</th><th class="n">Class</th><th style="width:22%">Mastery</th><th>Status</th>${a.hasConf?'<th class="n" title="Certain but wrong">Blind spots</th><th class="n" title="Guessing but right">Hidden</th>':''}</tr></thead><tbody>${strandRows}</tbody></table>
  <p class="rp-note">Secure ${SECURE}%+ · Developing ${DEVEL}–${SECURE-1}% · Reteach under ${DEVEL}%. The status uses a shape and a word, so it prints clearly in black and white.</p></section>
 <section><h2>3. Confidence and accuracy</h2>${c4}</section>
 <section><h2>4. Question analysis</h2><table class="rp-t"><thead><tr><th class="n">#</th><th>Question</th><th class="n">Correct</th><th>Most common wrong answer</th></tr></thead><tbody>${qRows}</tbody></table></section>
 <section class="rp-brk"><h2>5. Groupings for next lesson</h2>${groups}</section>
 <section><h2>6. Student detail</h2><table class="rp-t rp-s"><thead><tr><th>Student</th><th class="n">Overall</th>${a.strands.map(st=>`<th class="n">${E(st.length>16?st.slice(0,15)+'…':st)}</th>`).join('')}${a.hasConf?'<th class="n">Blind</th><th class="n">Hidden</th>':''}</tr></thead><tbody>${sRows||'<tr><td colspan="9">No student data.</td></tr>'}</tbody></table>
  <p class="rp-note">${names==='none'?'Names are hidden: students appear as numbers.':names==='initials'?'Names shown as initials.':'Full names are shown. Keep this page private.'}${a.excluded?` ${a.excluded} deliberate saboteur answers were left out of every figure above.`:''} Sorted lowest first.</p></section>
 <footer class="rp-f">Generated by Exit Ticket · The Classroom Engine · Treat this as one data point, not a grade.</footer></article>`}

/* ================= VIEWS ================= */
function ensureViews(){if($('#report'))return;
 $('main').insertAdjacentHTML('beforeend',`<section id="report" class="view"><div class="rp-tb no-print"><button class="btn c" id="rpb" type="button">← Back</button><button class="btn" id="rpp" type="button">Print / Save as PDF</button>
  <label class="rp-lab" for="rpn">Names in report</label><select id="rpn"><option value="full">Full names</option><option value="initials">Initials</option><option value="none">Hidden (Student 1, 2…)</option></select></div><div id="rp"></div></section>
  <section id="history" class="view"><div class="panel"><div class="bar">Session history</div><div class="in"><p style="margin:0">Saved on this device only (last ${HIST_MAX} sessions). Clearing your browser data removes them.</p><div id="hl"></div><div><button class="btn c" id="hdemo" type="button">Load demo data</button></div></div></div></section>`);
 $('#rpn').value=names;
 $('#rpn').onchange=()=>{names=$('#rpn').value;ls.set('et-names',names);const o=$('#hnames');if(o)o.value=names;if(cur)$('#rp').innerHTML=render(cur)};
 $('#rpp').onclick=()=>window.print();
 $('#rpb').onclick=()=>from==='history'?showHistory():go(from);
 $('#hdemo').onclick=()=>open(demo(),'history');
 $('#hl').onclick=e=>{const b=e.target.closest('button');if(!b)return;const h=hist(),s=h.find(x=>x.id===b.dataset.id);
  if(b.dataset.a==='open'&&s)open(s,'history');
  else if(b.dataset.a==='del'){ls.set('et-hist',JSON.stringify(h.filter(x=>x.id!==b.dataset.id)));showHistory()}
  else if(b.dataset.a==='json'&&s){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(s,null,1)],{type:'application/json'}));a.download=`exit-ticket-${s.mode}-${s.id}.json`;a.click()}}}
function open(s,f){ensureViews();cur=s;from=f||'home';$('#rpn').value=names;$('#rp').innerHTML=render(s);go('report')}
function showHistory(){ensureViews();const h=hist();
 $('#hl').innerHTML=h.length?`<ul class="rp-hist">${h.map(s=>{const t=s.log.filter(r=>r.role!=='saboteur'),p=pct(t.filter(r=>r.correct).length,t.length);
  return`<li><div><b>${E(s.topic||'Untitled')}</b>${s.demo?' <span class="tag">demo</span>':''}<br><small>${E(MODE[s.mode]||s.mode)} · ${new Date(s.at).toLocaleString('en-NZ',{dateStyle:'medium',timeStyle:'short'})} · ${new Set(s.log.map(r=>r.playerId)).size} students · ${p==null?'–':p+'%'}</small></div>
  <div class="rp-act"><button class="btn c" data-a="open" data-id="${s.id}" type="button">Open report</button><button class="btn" data-a="json" data-id="${s.id}" type="button">JSON</button><button class="btn" data-a="del" data-id="${s.id}" type="button" aria-label="Delete this session">Delete</button></div></li>`}).join('')}</ul>`:'<p><b>No saved sessions yet.</b> Finish a game and it is saved here automatically. Or load demo data to see what a report looks like.</p>';
 go('history')}

/* ================= DEMO DATA ================= */
function demo(){let sd=20260908;const R=()=>{sd=(sd*1664525+1013904223)>>>0;return sd/4294967296};
 const S=['Number and Algebra','Geometry and Measurement','Statistics'];
 const mk=(q,o,c,e,s)=>({question:q,options:o,correct:c,explanation:e,strand:s});
 const qs=[mk('What is 3/4 + 1/8?',['4/12','7/8','1','3/32'],'7/8','3/4 = 6/8, so 6/8 + 1/8 = 7/8.',S[0]),
  mk('Which is the same as 0.25?',['2/5','1/4','1/25','25/10'],'1/4','0.25 is 25 hundredths = 1/4.',S[0]),
  mk('What is 40% of 60?',['24','20','240','6'],'24','10% is 6, so 40% is 24.',S[0]),
  mk('Solve: 3 × ? = 4.5 × 2',['2','3','4.5','6'],'3','4.5 × 2 = 9 and 3 × 3 = 9.',S[0]),
  mk('A rectangle is 8 cm by 5 cm. What is its perimeter?',['40 cm','13 cm','26 cm','18 cm'],'26 cm','2 × (8 + 5) = 26.',S[1]),
  mk('What is the area of that rectangle?',['40 cm²','26 cm²','13 cm²','45 cm²'],'40 cm²','8 × 5 = 40.',S[1]),
  mk('How many degrees are in a right angle?',['45','180','90','360'],'90','A right angle is a quarter turn: 90°.',S[1]),
  mk('Class scores were 4, 6, 6, 8, 10. What is the mode?',['6','8','6.8','10'],'6','The mode is the most common value.',S[2]),
  mk('Same scores: what is the mean?',['6','6.8','8','34'],'6.8','Total 34 ÷ 5 = 6.8.',S[2]),
  mk('Which graph best shows change over time?',['Pie chart','Line graph','Pictogram','Tally chart'],'Line graph','Line graphs show trends over time.',S[2])];
 const NM=['Aroha','Tane','Mia','Liam','Ruby','Kahu','Zoe','Noah','Isla','Rawiri','Ella','Jack','Maia','Finn','Lily','Hemi','Anika','Sam','Tia','Eli','Ngaio','Josh','Kora','Ben'];
 /* strand difficulty, plus one planted misconception (Q2: many pick 2/5) and a few confident-wrong students */
 const diff=[.7,.55,.6,.45,.85,.6,.9,.8,.5,.75],log=[];
 NM.forEach((n,pi)=>{const ab=.35+R()*.6,overconf=pi%6===1;
  qs.forEach((q,qi)=>{const ok=R()<Math.min(.97,Math.max(.05,diff[qi]*ab*1.35));let ch=q.correct;
   if(!ok){const w=q.options.filter(o=>o!==q.correct);ch=qi===1&&R()<.7?'2/5':w[R()*w.length|0]}
   const conf=ok?(R()<.6?3:R()<.6?2:1):(overconf||R()<.25?3:R()<.5?1:2);
   log.push({playerId:'d'+pi,name:n,avatarId:pi%10+1,qIndex:qi,strand:q.strand,difficulty:'',chosen:ch,correct:ok,timeMs:4000+R()*12000|0,confidence:conf,timedOut:false})})});
 return{id:'demo'+Date.now().toString(36),at:Date.now(),mode:'waka',topic:'Fractions, shape and data (demo)',year:'6',th:70,sec:20,questions:qs,log,demo:true}}

/* ================= HOOKS ================= */
/* a finished game is saved once, and an "Open report" button is added to the host screen */
function watch(){let G;try{G=ET.G()}catch(e){return}
 if(!G||G.phase!=='end'||!G.log||!G.log.length)return;
 if(!saved.has(G.log)){saved.add(G.log);const s=snap();if(s)saveHist(s)}
 if(!$('#rpgo')){const host=$('#pv')||$('#amain'),t=document.querySelector('#pv .warn button.c,#amain .warn button.c,#sbmain .warn button.c')||document.querySelector('#pv .warn button,#amain .warn button,#sbmain .warn button');
  if(t)t.parentNode.insertAdjacentHTML('beforeend','<button class="btn" id="rpgo" type="button">Print report</button>');
  const b=$('#rpgo');if(b)b.onclick=()=>{const s=snap();if(s)open(s,'play')}}}
setInterval(watch,1000);

function init(){ensureViews();
 /* nav link + host-screen settings */
 const nav=document.querySelector('nav .wrap > div:last-child');
 if(nav&&!$('#hnav'))nav.insertAdjacentHTML('afterbegin','<a id="hnav" class="h" href="#history" role="button">Session history</a>');
 $('#hnav')?.addEventListener('click',e=>{e.preventDefault();showHistory()});
 if($('#hmsg')&&!$('#hnames'))$('#hmsg').insertAdjacentHTML('beforebegin',`<div class="row" style="grid-template-columns:1fr 1fr"><div><label for="hnames">Names in report</label><select id="hnames"><option value="full">Full names</option><option value="initials">Initials</option><option value="none">Hidden (Student 1, 2…)</option></select></div><div><label>Try the report</label><button class="btn c" id="hdemo2" type="button" style="padding:10px 18px">Load demo data</button></div></div>`);
 const hn=$('#hnames');if(hn){hn.value=names;hn.onchange=()=>{names=hn.value;ls.set('et-names',names);$('#rpn').value=names}}
 $('#hdemo2')?.addEventListener('click',()=>open(demo(),'host'));
 /* static footer link */
 const f=document.querySelector('footer .wrap');if(f&&!$('#hfoot'))f.insertAdjacentHTML('beforeend',' · <a id="hfoot" href="#history" style="color:inherit">Session history</a>');
 $('#hfoot')?.addEventListener('click',e=>{e.preventDefault();showHistory()})}
addEventListener('load',init);

window.RP={analyse,open,demo,history:showHistory,render,_names:v=>{names=v}};
})();
