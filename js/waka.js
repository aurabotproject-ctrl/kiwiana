/* THE GREAT WAKA ESCAPE: host + student. Overrides the shell's #open and #jb handlers.
Protocol: join{name,av,pid} welcome{pid,name,av} lobby{n} q{i,n,opts,left} answer{i,v} conf{i,c} reveal{ok,correct,exp} end{win} rx{e} (lobby reaction, e = 0..2, host rate-limits 1 per 2s) */
(()=>{
const E=s=>String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const AV=[
['kea','Kea','alpine parrot','Kea are clever enough to solve puzzles.','Cheeky flip + two-note squawk',[[900,.07],[1250,.1]]],
['kakapo','Kākāpō','flightless night parrot','The kākāpō is the world\'s heaviest parrot.','Wobbly bounce + low boom',[[110,.3]]],
['kiwi','Kiwi','kiwi','Kiwi have nostrils at the tip of their beak.','Dash across the badge + soft boop',[[420,.12]]],
['tui','Tūī','tūī','Tūī can sing two notes at once.','Music-note burst + double chirp',[[1300,.06],[1700,.06],[1300,.06]]],
['piwakawaka','Pīwakawaka','fantail','Fantails flit around you to catch insects.','Tail-fan sparkle + fast trill',[[1500,.04],[1800,.04],[1500,.04],[1800,.04],[1500,.04]]],
['tuatara','Tuatara','tuatara','Tuatara have a "third eye" on top of their head.','Slow cool nod + deep chime',[[330,.35]]],
['hoiho.','Hoiho','yellow-eyed penguin','Hoiho are among the rarest penguins on Earth.','Flipper wave + cheerful honk',[[260,.15],[330,.2]]],
['maui-dolphin','Māui dolphin','Māui dolphin','Māui dolphins are the smallest dolphins in the world.','Splash leap + bubbly whistle',[[800,.05],[1200,.05],[1000,.05],[1500,.08]]],
['weta','Giant weta','giant wētā','Some giant wētā are heavier than a sparrow.','Fist pump + crunchy crick',[[200,.04,'square'],[180,.05,'square']]],
['ruru','Ruru','morepork owl','Ruru can turn their heads nearly all the way round.','Head swivel + two-note hoot',[[420,.2],[330,.3]]]];
const avSound=i=>{let t=0;AV[i][5].forEach(n=>{setTimeout(()=>beep(n[0],n[1]+.05,n[2]||'sine'),t*1e3);t+=n[1]+.04})};
const col=()=>{try{return JSON.parse(ls.get('et-col')||'[]')}catch(e){return[]}};
const mark=i=>{const c=col();if(!c.includes(i)){c.push(i);ls.set('et-col',JSON.stringify(c))}};
const av=i=>`<img class="av" src="assets/avatars/avatar-${String(i+1).padStart(2,'0')}-${AV[i][0]}.png" alt="${AV[i][1]}" onerror="this.style.opacity=0">`;
const SH=a=>{a=[...a];for(let i=a.length;i>1;){const j=Math.random()*i--|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const SYM=['▲','●','■','◆'],LET='ABCD';
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
let ac;const beep=(f,d=.15,t='sine')=>{if(window.ET&&(ET.quiet||ET.pq))return;try{ac=ac||new AudioContext();const o=ac.createOscillator(),g=ac.createGain();o.type=t;o.frequency.value=f;g.gain.value=.08;o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+d)}catch(e){}};
const good=()=>{beep(660);setTimeout(()=>beep(880),120)},bad=()=>beep(150,.3,'sawtooth');

/* ---- extra host settings ---- */
$('#hmsg').insertAdjacentHTML('beforebegin',`<div class="row"><div><label for="tq">Time per question</label><select id="tq"><option value="10">10s</option><option value="20" selected>20s</option><option value="30">30s</option><option value="45">45s</option><option value="0">Untimed</option></select></div><div><label for="th">Pass threshold %</label><input id="th" type="number" min="10" max="100" value="70"></div></div>`);

/* ---- HOST ---- */
let G,peer;
$('#open').onclick=()=>{const e=parse(),m=$('#hmsg');m.className='msg bad';m.textContent=e;if(e)return;
 if(mode!=='waka'&&!ET.eng[mode]){m.textContent="That game mode didn't load. Refresh the page and try again.";return}
 openRoom()};
let rty=0;
function openRoom(fixed,snap){
 const code=fixed||Array.from({length:4},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random()*24|0]).join('');
 if(snap)G=snap;else{rty=0;G={code,mode,p:{},c:{},phase:'lobby',i:-1,hull:5,hist:[],log:[],fails:{},sec:+$('#tq').value,th:+$('#th').value||70,topic:$('#topic').value||'Untitled'}}
 $('#rc').textContent=code;$('#jl').textContent=location.host||'this site';$('#lbar').textContent=`${G.rs?'Resumed':'Lobby'} · ${G.topic} · Year ${$('#yr').value}`;
 $('#start').textContent=G.rs?`Resume · ${G.i+1} of ${Q.length} done`:'Start game';
 go('lobby');renderP();if(peer)peer.destroy();
 peer=new Peer('exittix-'+code);peer.on('open',()=>{ET.sig=1});peer.on('disconnected',()=>{ET.sig=0;try{peer.reconnect()}catch(e){}});
 peer.on('open',()=>{if(G.rs)return renderP();$('#lmsg').className='msg ok';$('#lmsg').textContent='Lobby open. Waiting for students.'});
 peer.on('error',e=>{if(e.type==='unavailable-id'){
   if(!fixed)return openRoom(); /* fresh lobby: just pick a new code */
   /* a resumed game must keep its code so students can rejoin. The old connection can take a little while to clear. */
   if(++rty<=20){$('#lmsg').className='msg';$('#lmsg').textContent=`Waiting for the old session to clear… (try ${rty} of 20)`;return setTimeout(()=>G&&G.code===code&&openRoom(code,G),3000)}
   $('#lmsg').className='msg bad';$('#lmsg').textContent='The old session has not cleared. Close any other tab that was hosting this game, wait a minute and press Resume again.';return}
  $('#lmsg').className='msg bad';$('#lmsg').textContent='Connection problem. Go back and open the lobby again.'});
 peer.on('connection',c=>{c.on('data',d=>hostMsg(c,d));c.on('close',()=>{const p=Object.values(G.p).find(x=>G.c[x.id]===c);if(p){p.on=false;renderP();if(G.mode!=='waka')ET.eng[G.mode].drop(p);else if(G.phase==='q')chk()}})});
}
function hostMsg(c,d){
 if(G.paused&&/^(answer|conf|au_|sb_ans|sb_conf|sb_vote)/.test(d.t))return;
 if(d.t==='join'&&G.banned&&G.banned[d.pid]){try{c.send({t:'kick'})}catch(e){}return}
 if(d.t==='join'){let p=G.p[d.pid];
  if(!p){let n=E(String(d.name).slice(0,16)),b=n,k=2;while(Object.values(G.p).some(x=>x.name===n))n=b+' '+k++;p=G.p[d.pid]={id:d.pid,name:n,av:+d.av||0,on:true,ok:0,tot:0,streak:0}}
  p.on=true;G.c[p.id]=c;c.send({t:'welcome',pid:p.id,name:p.name,av:p.av,mode:G.mode});renderP();bc({t:'lobby',n:cnt()});
  if(G.mode!=='waka')return ET.eng[G.mode].join(p);
  if(G.phase==='q'){p.opts=p.opts||ET.SHO(Q[G.i].options);sendQ(p)}if(G.phase==='end')c.send({t:'end',win:G.hull>0})}
 else if(d.t==='av'&&G.phase==='lobby'&&!G.rs){const p=pOf(c);if(p){p.av=Math.max(0,Math.min(9,+d.av|0));renderP()}}
 else if(d.t==='rx'){const p=pOf(c),n=Date.now();if(!p||G.phase!=='lobby'||n-(p.rxAt||0)<2e3)return;const e=+d.e;if(!(e>=0&&e<=2)||e%1)return;p.rxAt=n;ET.rx&&ET.rx(p,e)}
 else if(G.mode!=='waka')ET.eng[G.mode].host(c,d);
 else if(d.t==='answer'&&G.phase==='q'&&d.i===G.i){const p=pOf(c);if(!p||p.a)return;const q=Q[G.i];
  p.a={v:d.v,ok:d.v===q.correct,ms:Date.now()-G.t0};G.log.push({playerId:p.id,name:p.name,avatarId:p.av+1,qIndex:G.i,strand:q.strand,difficulty:q.difficulty||'',chosen:d.v,correct:p.a.ok,timeMs:p.a.ms,confidence:'',timedOut:false});chk();renderQ()}
 else if(d.t==='conf'){const p=pOf(c),r=G.log.findLast(x=>x.playerId===p?.id&&x.qIndex===d.i);if(r)r.confidence=d.c}}
const pOf=c=>Object.values(G.p).find(x=>G.c[x.id]===c),cnt=()=>Object.values(G.p).filter(p=>p.on).length,bc=m=>Object.values(G.c).forEach(c=>{try{c.send(m)}catch(e){}});
function renderP(){const ps=Object.values(G.p||{}),n={};
 if(G&&G.rs){const m=$('#lmsg'),on=ps.filter(p=>p.on&&!p.bot).length,all=ps.filter(p=>!p.bot).length;if(m&&!/Waiting for the old|has not cleared/.test(m.textContent)){m.className='msg ok';m.textContent=`Game restored. ${on} of ${all} students are back. Resume when most of the class has rejoined.`}}ps.forEach(p=>n[p.av]=(n[p.av]||0)+1);
 $('#pl').innerHTML=(ps.map(p=>`<span class="chip" style="${p.on?'':'opacity:.4'}">${av(p.av)} ${p.name}</span>`).join('')||'<span>No students yet.</span>')+(ps.length?`<div style="width:100%;font-weight:700">${Object.entries(n).map(([k,v])=>AV[k][1]+' ×'+v).join(' · ')}</div>`:'')}
$('#start').onclick=()=>{if(!cnt()){$('#lmsg').className='msg bad';$('#lmsg').textContent=G.rs?'Wait for at least one student to rejoin.':'Wait for at least one student.';return}
 if(G.rs){const r=G.rs;G.rs=null;G.phase=r.phase;go('play');return G.mode==='waka'?nextQ():ET.eng[G.mode].resume(r.fn)}
 G.mode==='waka'?startGame():ET.eng[G.mode].start()};
function startGame(){G.i=-1;G.hull=5;G.hist=[];G.log=[];G.fails={};G.phase='lobby';go('play');nextQ()}
function nextQ(){
 cp('next');G.i++;if(G.i>=Q.length||G.hull<=0)return endGame();
 G.phase='q';G.t0=Date.now();G.endAt=G.sec?G.t0+G.sec*1e3:0;
 Object.values(G.p).forEach(p=>{p.a=null;p.opts=ET.SHO(Q[G.i].options);if(p.on)sendQ(p)});renderQ();
 clearInterval(G.tm);G.tm=setInterval(()=>{if(G.endAt&&Date.now()>=G.endAt)resolve();else renderT()},250)}
function sendQ(p){const c=G.c[p.id];if(c&&G.phase==='q')c.send({t:'q',i:G.i,n:Q.length,opts:p.opts,left:G.endAt?G.endAt-Date.now():0,q:Q[G.i].question})}
const act=()=>Object.values(G.p).filter(p=>p.on);
function chk(){if(G.phase==='q'&&act().length&&act().every(p=>p.a))setTimeout(()=>G.phase==='q'&&resolve(),600)}
function scene(){const n=Q.length,pr=G.hist.length/n,bad=G.hist[G.hist.length-1]==='no'||G.hull<=2;return `<div class="sea" aria-hidden="true"><div id="isl" style="transform:scale(${.5+pr*.9})"><img src="assets/island.png" style="height:100%" alt="" onerror="this.replaceWith('🏝️')"></div><div class="w"></div><div id="wk" style="left:${3+pr*58}%"><img class="${G.hist[G.hist.length-1]==='no'?'shk':''}" src="assets/${bad?'waka-damaged':'waka'}.png" style="height:100%" alt="" onerror="this.replaceWith('🛶')"></div><div class="w w2"></div></div>
<div class="hud"><div><b class="d">Hull</b><div class="planks" role="img" aria-label="${G.hull} of 5 planks">${[0,1,2,3,4].map(i=>`<b class="${i<G.hull?'':'x'}"></b>`).join('')}</div></div><div class="track" style="min-width:200px" aria-label="Progress">${Q.map((_,i)=>`<i class="${G.hist[i]?G.hist[i]:i===G.i?'now':''}"></i>`).join('')}</div></div>`}
function renderQ(){const q=Q[G.i],a=act().filter(p=>p.a).length;
 $('#pv').innerHTML=scene()+`<div class="panel" style="margin:0"><div class="bar">Question ${G.i+1} of ${Q.length} · ${E(q.strand)} · <span id="tl"></span></div><div class="in"><div class="big">${E(q.question)}</div><div class="ans">${q.options.map((o,i)=>`<div class="mode" style="font-size:24px;cursor:default"><b>${SYM[i]}</b> ${E(o)}</div>`).join('')}</div>
 <div class="big" aria-live="polite">${a} of ${act().length} crew have answered</div><div class="bar2"><div style="width:${act().length?a/act().length*100:0}%"></div></div>
 <div style="display:flex;gap:12px;flex-wrap:wrap"><button class="btn" onclick="WK.reveal()">Reveal now</button><button class="btn c" onclick="WK.more()">+10s</button></div></div></div>`;renderT()}
function renderT(){const t=$('#tl');if(t)t.textContent=G.endAt?Math.max(0,Math.ceil((G.endAt-Date.now())/1e3))+'s':'untimed'}
function resolve(){
 if(G.phase!=='q')return;G.phase='r';clearInterval(G.tm);const q=Q[G.i],ps=act();
 ps.forEach(p=>{if(!p.a)G.log.push({playerId:p.id,name:p.name,avatarId:p.av+1,qIndex:G.i,strand:q.strand,difficulty:q.difficulty||'',chosen:'',correct:false,timeMs:G.sec*1e3,confidence:'',timedOut:true});
  p.tot++;if(p.a?.ok){p.ok++;p.streak++}else p.streak=0});
 const okN=ps.filter(p=>p.a?.ok).length,acc=ps.length?okN/ps.length*100:0,pass=acc>=G.th,dist={};
 ps.forEach(p=>{if(p.a&&!p.a.ok)dist[p.a.v]=(dist[p.a.v]||0)+1});const wrong=Object.entries(dist).sort((a,b)=>b[1]-a[1])[0];
 if(!pass){G.hull--;G.fails[q.strand]=(G.fails[q.strand]||0)+1}G.hist.push(pass?'ok':'no');
 ps.forEach(p=>G.c[p.id]?.send({t:'reveal',ok:!!p.a?.ok,correct:q.correct,exp:q.explanation,streak:p.streak}));
 $('#pv').innerHTML=scene()+`<div class="warn ${pass?'okc':''}"><div class="big">${pass?'The waka sails on! 🎉':'Crack! The hull takes damage 💥'}</div><p style="font-size:22px"><b>${Math.round(acc)}%</b> of the crew got it (need ${G.th}%).${pass?'':` Steering failure in <b>${E(q.strand)}</b>.`}</p>
 <p style="font-size:22px">Answer: <b>${E(q.correct)}</b>. ${E(q.explanation)}</p>${wrong?`<p style="font-size:20px"><b>Ask the class:</b> why might “${E(wrong[0])}” seem right? (${wrong[1]} chose it)</p>`:''}
 <button class="btn k" onclick="WK.next()">${G.hull<=0||G.i+1>=Q.length?'Finish':'Next question'}</button></div>`;
 const w=$('#wk');if(!pass&&w)w.classList.add('hit');pass?good():bad()}
function endGame(){G.phase='end';const win=G.hull>0;bc({t:'end',win});
 const f=Object.entries(G.fails).map(([s,n])=>`<li>${E(s)}: ${n} plank${n>1?'s':''} lost</li>`).join('')||'<li>No planks lost!</li>';
 $('#pv').innerHTML=scene()+`<div class="warn ${win?'okc':''}"><div class="stk">${win?'Land ahoy! You made it!':'Washed ashore. Try again!'}</div><h2 style="margin:18px 0">Class accuracy: ${Math.round(G.log.filter(x=>x.correct).length/Math.max(1,G.log.length)*100)}%</h2><ul>${f}</ul>
 <div style="display:flex;gap:12px;flex-wrap:wrap"><button class="btn k" onclick="WK.again()">Play again, same questions</button><button class="btn c" onclick="WK.csv()">Download CSV</button></div></div>`;win?(good(),FX.confetti(),setTimeout(()=>beep(1100,.4),300)):bad()}

/* ---- RESUME LAST GAME: a checkpoint is saved at the START of every question (the engines call ET.cp just before they advance).
   Restoring rewinds to that point, so a half-finished question is simply asked again and its partial answers are dropped. ---- */
const SK='et-resume',rm=k=>{try{localStorage.removeItem(k)}catch(e){}};
function cp(fn){if(!G||!G.code)return;
 try{const o={...G};['c','tm','rv','vt','vfn','rs','pAt','endAt'].forEach(k=>delete o[k]);o.paused=false;
  if(o.sb)o.sb={...o.sb,cand:(o.sb.cand||[]).map(x=>x&&x.id)}; /* players are saved once; candidates are re-linked on restore */
  ls.set(SK,JSON.stringify({v:1,at:Date.now(),fn,Q,topic:G.topic,yr:$('#yr').value,shuf:ET.shuffleOpts!==false,quiet:!!ET.quiet,G:o}))}catch(e){}}
function ld(){try{const s=JSON.parse(ls.get(SK)||'null');return s&&s.v===1&&s.G&&s.G.code&&Array.isArray(s.Q)&&Date.now()-s.at<864e5?s:null}catch(e){return null}}
function resumeInfo(){const s=ld();return s&&{topic:s.topic,mode:s.G.mode,done:s.G.i+1,total:s.Q.length,at:s.at,code:s.G.code}}
function restore(){const s=ld();if(!s)return false;const g=s.G;
 Q=s.Q;mode=g.mode;ET.shuffleOpts=s.shuf;ET.quiet=s.quiet;
 const t=$('#topic'),y=$('#yr');if(t)t.value=s.topic==='Untitled'?'':s.topic;if(y)y.value=s.yr;
 document.querySelectorAll('#mm .mode').forEach(b=>b.setAttribute('aria-pressed',b.dataset.m===mode));
 Object.values(g.p).forEach(p=>{p.on=!!p.bot;p.rxAt=0}); /* real students come back by themselves when their device reconnects */
 if(g.sb)g.sb.cand=(g.sb.cand||[]).map(id=>g.p[id]).filter(Boolean);
 g.c={};g.paused=false;g.tm=0;g.rv=0;g.vt=0;g.vfn=null;g.endAt=0;g.banned=g.banned||{};
 g.rs={phase:g.phase,fn:s.fn};g.phase='lobby'; /* hold in the lobby until the teacher says go */
 rty=0;openRoom(g.code,g);return true}
function patchKick(id){const s=ld();if(!s)return;const g=s.G;(g.banned=g.banned||{})[id]=1;delete g.p[id];g.log=(g.log||[]).filter(r=>r.playerId!==id);ls.set(SK,JSON.stringify(s))}
window.WK={stop(){if(confirm('End the game now? Scores so far are kept.'))endGame()},reveal:resolve,next:nextQ,more(){if(G.endAt)G.endAt+=1e4},again:startGame,csv(){
 const k=Object.keys(G.log[0]||{playerId:1}),cell=v=>{let s=String(v);if(typeof v==='string'&&/^[=+\-@]/.test(s))s="'"+s;return `"${s.replace(/"/g,'""')}"`};const r=[k.join(',')].concat(G.log.map(o=>k.map(x=>cell(o[x])).join(',')));
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([r.join('\n')],{type:'text/csv'}));a.download='waka-answers.csv';a.click()}};
window.addEventListener('beforeunload',e=>{if(G&&G.phase!=='lobby'&&G.phase!=='end'){e.preventDefault();e.returnValue=''}});

/* ---- STUDENT ---- */
const saved=JSON.parse(ls.get('et-me')||'{}');let pick=saved.av??-1,S={};
$('#jn').insertAdjacentHTML('afterend','<small>Your teacher sees this in the results.</small>');$('#jn').value=saved.name||'';
$('#jn').parentNode.insertAdjacentHTML('afterend',`<div><label>Pick your animal</label><div id="ag">${AV.map((a,i)=>`<button aria-pressed="${i===pick}" aria-label="${a[1]}" data-i="${i}">${av(i)}<br>${a[1]}</button>`).join('')}</div><div id="ac" class="warn okc" style="margin-top:10px;font-size:15px" aria-live="polite">Tap an animal to meet it.</div><button class="btn c" id="colb" style="margin-top:10px;padding:8px 16px" type="button">My collection</button><div id="colv"></div></div>`);
if(pick>=0)card(pick);
$('#colb').onclick=()=>{const c=col(),all=c.length>=10;$('#colv').innerHTML=`<div class="${all?'gold':''}" style="margin-top:10px"><p><b>${c.length} of 10 collected${all?' · Golden ring earned! 🌟':''}</b></p><div id="ag">${AV.map((a,i)=>c.includes(i)?`<div style="text-align:center">${av(i)}<br><small>${a[1]}</small></div>`:`<div style="text-align:center"><span style="filter:brightness(0)">${av(i)}</span><br><small>Try me next game!</small></div>`).join('')}</div></div>`};
$('#ag').onclick=e=>{const b=e.target.closest('button');if(!b)return;pick=+b.dataset.i;document.querySelectorAll('#ag button').forEach(x=>x.setAttribute('aria-pressed',x===b));avSound(pick);card(pick)};
function card(i){const a=AV[i];$('#ac').innerHTML=`<b>${a[1]}</b> · ${a[2]}<br>${a[3]}<br><small>Perk (just for fun): ${a[4]}</small>`}
$('#jb').onclick=()=>{const code=$('#jc').value.trim().toUpperCase(),name=$('#jn').value.trim(),m=$('#jmsg');m.className='msg bad';
 if(code.length!==4)return m.textContent='Enter the 4-letter code.';if(name.length<2)return m.textContent='Your name needs 2 to 16 letters.';if(pick<0)return m.textContent='Pick an animal first.';
 if(/\b(fuck|shit|bitch|damn)/i.test(name))return m.textContent='Try a different name.';
 S={code,name,av:pick,pid:S.pid||'p'+Math.random().toString(36).slice(2,9)};ls.set('et-me',JSON.stringify({name,av:pick}));saveS();
 m.className='msg';m.textContent='Connecting…';conn()};
const saveS=()=>{try{sessionStorage.setItem('et-s',JSON.stringify({code:S.code,name:S.name,av:S.av,pid:S.pid}))}catch(e){}}; /* plain fields only: S also holds live PeerJS objects */
const rcCard=t=>{S.rc=1;sv(`<div class="warn" style="text-align:center"><h2>Reconnecting…</h2><p>${t||'Hang on, we are getting you back in.'}</p></div>`)};
function conn(){const m=$('#jmsg');if(S.peer)S.peer.destroy();const my=S.cn=(S.cn||0)+1,p=S.peer=new Peer();let up=false;
 p.on('open',()=>{const k=p.connect('exittix-'+S.code,{reliable:true});
  k.on('open',()=>k.send({t:'join',name:S.name,av:S.av,pid:S.pid}));k.on('data',sMsg);
  k.on('close',()=>{if(S.kicked||my!==S.cn)return;if(up)rcCard();setTimeout(()=>{if(my===S.cn&&!S.kicked)conn()},2000)});S.k=k;
  setTimeout(()=>{if(!up&&!S.ok){m.className='msg bad';m.textContent='No lobby found for that code. Check it and try again.'}},6000)});
 p.on('error',()=>{if(S.kicked||my!==S.cn)return;
  /* already in (or rejoining after a refresh): the host may be restarting, so keep trying quietly */
  if(S.in||S.auto){if((S.tries=(S.tries||0)+1)>100){S.rc=0;sv('<div class="warn"><h2>Could not get back in</h2><p>Ask your teacher if the game is still running, then refresh this page.</p></div>');return}
   if(!S.rc)rcCard('Waiting for your teacher’s screen…');return void setTimeout(()=>{if(my===S.cn&&!S.kicked)conn()},3000)}
  m.className='msg bad';m.textContent='Could not connect. Check the code and try again.'});up=true}
const sv=h=>{go('splay');$('#sv').innerHTML=h};
const pz=on=>{let o=document.getElementById('pz');if(!o){o=document.createElement('div');o.id='pz';o.className='pz';o.setAttribute('role','status');o.innerHTML='<div><div class="stk">Paused</div><p>Eyes on your teacher.</p></div>';document.body.appendChild(o)}o.hidden=!on};
/* lobby reactions: 3 buttons, 1 tap per 2 seconds (the host enforces this too) */
const RXL=['Clap','Fire','Wow'],RXE=['👏','🔥','😮'];
const rxRow=()=>`<div class="rxr" id="rxr" role="group" aria-label="Send a reaction to the big screen">${RXE.map((e,i)=>`<button type="button" data-e="${i}" aria-label="${RXL[i]}">${e}</button>`).join('')}</div>`;
function bindRx(){const r=$('#rxr');if(!r)return;const bs=[...r.querySelectorAll('button')],off=(on)=>bs.forEach(b=>b.disabled=on),w=2000-(Date.now()-(S.rxAt||0));
 if(w>0){off(true);setTimeout(()=>off(false),w)}
 r.onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled||!S.k)return;S.rxAt=Date.now();try{S.k.send({t:'rx',e:+b.dataset.e})}catch(x){return}navigator.vibrate?.(15);beep(800+b.dataset.e*150,.05);off(true);setTimeout(()=>off(false),2000)}}
