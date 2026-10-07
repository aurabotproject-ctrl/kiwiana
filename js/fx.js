/* Visual effects: confetti rain for winners. Respects reduced-motion. */
window.FX={confetti(ms=4200){
 if(matchMedia('(prefers-reduced-motion:reduce)').matches)return;
 const o=document.createElement('div');o.className='conf';o.setAttribute('aria-hidden','true');
 o.innerHTML='<i></i><i></i>';document.body.appendChild(o);
 setTimeout(()=>{o.classList.add('out');setTimeout(()=>o.remove(),600)},ms)}};
