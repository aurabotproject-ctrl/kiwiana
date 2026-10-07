/* ROOM CONTROLS: always-visible teacher bar (pause, skip, reveal, +10s, remove student, mute, end),
   connection-health indicator, and the lobby QR code. Works through window.ET / WK / AU / SB, so the engines stay unchanged.
   Also owns: "Resume last game" banner (checkpoints are written by waka.js / the engines) and the floating lobby reactions.
   Pause freezes the countdown by pushing G.endAt forward while paused, and the host ignores answers until resume. */
(()=>{
const g=()=>ET.G(),$$=s=>document.querySelector(s),E=ET.E;
const view=()=>document.querySelector('.view.on')?.id;
let pt=0,open=false,min=false;
const bar=document.createElement('div');bar.className='rbar';bar.hidden=true;bar.setAttribute('role','region');bar.setAttribute('aria-label','Teacher controls');
bar.innerHTML=`<span class="rb-health" id="rbh" aria-live="polite"></span><button id="rb-p" type="button">⏸ Pause</button><button class="rb-more" id="rb-s" type="button">⏭ Skip</button><button class="rb-more" id="rb-r" type="button">👁 Reveal now</button><button class="rb-more" id="rb-m" type="button">+10s</button><button class="rb-more" id="rb-k" type="button">👥 Students</button><button class="rb-more" id="rb-q" type="button" aria-pressed="false">🔊 Sound on</button><button class="rb-more" id="rb-e" type="button">⏹ End game</button><button id="rb-c" type="button" aria-expanded="true" aria-label="Collapse controls">▾</button>`;
document.body.appendChild(bar);const kp=document.createElement('div');kp.className='rb-kick';kp.hidden=true;document.body.appendChild(kp);
const B=id=>bar.querySelector('#rb-'+id);

const ph=()=>g().phase,M=()=>g().mode;
const CAN={
 pause:()=>!['lobby','end'].includes(ph()),
 skip:()=>M()==='waka'?ph()==='q':M()==='auction'?['topic','bid','q'].includes(ph()):['q','debate','vote'].includes(ph()),
 reveal:()=>!g().paused&&(M()==='auction'?['bid','q'].includes(ph()):ph()==='q'),
 more:()=>!g().paused&&!!g().endAt&&['q','bid','debate','vote'].includes(ph()),
 end:()=>!['lobby','end'].includes(ph())};

function sync(){const G=g();if(!G.endAt)return;ET.bc({t:{waka:'time',auction:'au_time',saboteur:'sb_time'}[G.mode],left:Math.max(0,G.endAt-Date.now())})}
function pause(){const G=g(),on=!G.paused;G.paused=on;ET.bc({t:'pause',on});clearInterval(pt);
 if(on){G.pAt=Date.now();if(G.endAt)G.endAt+=400;pt=setInterval(()=>{const n=Date.now();if(G.endAt)G.endAt+=n-G.pAt;G.pAt=n},100)}
 else{if(G.endAt)G.endAt-=400;sync()}}
function skip(){const G=g();clearInterval(G.tm);
 if(M()==='waka'){G.log=G.log.filter(x=>x.qIndex!==G.i);G.hist.push('skip');Object.values(G.p).forEach(p=>p.a=null);ET.bc({t:'time',left:0});WK.next()}
 else if(M()==='auction'){Object.values(G.p).forEach(p=>{if(p.locked){if(p.dd)p.ddUsed=false;if(p.ins)p.insUsed=false}p.w=null;p.locked=false;p.ans=null;p.dd=p.ins=false});AU.next()}
 else SB.next()}
function remove(id){const G=g(),p=G.p[id],c=G.c[id];if(!p)return;(G.banned=G.banned||{})[id]=1;try{c&&c.send({t:'kick'})}catch(e){}setTimeout(()=>{try{c&&c.close()}catch(e){}},400);
 delete G.p[id];delete G.c[id];G.log=(G.log||[]).filter(r=>r.playerId!==id); /* their answers leave the report too */
 ET.patchKick&&ET.patchKick(id);ET.renderP();ET.bc({t:'lobby',n:ET.cnt()});
 if(G.mode==='waka'){if(G.phase==='q'&&ET.act().length&&ET.act().every(x=>x.a))WK.reveal()}else ET.eng[G.mode].drop(p)}
function roster(){const G=g(),locked=G.mode==='saboteur'&&G.phase==='vote';kp.innerHTML=`<b class="d">Remove a student</b>${locked?'<small>Wait until the vote is over.</small>':'<small>Removed students cannot rejoin, and their answers leave the report.</small>'}`+
 (Object.values(G.p).filter(p=>!p.bot).map(p=>`<div>${ET.av(p.av)}<span>${p.name}${p.on?'':' (offline)'}</span><button type="button" data-id="${E(p.id)}" ${locked?'disabled':''}>Remove</button></div>`).join('')||'<small>No students yet.</small>')}
kp.onclick=e=>{const b=e.target.closest('button');if(!b||b.disabled)return;if(b.dataset.sure===b.dataset.id){remove(b.dataset.id);roster()}else{b.dataset.sure=b.dataset.id;b.textContent='Sure?'}};
B('p').onclick=pause;B('s').onclick=()=>{if(CAN.skip())skip()};
B('r').onclick=()=>{if(!CAN.reveal())return;M()==='waka'?WK.reveal():M()==='auction'?(ph()==='bid'?AU.close():AU.reveal()):SB.reveal()};
B('m').onclick=()=>{if(!CAN.more())return;({waka:WK,auction:AU,saboteur:SB})[M()].more();sync()};
B('e').onclick=()=>({waka:WK,auction:AU,saboteur:SB})[M()].stop();
B('k').onclick=()=>{open=!open;kp.hidden=!open;if(open)roster()};
B('q').onclick=()=>{ET.quiet=!ET.quiet;ET.bc({t:'mute',on:ET.quiet})};
B('c').onclick=()=>{min=!min;bar.classList.toggle('min',min);B('c').textContent=min?'▴':'▾';B('c').setAttribute('aria-expanded',!min);B('c').setAttribute('aria-label',min?'Expand controls':'Collapse controls')};

/* connection health: green = everyone connected, amber = some students offline or the signalling link is reconnecting, red = nobody connected */
function health(){const G=g(),ps=Object.values(G.p).filter(p=>!p.bot),on=ps.filter(p=>p.on).length;let c='g',w='Good';
 if(ET.sig===0||on<ps.length){c='a';w='Check'}if(ps.length&&!on){c='r';w='Problem'}
 const t=`${on} of ${ps.length} connected`,h=$$('#rbh');const html=`<i class="rb-dot rb-${c}" aria-hidden="true"></i>${w}: ${t}`;
 if(h.dataset.k!==html){h.dataset.k=html;h.innerHTML=html;h.title=ET.sig===0?'Reconnecting to the signalling server. Students already in are fine; new joiners must wait.':on<ps.length?'Some students are offline. They rejoin on their own when their device wakes.':'All connected.'}}

/* QR code for the lobby: canvas, integer module size, 4-module quiet zone */
function qr(){const G=g(),w=$$('#qrw');if(!w)return;if(w.dataset.c===G.code)return;w.dataset.c=G.code;
 const base=location.href.split(/[?#]/)[0].replace(/index\.html$/,''),url=base+'?join='+G.code;$$('#jl').textContent=base.replace(/^https?:\/\//,'').replace(/\/$/,'');
 if(!window.qrcode){w.hidden=true;return}
 try{const q=qrcode(0,'M');q.addData(url);q.make();const n=q.getModuleCount(),s=Math.max(4,Math.floor(560/(n+8))),z=(n+8)*s,c=$$('#qr'),x=c.getContext('2d');c.width=c.height=z;x.fillStyle='#fff';x.fillRect(0,0,z,z);x.fillStyle='#1a1a1a';
  for(let r=0;r<n;r++)for(let k=0;k<n;k++)if(q.isDark(r,k))x.fillRect((k+4)*s,(r+4)*s,s,s);c.setAttribute('aria-label','QR code that opens '+url);w.hidden=false}catch(e){w.hidden=true}}

/* ---- RESUME LAST GAME banner (home page + host setup). The checkpoint itself is written by waka.js and the engines. ---- */
const MN={waka:'The Great Waka Escape',auction:'The Knowledge Auction',saboteur:'The Curriculum Saboteur'};
const rsm=['#home','#host'].map(sel=>{const el=document.createElement('div');el.className='rsm';el.hidden=true;el.setAttribute('role','region');el.setAttribute('aria-label','Resume last game');$$(sel).insertAdjacentElement('afterbegin',el);
 el.onclick=e=>{const b=e.target.closest('button');if(!b)return;
  if(b.dataset.a==='no'){if(confirm('Discard the saved game? It cannot be brought back.')){ET.discard();lk='';banner()}}
  else if(!ET.restore()){const m=el.querySelector('.rsm-m');if(m)m.textContent='Sorry, that saved game could not be restored. You can start a new one.'}};return el});
let lk=null;
function banner(){let raw='';try{raw=localStorage.getItem('et-resume')||''}catch(e){}
 const key=raw.slice(0,40);if(key===lk)return;lk=key;const i=raw?ET.resumeInfo():null;
 rsm.forEach(el=>{if(!i){el.hidden=true;el.innerHTML='';return}
  const t=new Date(i.at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  el.hidden=false;el.innerHTML=`<div><b class="d" style="font-size:22px">Resume last game?</b><p>${E(i.topic)} · ${MN[i.mode]||E(i.mode)} · ${i.done} of ${i.total} questions finished · saved ${t}</p><small>It restarts at the beginning of question ${Math.min(i.total,i.done+1)}. Keep students' tabs open: they rejoin on their own with their scores.</small><p class="msg bad rsm-m" role="status"></p></div><div class="rsm-b"><button class="btn k" type="button" data-a="go">Resume</button><button class="btn" type="button" data-a="no" style="background:var(--paper)">Discard</button></div>`})}

banner();
/* ---- lobby reactions: students send 👏 🔥 😮, they float up the host screen. waka.js has already rate-limited and range-checked them. ---- */
const RX=['👏','🔥','😮'],rl=document.createElement('div');rl.className='rxl';rl.setAttribute('aria-hidden','true');document.body.appendChild(rl);
ET.rx=(p,e)=>{if(view()!=='lobby')return;const d=document.createElement('div');d.className='rxf';d.style.left=(6+Math.random()*84)+'%';d.style.setProperty('--dx',Math.round(Math.random()*120-60)+'px');
 d.innerHTML=`<span class="rxe">${RX[e]}</span>${ET.av(p.av)}`;rl.appendChild(d);while(rl.children.length>40)rl.firstChild.remove();setTimeout(()=>d.remove(),3600);ET.beep(700+e*180,.05)};

setInterval(()=>{const G=g(),v=view();
 if(G&&G.phase==='end')ET.discard(); /* finished games are saved by the report (Session History); nothing left to resume */
 if(v==='home'||v==='host')banner();
 const show=!!G&&!!G.code&&(v==='lobby'||v==='play');bar.hidden=!show;document.body.classList.toggle('hasbar',show);if(!show){kp.hidden=true;open=false;return}
 health();if(v==='lobby')qr();
 const pz=!!G.paused;B('p').textContent=pz?'▶ Resume':'⏸ Pause';B('p').setAttribute('aria-pressed',pz);B('p').disabled=!CAN.pause();
 ['s','r','m','e'].forEach(k=>B(k).disabled=!CAN[{s:'skip',r:'reveal',m:'more',e:'end'}[k]]());
 B('q').textContent=ET.quiet?'🔇 Muted':'🔊 Sound on';B('q').setAttribute('aria-pressed',!!ET.quiet);
 if(open&&!kp.contains(document.activeElement))roster()},700);
/* a new lobby starts un-paused and un-muted */
const o=$$('#open');o&&o.addEventListener('click',()=>{ET.quiet=false;const G=g();if(G)G.paused=false;clearInterval(pt)});
})();
