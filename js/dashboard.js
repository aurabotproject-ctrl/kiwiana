/* PHASE 1 DASHBOARD: subject, questions per game, "Copy my AI prompt", question list (preview/edit/delete/reorder),
   saved question sets, shuffle-options setting and remembered settings.
   The #json textarea stays the single source of truth: the list reads from it and writes back to it. */
(()=>{
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v);return true}catch(e){return false}}};
const E=s=>String(s??'').replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
const SUBJ={Maths:['Number and Algebra','Geometry and Measurement','Statistics'],English:['Reading','Writing','Oral Language'],Science:['Living World','Physical World','Material World','Planet Earth and Beyond','Nature of Science'],'Social Sciences':['Identity, Sense of Belonging','Place and Environment','Continuity and Change','The Economic World'],Other:[]};
const KEYS=['topic','yr','tq','th','sbst','sbth','sbvo','sbej','subj','qn','qsh','hnames'];
let ed=-1;

/* ---- UI ---- */
$('#json').parentNode.insertAdjacentHTML('beforebegin',`<div class="row" style="grid-template-columns:1fr 1fr 1fr"><div><label for="subj">Subject</label><select id="subj">${Object.keys(SUBJ).map(s=>`<option>${s}</option>`).join('')}</select></div>
 <div><label for="qn">Questions per game</label><select id="qn"><option value="0">All questions</option>${[5,8,10,12,15,20].map(n=>`<option>${n}</option>`).join('')}</select></div>
 <div><label for="qsh">Shuffle answer options</label><select id="qsh"><option value="on">On (each student differs)</option><option value="off">Off (same order for all)</option></select></div></div>
 <div><button class="btn c" id="aip" type="button">Copy my AI prompt</button> <small id="aipm" role="status" style="margin-left:8px"></small></div>`);
$('#json').parentNode.insertAdjacentHTML('afterend',`<div id="qtools" style="display:flex;gap:10px;flex-wrap:wrap;align-items:end"><div style="flex:1;min-width:200px"><label for="sn">Save this question set as</label><input id="sn" maxlength="40" placeholder="e.g. Fractions week 3"></div>
 <button class="btn" id="ss" type="button" style="padding:10px 18px">Save set</button>
 <div style="flex:1;min-width:200px"><label for="sl">Saved sets</label><select id="sl"></select></div><button class="btn c" id="sld" type="button" style="padding:10px 18px">Load</button><button class="btn" id="sdel" type="button" style="padding:10px 18px">Delete</button></div>
 <div id="ql" aria-live="polite"></div>`);

/* ---- question list ---- */
const rd=()=>{try{const d=JSON.parse($('#json').value);return Array.isArray(d)?d:null}catch(e){return null}};
const wr=d=>{$('#json').value=JSON.stringify(d,null,1);list()};
function list(){const d=rd(),el=$('#ql');if(!d||!d.length){el.innerHTML='';return}
 el.innerHTML=`<label>Your questions (${d.length})</label><ol class="ql">${d.map((q,i)=>{const bad=!q||!q.question||!Array.isArray(q.options)||!q.options.includes(q.correct);
  if(i===ed)return`<li class="qe"><div style="display:grid;gap:8px"><label>Question<input data-f="question" value="${E(q.question)}"></label><label>Options (one per line)<textarea data-f="options" style="min-height:90px">${E((q.options||[]).join('\n'))}</textarea></label>
  <label>Correct answer (must match an option)<input data-f="correct" value="${E(q.correct)}"></label><label>Explanation<input data-f="explanation" value="${E(q.explanation)}"></label><label>Strand<input data-f="strand" value="${E(q.strand)}"></label>
  <div><button class="btn" data-a="ok" data-i="${i}" type="button">Done</button></div></div></li>`;
  return`<li class="${bad?'bad':''}"><div style="flex:1;min-width:0"><b>${i+1}. ${E(q.question||'(empty)')}</b><br><small>${E(q.strand||'no strand')} · ${bad?'<b>needs fixing: correct must match an option</b>':'answer: '+E(q.correct)}</small>
  <details><summary>Preview options</summary><ul>${(q.options||[]).map(o=>`<li>${o===q.correct?'✔ ':''}${E(o)}</li>`).join('')}</ul><small>${E(q.explanation||'')}</small></details></div>
  <div class="qa"><button data-a="up" data-i="${i}" type="button" aria-label="Move question ${i+1} up" ${i?'':'disabled'}>↑</button><button data-a="dn" data-i="${i}" type="button" aria-label="Move question ${i+1} down" ${i<d.length-1?'':'disabled'}>↓</button><button data-a="ed" data-i="${i}" type="button">Edit</button><button data-a="rm" data-i="${i}" type="button" aria-label="Delete question ${i+1}">Delete</button></div></li>`}).join('')}</ol>`}
$('#ql').onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=rd(),i=+b.dataset.i;if(!d)return;
 if(b.dataset.a==='up'&&i>0)[d[i-1],d[i]]=[d[i],d[i-1]];
 else if(b.dataset.a==='dn'&&i<d.length-1)[d[i+1],d[i]]=[d[i],d[i+1]];
 else if(b.dataset.a==='rm'){if(!confirm(`Delete question ${i+1}?`))return;d.splice(i,1);ed=-1}
 else if(b.dataset.a==='ed'){ed=i;return list()}
 else if(b.dataset.a==='ok'){ed=-1;return list()}else return;wr(d)};
