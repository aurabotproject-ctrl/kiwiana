/* THE KNOWLEDGE AUCTION (metacognition): host board + student device.
   Plugs into js/waka.js through window.ET (shared PeerJS room, join, lobby, avatars, sounds).
   The host is the single source of truth. The correct answer is ONLY ever sent inside au_rev.

   host -> student
     au_topic {i,n,strand,bal,fin,mercy}                   topic reveal: strand only
     au_bid   {i,n,strand,bal,min,max,fin,left,locked,w,dd,ins,ddOk,insOk}
     au_q     {i,n,q,opts,left,w,dd,ins,ans}               question + this student's shuffled options
     au_rev   {ok,correct,exp,delta,bal,w,dd,ins,streak,timedOut}
     au_time  {left}   au_hold {msg}   au_end {bal,badge}
   student -> host
     au_lock  {i,w,dd,ins}      au_ans {i,v}

   Phases: lobby -> topic -> bid -> q -> rev -> (topic ...) -> end
   Per-answer log row: {playerId,name,avatarId,qIndex,strand,difficulty,chosen,correct,timeMs,
     confidence (derived from wager: 10-39=1, 40-69=2, 70+=3),wager,role,powerUpUsed,timedOut,
     delta,balanceAfter,finalRound,charity}. Option-selection distribution per question: G.dist[i].counts */
