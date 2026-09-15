/** Примитивы иллюстраций. Без текста, иначе картинка выдаёт ответ. */
export const SKIN='#f3c79b', HAIR='#4b3b2f', BLUE='#2563eb', SEA='#7cb6f5', WHITE='#ffffff', DARK='#334155';
export const frame=(body:string,bg='#e7eefb')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220"><rect width="320" height="220" fill="${bg}"/>${body}</svg>`;
export type Hair='short'|'long'|'bun'|'bald';
export const person=(x:number,y:number,s:number,shirt:string,hair:string=HAIR,style:Hair='short')=>{
 const hy=y-52*s, r=15*s;
 const back=style==='long'?`<rect x="${x-r-4*s}" y="${hy-r}" width="${2*r+8*s}" height="${r*2.6}" rx="${r}" fill="${hair}"/>`:'';
 const cap=style==='bald'?'':`<path d="M${x-r} ${hy-1*s} a${r} ${r} 0 0 1 ${2*r} 0 z" fill="${hair}"/>`;
 const bun=style==='bun'?`<circle cx="${x}" cy="${hy-r-3*s}" r="${7*s}" fill="${hair}"/>`:'';
 return `${back}<circle cx="${x}" cy="${hy}" r="${r}" fill="${SKIN}"/>${cap}${bun}<path d="M${x-20*s} ${y} v${-20*s} a${20*s} ${20*s} 0 0 1 ${40*s} 0 v${20*s} z" fill="${shirt}"/>`;
};
export const bubble=(x:number,y:number,w:number,h:number,fill=WHITE)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h/2.6}" fill="${fill}"/><path d="M${x+w*0.25} ${y+h} l0 16 l18 -16 z" fill="${fill}"/>`;
export const dots=(filled:number,total=7,y=110)=>Array.from({length:total},(_,i)=>`<circle cx="${52+i*36}" cy="${y}" r="14" fill="${i<filled?BLUE:'#c7d6f2'}"/>`).join('');
export const sun=(cx:number,cy:number,r:number,color='#fbbf24')=>`${Array.from({length:12},(_,i)=>{const a=i*Math.PI/6;return `<line x1="${cx+Math.cos(a)*(r+8)}" y1="${cy+Math.sin(a)*(r+8)}" x2="${cx+Math.cos(a)*(r+22)}" y2="${cy+Math.sin(a)*(r+22)}" stroke="${color}" stroke-width="7" stroke-linecap="round"/>`}).join('')}<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`;
export const heart=(cx:number,cy:number,s:number,color='#ef4444')=>`<path transform="translate(${cx} ${cy}) scale(${s})" d="M0 26 C-34 4 -26 -24 -8 -24 C-2 -24 0 -19 0 -19 C0 -19 2 -24 8 -24 C26 -24 34 4 0 26 Z" fill="${color}"/>`;
export const tree=(x:number,y:number,s:number)=>`<rect x="${x-6*s}" y="${y-60*s}" width="${12*s}" height="${60*s}" rx="${4*s}" fill="#9a6b43"/><circle cx="${x}" cy="${y-76*s}" r="${34*s}" fill="#6cbf7a"/><circle cx="${x-26*s}" cy="${y-58*s}" r="${22*s}" fill="#57ab66"/><circle cx="${x+26*s}" cy="${y-58*s}" r="${22*s}" fill="#7fcd8c"/>`;
export const eye=(cx:number,cy:number,s:number)=>`<path d="M${cx-60*s} ${cy} q${60*s} -${46*s} ${120*s} 0 q-${60*s} ${46*s} -${120*s} 0 z" fill="${WHITE}"/><circle cx="${cx}" cy="${cy}" r="${24*s}" fill="#3b82f6"/><circle cx="${cx}" cy="${cy}" r="${11*s}" fill="#1e293b"/><circle cx="${cx+8*s}" cy="${cy-8*s}" r="${5*s}" fill="${WHITE}"/>`;
export const waves=(y:number,color=SEA)=>`<path d="M0 ${y} q40 -14 80 0 t80 0 t80 0 t80 0 v${220-y} H0 z" fill="${color}"/>`;