$('#ql').oninput=e=>{const f=e.target.dataset.f;if(!f||ed<0)return;const d=rd();if(!d)return;d[ed][f]=f==='options'?e.target.value.split('\n').map(s=>s.trim()).filter(Boolean):e.target.value;
 $('#json').value=JSON.stringify(d,null,1)}; /* typing updates the data; the list redraws on Done so focus is kept */
let t;$('#json').addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{ed=-1;list()},300)});
const fill=$('#sample');if(fill)fill.addEventListener('click',()=>{ed=-1;list()});

/* ---- AI prompt ---- */
$('#aip').onclick=async()=>{const s=$('#subj').value,n=+$('#qn').value||10,y=$('#yr').value,tp=$('#topic').value||'[your topic]',st=SUBJ[s].length?SUBJ[s].join(', '):'a sensible strand name for each question';
 const p=`You are helping a New Zealand teacher. Write ${n} multiple-choice exit-ticket questions for Year ${y} ${s}, topic: ${tp}, matched to the NZ Curriculum.
Return ONLY a JSON array, no commentary and no markdown fences. Each item must look exactly like:
{"question":"...","options":["A","B","C","D"],"correct":"B","explanation":"One or two child-friendly sentences.","strand":"..."}
Rules: exactly 4 options; "correct" must be copied exactly from one of the options; make wrong options reflect real misconceptions; use these strands (spread the questions across them): ${st}; keep wording at a Year ${y} reading level; use NZ spelling and contexts.`;
 let ok=false;try{await navigator.clipboard.writeText(p);ok=true}catch(e){const a=document.createElement('textarea');a.value=p;document.body.appendChild(a);a.select();try{ok=document.execCommand('copy')}catch(x){}a.remove()}
 $('#aipm').textContent=ok?'Copied! Paste it into your AI tool.':'Could not copy. Select the text from your browser console instead.'};

/* ---- saved sets ---- */
const sets=()=>{try{return JSON.parse(ls.get('et-sets')||'[]')}catch(e){return[]}};
const sref=()=>{$('#sl').innerHTML=sets().map((s,i)=>`<option value="${i}">${E(s.name)} (${s.n} Q)</option>`).join('')||'<option value="">No saved sets</option>'};sref();
$('#ss').onclick=()=>{const m=$('#hmsg'),d=rd(),n=$('#sn').value.trim();m.className='msg bad';
 if(!d||!d.length){m.textContent='Add some valid questions before saving a set.';return}if(!n){m.textContent='Give the set a name first.';return}
 const a=sets().filter(s=>s.name!==n);a.unshift({name:n,subject:$('#subj').value,n:d.length,json:d});
 if(!ls.set('et-sets',JSON.stringify(a.slice(0,30)))){m.textContent='Your browser storage is full. Delete a saved set first.';return}
 sref();m.className='msg ok';m.textContent=`Saved "${n}".`};
$('#sld').onclick=()=>{const s=sets()[+$('#sl').value];if(!s)return;$('#json').value=JSON.stringify(s.json,null,1);$('#subj').value=s.subject||'Maths';$('#sn').value=s.name;ed=-1;list();$('#hmsg').className='msg ok';$('#hmsg').textContent=`Loaded "${s.name}".`};
$('#sdel').onclick=()=>{const a=sets(),i=+$('#sl').value;if(!a[i]||!confirm(`Delete "${a[i].name}"?`))return;a.splice(i,1);ls.set('et-sets',JSON.stringify(a));sref()};

/* ---- questions per game + shuffle: wrap the shell's parse() so every engine gets them ---- */
const base=window.parse;
window.parse=function(){const e=base();ET.shuffleOpts=$('#qsh').value!=='off';if(e)return e;
 const n=+$('#qn').value;if(n>0&&n<Q.length){const keep=new Set([...Q.keys()].sort(()=>Math.random()-.5).slice(0,n));Q=Q.filter((_,i)=>keep.has(i))}return''};

/* ---- remembered settings ---- */
const load=()=>{try{return JSON.parse(ls.get('et-settings')||'{}')}catch(e){return{}}};
const S0=load();KEYS.forEach(k=>{const el=$('#'+k);if(el&&S0[k]!=null)el.value=S0[k]});
if(S0.mode){const b=document.querySelector(`#mm .mode[data-m="${S0.mode}"]`);b&&b.click()}
const save=()=>{const o={mode:window.mode||document.querySelector('#mm .mode[aria-pressed="true"]')?.dataset.m};KEYS.forEach(k=>{const el=$('#'+k);if(el)o[k]=el.value});ls.set('et-settings',JSON.stringify(o))};
$('#host').addEventListener('change',save);$('#host').addEventListener('click',e=>{if(e.target.closest('#mm .mode'))setTimeout(save,0)});
$('#topic').addEventListener('input',save);$('#open').addEventListener('click',save,true);
list();
})();