function sMsg(d){S.ok=1;S.tries=0;
 if(d.t==='pause'){ET.pq=!!d.on;pz(d.on);return}
 if(d.t==='mute'){ET.quiet=!!d.on;return}
 if(d.t==='time'){S.end=Date.now()+d.left;return}
 if(d.t==='kick'){S.kicked=1;try{sessionStorage.removeItem('et-s')}catch(e){}pz(0);sv('<div class="warn"><h2>You were removed from this game</h2><p>Ask your teacher if this is a surprise.</p></div>');return}
 if(d.t.slice(0,3)==='au_')return ET.eng.auction.student(d);
 if(d.t.slice(0,3)==='sb_')return ET.eng.saboteur.student(d);
 if(d.t==='welcome'){S.name=d.name;
  if(!S.in){sv(`<div class="warn okc" style="text-align:center">${av(S.av)}<h2 style="margin-top:12px">You're in, ${d.name}!</h2><p>Watch the main screen. <span id="cn"></span></p>${rxRow()}<p><small>Change your animal until the game starts:</small></p><div id="ag2" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">${AV.map((a,i)=>`<button data-i="${i}" aria-label="${a[1]}" style="background:none;border:0;padding:2px;cursor:pointer;min-height:44px">${av(i)}</button>`).join('')}</div></div>`);
   S.in=1;mark(S.av);beep(700);bindRx();
   $('#ag2').onclick=e=>{const b=e.target.closest('button');if(!b)return;S.av=+b.dataset.i;pick=S.av;mark(S.av);avSound(S.av);ls.set('et-me',JSON.stringify({name:S.name,av:S.av}));saveS();S.k.send({t:'av',av:S.av});const h=$('#sv h2');if(h)h.previousElementSibling.outerHTML=av(S.av)}}
  else if(S.rc){/* reconnected mid-game or while the host restores: any game message that follows replaces this card */
   sv(`<div class="warn okc" style="text-align:center">${av(S.av)}<h2 style="margin-top:12px">You're back, ${d.name}!</h2><p>Your score is safe. Waiting for your teacher… <span id="cn"></span></p>${rxRow()}</div>`);bindRx();beep(700)}
  S.rc=0}
 else if(d.t==='lobby'){const c=$('#cn');if(c)c.textContent=d.n+' in the crew.'}
 else if(d.t==='q'){S.i=d.i;S.sel=null;S.end=Date.now()+d.left;
  sv(`<div class="panel" style="margin:0"><div class="bar">Q${d.i+1} of ${d.n} <span id="st" style="float:right"></span></div><div class="in"><div style="font:800 22px Syne">${E(d.q)}</div><div class="ans" id="as">${d.opts.map((o,i)=>`<button data-v="${E(o)}" aria-label="${LET[i]}: ${E(o)}"><b>${SYM[i]}</b>${E(o)}</button>`).join('')}</div><div id="cf" aria-live="polite"></div></div></div>`);
  const opts=d.opts;$('#as').onclick=e=>{const b=e.target.closest('button');if(!b||S.sel!=null)return;S.sel=opts.find((o,i)=>E(o)===b.dataset.v);b.setAttribute('aria-pressed',true);
   document.querySelectorAll('#as button').forEach(x=>x.disabled=true);S.k.send({t:'answer',i:S.i,v:S.sel});navigator.vibrate?.(30);
   $('#cf').innerHTML='<p><b>How sure were you?</b></p><div class="conf"><button data-c="1">😬 Guessing</button><button data-c="2">🙂 Pretty sure</button><button data-c="3">😎 Certain</button></div>';
   $('#cf').onclick=e=>{const c=e.target.closest('button');if(c){S.k.send({t:'conf',i:S.i,c:+c.dataset.c});$('#cf').innerHTML='<p><b>Locked in. Eyes up!</b></p>'}}};
  clearInterval(S.tm);if(d.left)S.tm=setInterval(()=>{const t=$('#st');if(!t)return clearInterval(S.tm);const s=Math.max(0,Math.ceil((S.end-Date.now())/1e3));t.textContent=s+'s';if(s<=5&&s>0)beep(900,.05)},500)}
 else if(d.t==='reveal'){clearInterval(S.tm);navigator.vibrate?.(d.ok?[40]:[80,40,80]);d.ok?good():bad();
  const msg=d.ok?['Nailed it!','Great thinking!','Yes!'][Math.random()*3|0]:['So close!','Not yet!','Mistakes grow brains!'][Math.random()*3|0];
  sv(`<div class="warn ${d.ok?'okc':''}" style="text-align:center">${d.ok?`<div class="pa a${S.av%5}">${av(S.av)}</div>`:''}<div class="stk">${msg}</div>${d.streak>=3?'<p class="big">🔥 '+d.streak+' in a row!</p>':''}<p style="font-size:20px"><b>Answer: ${E(d.correct)}</b></p><p>${E(d.exp)}</p><p>Watch the main screen.</p></div>`)}
 else if(d.t==='end')(d.win&&FX.confetti(),sv(`<div class="warn ${d.win?'okc':''}" style="text-align:center"><div class="stk">${d.win?'You made it! 🏝️':'Washed ashore. Try again!'}</div><p>Great teamwork, ${S.name}.</p></div>`))}
const SHO=a=>ET.shuffleOpts===false?[...a]:SH(a);
window.ET={SHO,E,av,SH,SYM,LET,beep,good,bad,sv,pOf,renderP,bc,cnt,act,G:()=>G,S:()=>S,eng:{},cp,restore,resumeInfo,patchKick,discard:()=>rm(SK)};
/* auto-rejoin waits for 'load' so every engine script has registered before the first message arrives */
addEventListener('load',()=>{try{const r=JSON.parse(sessionStorage.getItem('et-s')||'null');if(r&&!new URLSearchParams(location.search).get('join')){S=r;S.auto=1;pick=r.av;conn()}}catch(e){}});
})();