(()=>{
const {E,av,SH,SYM,LET,beep,good,bad,sv}=ET;
const g=()=>ET.G(),P=()=>Object.values(g().p),ACT=()=>P().filter(p=>p.on);
const send=(p,m)=>{const c=g().c[p.id];if(c&&p.on){try{c.send(m)}catch(e){}}};
const left=()=>{const G=g();return G.endAt?Math.max(0,G.endAt-Date.now()):0};
const coin=n=>`<span class="coin" aria-hidden="true"></span>${n}`;
const confOf=w=>w>=70?3:w>=40?2:1;
/* normal max bid is 100 (never more than the balance). The final lot allows up to half the balance. */
const cap=(bal,fin)=>{let m=Math.min(100,bal);if(fin)m=Math.max(m,Math.floor(bal/2));return Math.max(10,Math.floor(m/5)*5)};
const BADGE={
 sharp:{n:'Sharp Judge',i:'⚖️',d:'Your bids matched what you really knew.'},
 hunter:{n:'Blind Spot Hunter',i:'🔍',d:'You knew where your gaps were and kept those bids small.'},
 brave:{n:'Brave Bidder',i:'🦁',d:'You backed yourself with big bids.'},
 cat:{n:'Careful Cat',i:'🐱',d:'You bid carefully and protected your coins.'}};
function badgeKey(p){const G=g(),r=G.log.filter(x=>x.playerId===p.id&&!x.timedOut),n=r.length||1;
 const match=r.reduce((s,x)=>s+(x.confidence===2?.5:((x.confidence===3)===x.correct?1:0)),0)/n;
 const wr=r.filter(x=>!x.correct),lowWr=wr.filter(x=>x.confidence===1).length;
 const avg=r.reduce((s,x)=>s+x.wager,0)/n;
 if(r.length>=3&&match>=.7)return'sharp';
 if(wr.length>=2&&lowWr/wr.length>=.6)return'hunter';
 return avg>=50?'brave':'cat'}

/* ================= HOST ================= */
const panel=(bar,inner)=>`<div class="panel" style="margin:0"><div class="bar">${bar}</div><div class="in">${inner}</div></div>`;
const ctl=x=>`<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px">${x}<button class="btn" style="background:var(--paper)" onclick="AU.stop()">End game</button></div>`;

function start(){const G=g();G.i=-1;G.log=[];G.dist=[];G.mercies=0;G.bidSec=G.sec?Math.min(15,G.sec):0;
 P().forEach(p=>Object.assign(p,{bal:500,ddUsed:false,insUsed:false,streak:0,rev:null,endMsg:null,locked:false,ans:null,w:null,dd:false,ins:false,mercy:0}));
 go('play');board();next()}

function board(){$('#pv').innerHTML=`<div class="ab"><div id="amain"></div><aside class="aside">
 <div class="panel" style="margin:0"><div class="bar">The vault</div><div class="in" style="text-align:center"><div class="cwrap"><div id="cst" class="cstack"></div></div><div class="big" id="cavg" aria-live="polite"></div></div></div>
 <div class="panel" style="margin:24px 0 0"><div class="bar">Top 5</div><div class="in"><ol class="lb" id="lb"></ol></div></div></aside></div>`;side()}

const lbHtml=()=>P().length?[...P()].sort((a,b)=>b.bal-a.bal||a.name.localeCompare(b.name)).slice(0,5)
 .map((p,i)=>`<li><span class="rk">${i+1}</span>${av(p.av)}<b>${p.name}</b><span class="cs">${p.bal}</span></li>`).join(''):'<li>No bidders yet.</li>';
function side(){const st=$('#cst');if(!st)return;const ps=P(),avg=ps.length?Math.round(ps.reduce((s,p)=>s+p.bal,0)/ps.length):0;
 st.style.height=Math.max(14,Math.min(225,avg/500*95))+'px';$('#cavg').innerHTML='Class average<br>'+coin(avg);$('#lb').innerHTML=lbHtml()}

/* messages */
const topicMsg=p=>{const G=g();return{t:'au_topic',i:G.i,n:Q.length,strand:Q[G.i].strand,bal:p.bal,fin:G.fin,mercy:p.mercy||0}};
const bidMsg=p=>{const G=g();return{t:'au_bid',i:G.i,n:Q.length,strand:Q[G.i].strand,bal:p.bal,min:10,max:cap(p.bal,G.fin),fin:G.fin,left:left(),locked:p.locked,w:p.w,dd:p.dd,ins:p.ins,ddOk:!p.ddUsed,insOk:!p.insUsed,mercy:p.mercy||0}};
const qMsg=p=>{const G=g();if(p.oi!==G.i){p.opts=ET.SHO(Q[G.i].options);p.oi=G.i}
 return{t:'au_q',i:G.i,n:Q.length,q:Q[G.i].question,opts:p.opts,left:left(),w:p.w,dd:p.dd,ins:p.ins,ans:p.ans?p.opts.indexOf(p.ans.v):-1}};
const endMsg=p=>({t:'au_end',bal:p.bal,badge:BADGE[badgeKey(p)]});

/* a student (re)joins, or a late joiner arrives: give them a fair balance and the current screen */
function join(p){const G=g();
 if(p.bal==null){const o=P().filter(x=>x!==p&&x.bal!=null);
  Object.assign(p,{bal:G.phase==='lobby'||!o.length?500:Math.round(o.reduce((s,x)=>s+x.bal,0)/o.length),ddUsed:false,insUsed:false,streak:0,locked:false,ans:null,w:null,dd:false,ins:false,mercy:0})}
 if(G.phase==='lobby')return;
 const ph=G.phase;
 if(ph==='topic')send(p,topicMsg(p));
 else if(ph==='bid')send(p,bidMsg(p));
 else if(ph==='q'){if(!p.locked)lock(p,10,0,0);send(p,qMsg(p))}
 else if(ph==='rev')send(p,p.rev||{t:'au_hold',msg:'This lot is over. The next one starts soon!'});
 else if(ph==='end')send(p,p.endMsg||endMsg(p));
 upd();side()}
function drop(){const G=g();upd();side();if(G.phase==='bid')chkBid();else if(G.phase==='q')chkQ()}

function host(c,d){const G=g(),p=ET.pOf(c);if(!p)return;
 if(d.t==='au_lock'&&G.phase==='bid'&&d.i===G.i){lock(p,d.w,d.dd,d.ins);upd();chkBid()}
 else if(d.t==='au_ans'&&G.phase==='q'&&d.i===G.i&&p.locked&&!p.ans&&(p.opts||[]).includes(d.v)){p.ans={v:d.v,ms:Date.now()-G.t0};upd();chkQ()}}

/* never trust the client: clamp the wager, and power-ups only if still unused */
function lock(p,w,dd,ins){const G=g();if(p.locked)return;
 w=Math.round((+w||10)/5)*5;w=Math.min(cap(p.bal,G.fin),Math.max(10,w));
 p.dd=!!dd&&!p.ddUsed;p.ins=!!ins&&!p.insUsed;if(p.dd)p.ddUsed=true;if(p.ins)p.insUsed=true;p.w=w;p.locked=true}

/* round flow */
function next(){const G=g();G.i++;if(G.i>=Q.length)return finish();
 clearInterval(G.tm);G.fin=G.i===Q.length-1;G.phase='topic';
 P().forEach(p=>{p.w=null;p.locked=false;p.ans=null;p.dd=p.ins=false;p.rev=null;p.mercy=0;
  if(G.i>0&&p.bal<=20){p.bal+=50;p.mercy=50;G.mercies++}}); /* Charity Bid: nobody is out */
 ACT().forEach(p=>send(p,topicMsg(p)));renderTopic();side();
 G.tm=setTimeout(openBids,3200)}
function openBids(){const G=g();if(G.phase!=='topic')return;G.phase='bid';G.t0=Date.now();G.endAt=G.bidSec?G.t0+G.bidSec*1e3:0;
 ACT().forEach(p=>send(p,bidMsg(p)));renderBid();run()}
function closeBids(){const G=g();if(G.phase!=='bid')return;clearInterval(G.tm);
 ACT().forEach(p=>{if(!p.locked)lock(p,10,0,0)}); /* timer ended: auto-lock at the minimum */
 openQ()}
function openQ(){const G=g();G.phase='q';G.t0=Date.now();G.endAt=G.sec?G.t0+G.sec*1e3:0;
 ACT().forEach(p=>{p.opts=ET.SHO(Q[G.i].options);p.oi=G.i;send(p,qMsg(p))});renderQ();run()}
function run(){const G=g();clearInterval(G.tm);G.tm=setInterval(()=>{if(G.endAt&&Date.now()>=G.endAt){G.phase==='bid'?closeBids():reveal()}else renderT()},250)}
function chkBid(){const G=g();if(G.phase==='bid'&&ACT().length&&ACT().every(p=>p.locked))setTimeout(()=>G.phase==='bid'&&closeBids(),700)}
function chkQ(){const G=g();if(G.phase==='q'&&ACT().length&&ACT().every(p=>p.ans))setTimeout(()=>G.phase==='q'&&reveal(),700)}
function more(){const G=g();if(G.endAt){G.endAt+=1e4;ACT().forEach(p=>send(p,{t:'au_time',left:left()}))}}
function stop(){if(confirm('End the auction now? Scores so far are kept.'))finish()}

function reveal(){const G=g();if(G.phase!=='q')return;G.phase='rev';clearInterval(G.tm);
 const q=Q[G.i],ps=P().filter(p=>p.locked&&(p.on||p.ans)),dist={},wrong={};q.options.forEach(o=>dist[o]=0);
 let okN=0,wSum=0,net=0;
 ps.forEach(p=>{const a=p.ans,ok=!!a&&a.v===q.correct,mult=p.dd?2:1;
  let delta=ok?p.w*mult:-Math.round(p.w*mult*(p.ins?.5:1));
  delta=Math.max(delta,-p.bal);p.bal+=delta;p.streak=ok?p.streak+1:0;
  if(a){dist[a.v]++;if(!ok)wrong[a.v]=(wrong[a.v]||0)+1}if(ok)okN++;wSum+=p.w;net+=delta;
  G.log.push({playerId:p.id,name:p.name,avatarId:p.av+1,qIndex:G.i,strand:q.strand,difficulty:q.difficulty||'',chosen:a?a.v:'',correct:ok,
   timeMs:a?a.ms:G.sec*1e3,confidence:confOf(p.w),wager:p.w,role:'',powerUpUsed:[p.dd&&'doubleDown',p.ins&&'insurance'].filter(Boolean).join('+'),
   timedOut:!a,delta,balanceAfter:p.bal,finalRound:!!G.fin,charity:p.mercy||0});
  p.rev={t:'au_rev',ok,correct:q.correct,exp:q.explanation,delta,bal:p.bal,w:p.w,dd:p.dd,ins:p.ins,streak:p.streak,timedOut:!a};send(p,p.rev)});
 const acc=ps.length?okN/ps.length*100:0,avgW=ps.length?Math.round(wSum/ps.length):0,tot=Object.values(dist).reduce((s,n)=>s+n,0),wr=Object.entries(wrong).sort((a,b)=>b[1]-a[1])[0];
 G.dist[G.i]={qIndex:G.i,strand:q.strand,counts:dist,accuracy:Math.round(acc),avgWager:avgW};
 $('#amain').innerHTML=`<div class="warn ${acc>=50?'okc':''}"><span class="tag">${E(q.strand)}</span>
  <div class="big" style="margin:10px 0">${okN} of ${ps.length} got it · ${Math.round(acc)}%</div>
  <p style="font-size:22px">Answer: <b>${E(q.correct)}</b>. ${E(q.explanation)}</p>
  <div class="dists" aria-label="How many chose each option">${q.options.map(o=>`<div class="dr ${o===q.correct?'ok':''}"><span class="dt">${E(o)}${o===q.correct?' ✔':''}</span><div class="bar2"><div style="width:${tot?dist[o]/tot*100:0}%"></div></div><span>${dist[o]}</span></div>`).join('')}</div>
  <p style="font-size:20px">Class average bid <b>${avgW}</b> · vault ${net>=0?'+':'−'}${Math.abs(net)} coins</p>
  ${wr?`<p style="font-size:20px"><b>Ask the class:</b> why might “${E(wr[0])}” seem right? (${wr[1]} chose it)</p>`:''}
  ${ctl(`<button class="btn k" onclick="AU.next()">${G.i+1>=Q.length?'Finish':'Next lot'}</button>`)}</div>`;
 side();acc>=50?good():bad()}

function finish(){const G=g();FX.confetti();clearInterval(G.tm);G.phase='end';const tally={};
 P().forEach(p=>{const k=badgeKey(p);p.badge=k;tally[k]=(tally[k]||0)+1;p.endMsg=endMsg(p);send(p,p.endMsg)});
 const rows=G.log.filter(x=>!x.timedOut),okN=rows.filter(x=>x.correct).length,
  blind=rows.filter(x=>x.wager>=70&&!x.correct),hidden=rows.filter(x=>x.wager<40&&x.correct),by={};
 blind.forEach(x=>by[x.strand]=(by[x.strand]||0)+1);const worst=Object.entries(by).sort((a,b)=>b[1]-a[1])[0];
 if(!$('#amain'))board();else side();
 $('#amain').innerHTML=`<div class="warn okc"><div class="stk">Auction closed! 🔨</div>
  <h2 style="margin:18px 0 8px">Class accuracy: ${rows.length?Math.round(okN/rows.length*100):0}%</h2>
  <p style="font-size:20px;margin:0 0 14px"><b>${blind.length}</b> big bids (70+) missed${worst?`, mostly in <b>${E(worst[0])}</b>`:''}. <b>${hidden.length}</b> small bids (under 40) were right: hidden knowledge to celebrate. Names are in the CSV and JSON for your eyes only.</p>
  <div class="players" style="margin-bottom:16px">${Object.entries(tally).map(([k,n])=>`<span class="chip">${BADGE[k].i} ${BADGE[k].n} ×${n}</span>`).join('')}</div>
  <div style="display:flex;gap:12px;flex-wrap:wrap"><button class="btn k" onclick="AU.again()">Play again, same questions</button><button class="btn" onclick="AU.csv()">Download CSV</button><button class="btn c" onclick="AU.json()">Download JSON</button></div></div>`;
 good();setTimeout(()=>beep(1100,.4),300)}

/* host screens */
function renderTopic(){const G=g(),q=Q[G.i];
 $('#amain').innerHTML=panel(`Lot ${G.i+1} of ${Q.length} · The Knowledge Auction`,`<div style="text-align:center;display:grid;gap:14px;justify-items:center">
  <img class="aimg" src="assets/auction.png" alt="" onerror="this.style.display='none'"><div class="gv bang" aria-hidden="true">🔨</div>
  <span class="tag c">${G.fin?'FINAL AUCTION':'Going once…'}</span><div class="big" style="font-size:clamp(40px,7vw,96px)">${E(q.strand)}</div>
  <p style="font-size:22px;margin:0">${G.fin?'Last lot! Bids can go up to half your coins.':'How well do you know this? Bidding opens in a moment.'}</p></div>`);
 beep(180,.12,'square');setTimeout(()=>beep(120,.18,'square'),140)}
function renderBid(){const G=g(),q=Q[G.i];
 $('#amain').innerHTML=panel(`Lot ${G.i+1} of ${Q.length} · Bidding · <span id="tl"></span>`,`<div class="d" style="font-size:clamp(34px,5vw,64px)">${E(q.strand)}</div>
  <div class="big">Place your bids! Bid big only if you are sure.</div><div class="big" id="cnt" aria-live="polite"></div><div class="bar2"><div id="cbar" style="width:0"></div></div>
  ${ctl('<button class="btn" onclick="AU.close()">Close bidding</button><button class="btn c" onclick="AU.more()">+10s</button>')}`);upd();renderT()}
function renderQ(){const G=g(),q=Q[G.i],a=ACT(),avgW=a.length?Math.round(a.reduce((s,p)=>s+(p.w||0),0)/a.length):0;
 $('#amain').innerHTML=panel(`Lot ${G.i+1} of ${Q.length} · ${E(q.strand)} · <span id="tl"></span>`,`<div class="big">${E(q.question)}</div>
  <div class="ans">${q.options.map(o=>`<div class="mode" style="font-size:24px;cursor:default">${E(o)}</div>`).join('')}</div>
  <div class="big" id="cnt" aria-live="polite"></div><div class="bar2"><div id="cbar" style="width:0"></div></div>
  <p style="font-size:20px;margin:0">Class average bid: <b>${avgW}</b> coins</p>
  ${ctl('<button class="btn" onclick="AU.reveal()">Reveal now</button><button class="btn c" onclick="AU.more()">+10s</button>')}`);upd();renderT()}
function upd(){const c=$('#cnt');if(!c)return;const G=g(),a=ACT(),n=a.filter(p=>G.phase==='bid'?p.locked:p.ans).length;
 c.textContent=G.phase==='bid'?`${n} of ${a.length} bids locked in`:`${n} of ${a.length} bidders have answered`;$('#cbar').style.width=(a.length?n/a.length*100:0)+'%'}
function renderT(){const t=$('#tl');if(t){const G=g();t.textContent=G.endAt?Math.max(0,Math.ceil((G.endAt-Date.now())/1e3))+'s':'untimed'}}

/* exports (CSV text is neutralised so a student name starting with = can't run as a formula) */
const cell=v=>{let s=String(v);if(typeof v==='string'&&/^[=+\-@]/.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`};
const dl=(name,type,text)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click()};
function csv(){const G=g(),k=Object.keys(G.log[0]||{playerId:1});dl('auction-answers.csv','text/csv',[k.join(',')].concat(G.log.map(o=>k.map(x=>cell(o[x])).join(','))).join('\n'))}
function json(){const G=g();dl('auction-session.json','application/json',JSON.stringify({mode:'auction',topic:G.topic,year:$('#yr').value,secondsPerQuestion:G.sec,startingCoins:500,
 questions:Q,players:P().map(p=>({playerId:p.id,name:p.name,avatarId:p.av+1,finalCoins:p.bal,badge:BADGE[p.badge||badgeKey(p)].n})),log:G.log,perQuestion:G.dist,charityBids:G.mercies},null,1))}

window.AU={next,close:closeBids,reveal,more,stop,again:start,csv,json};

/* ================= STUDENT ================= */
let T=null,END=0,B={};
function clock(ms){END=ms?Date.now()+ms:0;clearInterval(T);if(!END)return;
 const tick=()=>{const t=$('#st');if(!t){clearInterval(T);return 0}const s=Math.max(0,Math.ceil((END-Date.now())/1e3));t.textContent=s+'s';return s};
 tick();T=setInterval(()=>{const s=tick();if(s>0&&s<=5)beep(900,.05)},500)}
const wcard=(cls,inner)=>sv(`<div class="warn ${cls}" style="text-align:center">${inner}</div>`);
const puText=(dd,ins)=>[dd&&'✖2 Double Down',ins&&'🛡️ Insurance'].filter(Boolean).join(' + ');

function student(d){
 if(d.t==='au_time'){END=Date.now()+d.left;return}
 clearInterval(T);
 if(d.t==='au_topic'){
  wcard('okc',`<span class="tag">${d.fin?'FINAL AUCTION':`Lot ${d.i+1} of ${d.n}`}</span><div class="d" style="font-size:36px;margin:14px 0">${E(d.strand)}</div>
   <p>How well do you know this? Get ready to bid.</p><p class="bal">${coin(d.bal)} coins</p>
   ${d.mercy?`<p><b>Charity bid! +${d.mercy} coins so you stay in the game 💛</b></p>`:''}`);beep(300,.1,'square')}
 else if(d.t==='au_bid')bidV(d);
 else if(d.t==='au_q')qV(d);
 else if(d.t==='au_rev')revV(d);
 else if(d.t==='au_hold')wcard('',`<p class="big">${E(d.msg)}</p>`);
 else if(d.t==='au_end'){
  wcard('okc',`<div class="stk">Auction closed!</div><p class="bal" style="margin-top:18px">${coin(d.bal)} coins</p>
   <div class="panel" style="margin:12px 0;box-shadow:5px 5px 0 var(--ink)"><div class="in"><div style="font-size:48px" aria-hidden="true">${d.badge.i}</div><h2>${d.badge.n}</h2><p style="margin:0">${d.badge.d}</p></div></div>
   <p>Your badge shows how well your bids matched what you knew. Great playing, ${ET.S().name}!</p>`);good();setTimeout(()=>beep(1100,.4),300)}}

function bidV(d){
 if(d.locked)return lockedV(d.w,d.dd,d.ins);
 B={i:d.i,w:Math.min(d.max,Math.max(d.min,50)),dd:false,ins:false};
 const qb=[['Low',20],['Medium',50],['Big',100]];if(d.fin&&d.max>100)qb.push(['Huge',d.max]);
 sv(`<div class="panel" style="margin:0"><div class="bar">Lot ${d.i+1} of ${d.n} · ${E(d.strand)} <span id="st" style="float:right"></span></div><div class="in">
  <div class="bal" aria-live="polite">${coin('You have <b>'+d.bal+'</b> coins')}</div>
  ${d.mercy?`<p style="margin:0"><b>Charity bid! +${d.mercy} coins 💛</b></p>`:''}
  ${d.fin?`<p style="margin:0"><b>Final auction!</b> You can bid up to ${d.max}.</p>`:''}
  <output class="wg" id="wv" for="ws">${B.w}</output>
  <div><label for="ws">Your bid: win it or lose it if you are wrong</label><input id="ws" type="range" min="${d.min}" max="${d.max}" step="5" value="${B.w}"></div>
  <div class="qb">${qb.map(([n,v])=>{v=Math.min(d.max,Math.max(d.min,v));return `<button data-w="${v}">${n} ${v}</button>`}).join('')}</div>
  <div class="pu"><button data-k="dd" aria-pressed="false" ${d.ddOk?'':'disabled'}>✖2 Double Down${d.ddOk?'':' (used)'}</button><button data-k="ins" aria-pressed="false" ${d.insOk?'':'disabled'}>🛡️ Insurance${d.insOk?'':' (used)'}</button></div>
  <small>Double Down doubles your win or loss. Insurance halves a loss. Once each per game.</small>
  <button class="btn" id="lk">Lock in</button></div></div>`);
 const ws=$('#ws'),set=v=>{B.w=Math.min(d.max,Math.max(d.min,Math.round(v/5)*5));ws.value=B.w;$('#wv').textContent=B.w};
 ws.oninput=()=>set(+ws.value);
 document.querySelectorAll('.qb button').forEach(b=>b.onclick=()=>{set(+b.dataset.w);beep(500,.05)});
 document.querySelectorAll('.pu button').forEach(b=>b.onclick=()=>{B[b.dataset.k]=!B[b.dataset.k];b.setAttribute('aria-pressed',B[b.dataset.k]);beep(B[b.dataset.k]?700:400,.05)});
 $('#lk').onclick=()=>{ET.S().k.send({t:'au_lock',i:B.i,w:B.w,dd:B.dd,ins:B.ins});lockedV(B.w,B.dd,B.ins);beep(660,.08);navigator.vibrate?.(30)};
 clock(d.left)}
function lockedV(w,dd,ins){clearInterval(T);wcard('okc',`<div class="stk">Bid locked in!</div><p class="bal" style="margin-top:18px">${coin(w)}</p>${dd||ins?`<p>${puText(dd,ins)}</p>`:''}<p>Waiting for the other bidders…</p>`)}

function qV(d){
 const opts=d.opts,pre=d.ans>=0;
 sv(`<div class="panel" style="margin:0"><div class="bar">Lot ${d.i+1} of ${d.n} <span id="st" style="float:right"></span></div><div class="in">
  <div class="bal">Your bid: ${coin(d.w)}${d.dd||d.ins?` <small>${puText(d.dd,d.ins)}</small>`:''}</div>
  <div style="font:800 22px Syne">${E(d.q)}</div>
  <div class="ans" id="as">${opts.map((o,i)=>`<button data-i="${i}" aria-label="${LET[i]}: ${E(o)}" ${pre?'disabled':''} ${d.ans===i?'aria-pressed="true"':''}><b>${LET[i]}</b><span class="shp" aria-hidden="true">${SYM[i]}</span>${E(o)}</button>`).join('')}</div>
  <div id="cf" aria-live="polite">${pre?'<p><b>Answer locked in. Eyes up!</b></p>':''}</div></div></div>`);
 $('#as').onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;
  document.querySelectorAll('#as button').forEach(x=>x.disabled=true);b.setAttribute('aria-pressed',true);
  ET.S().k.send({t:'au_ans',i:d.i,v:opts[+b.dataset.i]});navigator.vibrate?.(30);$('#cf').innerHTML='<p><b>Answer locked in. Eyes up!</b></p>'};
 clock(d.left)}

function revV(d){
 if(navigator.userActivation?.hasBeenActive)navigator.vibrate?.(d.ok?[40]:[80,40,80]);d.ok?good():bad();
 const msg=d.ok?['Nailed it!','Great judgement!','Yes!'][Math.random()*3|0]:d.timedOut?'Time ran out. Next one!':['So close!','Not yet!','Mistakes grow brains!'][Math.random()*3|0];
 const notes=[d.dd&&(d.ok?'✖2 Double Down paid off!':'✖2 Double Down doubled the loss. Brave try!'),d.ins&&(d.ok?'🛡️ Insurance was not needed this time.':'🛡️ Insurance saved half your bid.')].filter(Boolean);
 wcard(d.ok?'okc':'',`<div class="stk">${msg}</div>
  <div class="fl ${d.delta>=0?'up':'dn'}" role="status">${d.delta>0?'▲ +':d.delta<0?'▼ −':''}${Math.abs(d.delta)}</div>
  <p class="bal">${coin(d.bal)} coins</p>${notes.map(n=>`<p style="margin:4px 0"><b>${n}</b></p>`).join('')}
  ${d.streak>=3?`<p class="big">🔥 ${d.streak} in a row!</p>`:''}
  <p style="font-size:20px"><b>Answer: ${E(d.correct)}</b></p><p>${E(d.exp)}</p><p>Watch the main screen.</p>`)}

ET.eng.auction={start,join,drop,host,student};

/* host setup: the pass threshold only matters for Waka */
document.querySelectorAll('#mm .mode').forEach(b=>b.addEventListener('click',()=>{const t=$('#th');if(t)t.parentNode.style.display=b.dataset.m==='auction'?'none':''}));
})();
