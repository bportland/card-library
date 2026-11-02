import {db,auth} from './firebase-adapter.js';

/*pure-start*/
const SETS={ASC:'Ascended Heroes',BLK:'Black Bolt',CRI:'Chaos Rising',CRZ:'Crown Zenith',DRI:'Destined Rivals',JTG:'Journey Together',LOR:'Lost Origin',MEG:'Mega Evolution',MEP:'Mega Evolution Promos',PAF:'Paldean Fates',PAL:'Paldea Evolved',PAR:'Paradox Rift',PBL:'Pitch Black',PFL:'Phantasmal Flames',POR:'Perfect Order',PRE:'Prismatic Evolutions',SCR:'Stellar Crown',SFA:'Shrouded Fable',SSP:'Surging Sparks',SVI:'Scarlet & Violet Base Set',TEF:'Temporal Forces',TWM:'Twilight Masquerade',WHT:'White Flare',sv8a:'Terastal Fest ex (Japanese)',csv5C:'Chinese set csv5C',UNK:'Unknown set',Vintage:'Vintage'};
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const identity=c=>[norm(c.name),c.num||'',c.print||'',c.pattern||''].join('|');
function parseCSV(text){
  const rows=[];let row=[],cell='',quoted=false;
  text=text.replace(/^﻿/,'');
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else quoted=false}else cell+=ch}
    else if(ch==='"')quoted=true;
    else if(ch===','){row.push(cell);cell=''}
    else if(ch==='\n'){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell=''}
    else cell+=ch}
  if(cell||row.length){row.push(cell);rows.push(row)}
  const head=rows.shift()||[];
  return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??''])));
}
function setAbbr(setName){
  const short=norm(String(setName).split(': ').pop());
  return Object.keys(SETS).find(k=>norm(SETS[k]).replace(' (japanese)','')===short)||'';
}
function parseTcgRow(r){
  let name=r['Product Name']||'',pattern='',stamp='';
  name=name.replace(/\s*\(([^)]*(?:Pattern|Holo))\)/i,(m,p)=>{pattern=p;return ''});
  name=name.replace(/\s*\((Play! Stamp|Set Logo Stamp)\)/i,(m,p)=>{stamp=p;return ''});
  name=name.replace(/\s+-\s+[A-Za-z]*\s*\d[\w/ ]*$/,'').trim();
  if(/Japanese/i.test(r['Condition']))name+=' (JPN)';
  const price=parseFloat(r['TCG Market Price']);
  const set=setAbbr(r['Set Name']);
  return {name,num:r['Number']||'',print:r['Printing']||'Normal',pattern,stamp,rarity:r['Rarity']||'',set,setName:r['Set Name']||'',
    qty:Math.max(1,parseInt(r['Add to Quantity'],10)||parseInt(r['Total Quantity'],10)||1),price:Number.isFinite(price)?price:null};
}
// TCGdex set id and printed total for each set abbreviation. Used for card images and prices.
const TCGDEX={ASC:['me02.5','217'],BLK:['sv10.5b','086'],CRI:['me04','086'],CRZ:['swsh12.5','159'],DRI:['sv10','182'],JTG:['sv09','159'],LOR:['swsh11','196'],MEG:['me01','132'],MEP:['mep',''],PAF:['sv04.5','091'],PAL:['sv02','193'],PAR:['sv04','182'],PBL:['me05','084'],PFL:['me02','094'],POR:['me03','088'],PRE:['sv08.5','131'],SCR:['sv07','142'],SFA:['sv06.5','064'],SSP:['sv08','191'],SVI:['sv01','198'],TEF:['sv05','162'],TWM:['sv06','167'],WHT:['sv10.5w','086']};
const VARIANT={Normal:'normal',Holofoil:'holofoil','Reverse Holofoil':'reverse-holofoil'};
function tcgdexId(c){
  const s=TCGDEX[c.set];if(!s||!c.num)return '';
  const[n,total='']=c.num.split('/');
  return s[1]&&total!==s[1]?'':`${s[0]}-${n}`;
}
function tcgdexImage(id,size='low'){
  if(!id)return '';
  const i=id.lastIndexOf('-'),set=id.slice(0,i);
  return `https://assets.tcgdex.net/en/${set.match(/^[a-z]+/)[0]}/${set}/${id.slice(i+1)}/${size}.webp`;
}
function marketPrice(tcgplayer,print){
  if(!tcgplayer)return null;
  const hit=tcgplayer[VARIANT[print]]?.marketPrice;
  if(hit!=null)return hit;
  return print==='Reverse Holofoil'?null:tcgplayer.normal?.marketPrice??tcgplayer.holofoil?.marketPrice??null;
}
/*pure-end*/

const TYPES=['Pokemon','Trainer','Energy'];
const DETAILS=['Basic Pokemon','Stage 1 Pokemon','Stage 2 Pokemon','Item','Stadium','Tool','Supporter','Basic Energy','Special Energy'];
const ENERGIES=['Colorless','Dark','Dragon','Fairy','Fighting','Fire','Grass','Lightning','Metal','Psychic','Water'];
const LOCATIONS=['Green Binder','Blue Binder','Box 1 (Gray)','Box 2 (Red)','In a Deck','Deckbox 1','Deckbox 2'];
const PATTERNS=['Cosmos Holo','Poke Ball Pattern','Master Ball Pattern','Energy Pattern','Team Rocket Pattern','Quick Ball Pattern','Love Ball Pattern','Friend Ball Pattern','Dusk Ball Pattern'];
const PRINTINGS=['Normal','Holofoil','Reverse Holofoil'];
const STAMPS=['Play! Stamp','Set Logo Stamp'];
const RARITIES=['Common','Uncommon','Rare','Double Rare','Ultra Rare','Illustration Rare','Special Illustration Rare','Hyper Rare','Mega Hyper Rare','Promo','ACE SPEC Rare','Other'];
const RARITY_MARK={Common:'●',Uncommon:'◆',Rare:'★','Double Rare':'★★','Ultra Rare':'★★','Illustration Rare':'★','Special Illustration Rare':'★★','Hyper Rare':'★★★','Mega Hyper Rare':'✦','ACE SPEC Rare':'★',Promo:'P'};
const NO_TOTAL=new Set(['MEP','UNK','Vintage']);
const CK_RARITY={C:'Common',U:'Uncommon',R:'Rare',DR:'Double Rare',IR:'Illustration Rare',UR:'Ultra Rare',SIR:'Special Illustration Rare',MHR:'Mega Hyper Rare',RH:'Reverse Holos'};
const PAGE=150;

const S={cards:[],byId:new Map(),checklists:{},seed:[],view:'library',limit:PAGE,canWrite:true,ready:false,ckFilter:'all',editing:null,pending:{},timers:{}};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const denom=c=>(c.num||'').split('/')[1]||'';
const base=c=>(c.num||'').split('/')[0];

let toastTimer;
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,3500)}
function banner(msg){const b=$('banner');b.hidden=!msg;b.textContent=msg||''}

async function retry(fn){
  for(let i=0;;i++){
    try{return await fn()}catch(e){
      if(!['resource-exhausted','unavailable','aborted','deadline-exceeded'].includes(e?.code)||i>=6)throw e;
      await sleep(800*(i+1)+Math.random()*400)}
  }
}
async function pool(items,fn,n=4,onDone){
  let i=0,done=0;
  await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{
    while(i<items.length){const it=items[i++];await retry(()=>fn(it));onDone?.(++done)}
  }));
}
function failMsg(e){return e?.code==='resource-exhausted'?'The free daily database limit has been reached. Try again tomorrow.':e?.code==='permission-denied'?'This account cannot change the library.':'That change was not saved. Check your connection and try again.'}
function clean(o){const r={};for(const[k,v]of Object.entries(o))if(v!==''&&v!=null)r[k]=v;return r}

/* derived data */
function totalsDenom(){
  const m={};
  for(const c of S.cards){const d=denom(c);if(!c.set||!d)continue;(m[c.set]??={})[d]=(m[c.set][d]||0)+1}
  const out={};for(const[s,v]of Object.entries(m))out[s]=Object.entries(v).sort((a,b)=>b[1]-a[1])[0][0];
  return out;
}
function reviewReason(c,td){
  if(!c.type)return 'Card type missing';
  if(c.set&&!c.num)return 'Card number missing';
  if(c.num&&!c.set)return 'Set missing';
  if(c.set==='UNK')return 'Set unknown';
  if(c.set&&!c.rarity)return 'Rarity missing';
  if(c.set&&!NO_TOTAL.has(c.set)&&denom(c)&&denom(c)!==td[c.set])return 'Number does not fit this set';
  return '';
}
function displayCount(c){return S.pending[c.id]??c.count}
function filtered(){
  const q=norm($('f-q').value),ty=$('f-type').value,en=$('f-energy').value,st=$('f-set').value,lo=$('f-loc').value,ck=$('f-check').value,td=totalsDenom();
  const rows=S.cards.filter(c=>{
    if(q&&!norm([c.name,c.num,c.set,c.notes,c.deck,c.detail].join(' ')).includes(q))return false;
    if(ty&&c.type!==ty)return false;if(en&&c.energy!==en)return false;if(st&&c.set!==st)return false;
    if(lo&&!(lo.startsWith('deck:')?(c.loc==='In a Deck'&&(c.deck||'')===lo.slice(5)):c.loc===lo))return false;
    if(ck==='special'&&!c.pattern&&!c.stamp)return false;
    if(ck==='review'&&!reviewReason(c,td))return false;
    if(ck==='noset'&&c.set)return false;
    if(ck==='priced'&&c.price==null)return false;
    return true});
  const srt=$('f-sort').value,rk=c=>{const i=RARITIES.indexOf(c.rarity);return c.rarity==='Other'?0:i};
  const byName=(a,b)=>a.name.localeCompare(b.name);
  rows.sort(srt==='set'?(a,b)=>(a.set||'~').localeCompare(b.set||'~')||(a.num||'').localeCompare(b.num||'')||byName(a,b)
    :srt==='count'?(a,b)=>displayCount(b)-displayCount(a)||byName(a,b)
    :srt==='rarity'?(a,b)=>rk(b)-rk(a)||byName(a,b)
    :srt==='price'?(a,b)=>((b.price||0)*b.count)-((a.price||0)*a.count)||byName(a,b)
    :(a,b)=>byName(a,b)||(a.num||'').localeCompare(b.num||''));
  return rows;
}

/* rendering */
let renderQueued=false;
function queueRender(){if(renderQueued)return;renderQueued=true;setTimeout(()=>{renderQueued=false;render()},120)}
function render(){
  renderTally();renderLists();
  for(const v of ['library','sets','checklist','places']){$('view-'+v).hidden=S.view!==v;$('tab-'+v).setAttribute('aria-selected',S.view===v)}
  ({library:renderLibrary,sets:renderSets,checklist:renderChecklist,places:renderPlaces})[S.view]();
}
function renderTally(){
  const copies=S.cards.reduce((n,c)=>n+displayCount(c),0),val=S.cards.reduce((n,c)=>n+(c.price||0)*displayCount(c),0),priced=S.cards.filter(c=>c.price!=null).length;
  const sets=new Set(S.cards.map(c=>c.set).filter(Boolean)).size;
  $('tally').innerHTML=[[copies.toLocaleString(),'cards'],[S.cards.length.toLocaleString(),'entries'],[sets,'sets'],[priced?money(val):'—',priced?`value, ${priced} priced`:'value, none priced']]
    .map(([b,s])=>`<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
}
function fillSelect(el,opts,placeholder){
  const cur=el.value;
  el.innerHTML=(placeholder!=null?`<option value="">${esc(placeholder)}</option>`:'')+opts.map(o=>Array.isArray(o)?`<option value="${esc(o[0])}">${esc(o[1])}</option>`:`<option>${esc(o)}</option>`).join('');
  el.value=[...el.options].some(o=>o.value===cur)?cur:'';
}
const allLocs=()=>[...new Set([...LOCATIONS,...S.cards.map(c=>c.loc).filter(Boolean)])];
const allDecks=()=>[...new Set(S.cards.map(c=>c.deck).filter(Boolean))].sort();
function renderLists(){
  const sets=[...new Set(S.cards.map(c=>c.set).filter(Boolean))].sort((a,b)=>(SETS[a]||a).localeCompare(SETS[b]||b));
  fillSelect($('f-type'),TYPES,'All types');fillSelect($('f-energy'),ENERGIES,'All energy');
  fillSelect($('f-set'),sets.map(s=>[s,`${SETS[s]||s} (${s})`]),'All sets');
  fillSelect($('f-loc'),[...allLocs().filter(l=>S.cards.some(c=>c.loc===l)),...allDecks().map(d=>['deck:'+d,'Deck: '+d])],'All locations');
  const dl=(id,vals)=>$(id).innerHTML=vals.map(v=>`<option value="${esc(v)}">`).join('');
  dl('nameList',[...new Set(S.cards.map(c=>c.name))].sort());dl('setList',[...new Set([...sets,...Object.keys(SETS)])]);dl('locList',allLocs());dl('deckList',allDecks());
}
function rarityMark(r){const m=RARITY_MARK[r];return m?`<span class="stars${r==='ACE SPEC Rare'?' ace':''}" aria-hidden="true">${m}</span> `:''}
function rowHTML(c,td){
  const bits=[];
  if(c.set||c.num)bits.push(`<span class="mono">${esc([c.set,c.num].filter(Boolean).join(' '))}</span>`);
  else bits.push(`<span>${esc(c.detail||'')}</span>`);
  if(c.rarity)bits.push(`<span>${rarityMark(c.rarity)}${esc(c.rarity)}</span>`);
  if(c.print&&c.print!=='Normal')bits.push(`<span>${esc(c.print)}</span>`);
  if(c.pattern)bits.push(`<span class="tag">${esc(c.pattern)}</span>`);
  if(c.stamp)bits.push(`<span class="tag">${esc(c.stamp)}</span>`);
  bits.push(`<span>${esc(c.loc==='In a Deck'?(c.deck?'Deck: '+c.deck:'In a deck'):c.loc||'')}</span>`);
  if(c.notes)bits.push(`<span>${esc(c.notes)}</span>`);
  const why=reviewReason(c,td);if(why)bits.push(`<span class="tag warn">${esc(why)}</span>`);
  if(c.price!=null)bits.push(`<span class="price">${money(c.price)}</span>`);
  const pip=c.energy?`style="--e:var(--e-${esc(c.energy.toLowerCase())})" title="${esc(c.energy)}"`:'';
  const dis=S.canWrite?'':' disabled';
  const img=tcgdexImage(tcgdexId(c));
  return `<div class="row"><span class="pip" ${pip}></span><span class="thumb">${img?`<img loading="lazy" src="${esc(img)}" alt="">`:''}</span>
    <button class="open" data-open="${esc(c.id)}"><span class="nm">${esc(c.name)}</span><span class="meta">${bits.join('')}</span></button>
    <div class="stepper"><button data-step="-1" data-id="${esc(c.id)}" aria-label="Remove one ${esc(c.name)}"${dis}>−</button><output id="n-${esc(c.id)}">${displayCount(c)}</output><button data-step="1" data-id="${esc(c.id)}" aria-label="Add one ${esc(c.name)}"${dis}>+</button></div></div>`;
}
function renderLibrary(){
  const rows=filtered(),td=totalsDenom(),copies=rows.reduce((n,c)=>n+displayCount(c),0);
  $('resultCount').textContent=S.ready||rows.length?`${rows.length.toLocaleString()} entries, ${copies.toLocaleString()} cards`:'';
  const active=['f-q','f-type','f-energy','f-set','f-loc','f-check'].some(i=>$(i).value);
  $('clearFilters').hidden=!active;
  const L=$('ledger');
  if(!rows.length){
    const empty=S.ready&&!S.cards.length;
    L.innerHTML=`<div class="row" style="grid-template-columns:1fr"><span class="muted">${S.ready?(S.cards.length?'No cards match these filters.':'Your library is empty. Restore a backup file, or use Add card to enter your first one.'):'Your cards will appear here once the library loads.'}</span>${empty?'<span><button class="btn primary" id="restoreBtn">Restore from backup</button></span>':''}</div>`;
  }else L.innerHTML=rows.slice(0,S.limit).map(c=>rowHTML(c,td)).join('');
  $('more').hidden=rows.length<=S.limit;
  $('more').textContent=`Show more (${(rows.length-S.limit).toLocaleString()} left)`;
}
function renderSets(){
  const td=totalsDenom(),m={};
  for(const c of S.cards){if(!c.set)continue;const e=m[c.set]??={set:c.set,nums:new Set(),copies:0};if(denom(c)===td[c.set]||NO_TOTAL.has(c.set))e.nums.add(base(c));e.copies+=displayCount(c)}
  const list=Object.values(m).sort((a,b)=>b.copies-a.copies);
  $('sets').innerHTML=list.map(e=>{
    const total=NO_TOTAL.has(e.set)?0:parseInt(td[e.set],10)||0;
    const within=total?[...e.nums].filter(n=>parseInt(n,10)<=total).length:0,pct=total?Math.min(100,within/total*100):0;
    return `<button class="set" data-set="${esc(e.set)}"><span class="top"><h3>${esc(SETS[e.set]||e.set)}</h3><span class="mono small muted">${esc(e.set)}</span></span>
      ${total?`<span class="bar"><i style="width:${pct.toFixed(1)}%"></i></span><span class="small muted">${within} of ${total} set numbers, ${e.copies} cards</span>`:`<span class="small muted">${e.nums.size} different cards, ${e.copies} copies</span>`}</button>`}).join('')||'<p class="note">Sets appear here once your cards load.</p>';
}
function ckState(ck){
  const own=new Map();
  const total=ck.printed||'';
  for(const c of S.cards){if(c.set!==ck.code||denom(c)!==total)continue;
    const k=base(c)+(c.print==='Reverse Holofoil'?' RH':'');own.set(k,(own.get(k)||0)+displayCount(c))}
  return own;
}
function renderChecklist(){
  const el=$('checklist'),ck=S.checklists.PBL;
  if(!ck){el.innerHTML='<p class="note">Your Pitch Black checklist will appear here once the library loads.</p>';return}
  const own=ckState(ck),wish=new Set(ck.wish||[]);
  const have=ck.cards.filter(x=>own.has(x.id)).length;
  const groups=[...new Set(ck.cards.map(x=>x.r))];
  const pass=x=>S.ckFilter==='all'||(S.ckFilter==='need'&&!own.has(x.id))||(S.ckFilter==='have'&&own.has(x.id))||(S.ckFilter==='wish'&&wish.has(x.id));
  let html=`<div class="sectionhead"><div><h2>${esc(ck.name)} master set</h2><span class="small muted">${have} of ${ck.cards.length} collected, ${ck.cards.length-have} to go. Tap a faded card to wishlist it.</span></div>
    <div class="seg">${[['all','All'],['need','Need'],['have','Have'],['wish','Wishlist']].map(([k,l])=>`<button data-ck="${k}" aria-pressed="${S.ckFilter===k}">${l}</button>`).join('')}</div></div>
    <div class="bar"><i style="width:${(have/ck.cards.length*100).toFixed(1)}%"></i></div>`;
  for(const g of groups){
    const all=ck.cards.filter(x=>x.r===g),show=all.filter(pass);if(!show.length)continue;
    const got=all.filter(x=>own.has(x.id)).length;
    html+=`<div class="sectionhead"><h3>${esc(CK_RARITY[g]||g)}</h3><span class="small muted mono">${got}/${all.length}</span></div><div class="page">`+show.map(x=>{
      const h=own.has(x.id),w=wish.has(x.id);
      return `<button class="pocket${h?' have':w?' wish':''}" data-wish="${esc(x.id)}" aria-label="${esc(x.name)}, number ${esc(x.id)}, ${h?'collected':w?'on wishlist':'needed'}"${h||!S.canWrite?' aria-disabled="true"':''}>
        <img loading="lazy" src="${esc(tcgdexImage(`${TCGDEX[ck.code][0]}-${x.id.split(' ')[0]}`))}" alt=""><span class="n"><span>${esc(x.id)}</span><span>${h?'×'+own.get(x.id):w?'★':''}</span></span><span>${esc(x.name)}</span></button>`}).join('')+'</div>';
  }
  el.innerHTML=html;
}
function renderPlaces(){
  const sum=f=>S.cards.filter(f).reduce((n,c)=>n+displayCount(c),0);
  const locs=LOCATIONS.concat(allLocs().filter(l=>!LOCATIONS.includes(l)));
  const tile=(key,name,sub,bar)=>`<button class="set" data-loc="${esc(key)}"><span class="top"><h3>${esc(name)}</h3></span>${bar??''}<span class="small muted">${esc(sub)}</span></button>`;
  const decks=[...allDecks().map(d=>[d,sum(c=>c.loc==='In a Deck'&&c.deck===d)]),['',sum(c=>c.loc==='In a Deck'&&!c.deck)]].filter(([d,n])=>d||n);
  $('places').innerHTML=`<h2>Where your cards are</h2><div class="places">${locs.map(l=>{const n=sum(c=>c.loc===l);return tile(l,l,`${n.toLocaleString()} cards`)}).join('')}</div>
    <h2 style="margin-top:8px">Decks</h2><div class="places">${decks.map(([d,n])=>d
      ?tile('deck:'+d,d,`${n} of 60 cards`,`<span class="bar"><i style="width:${Math.min(100,n/60*100).toFixed(1)}%"></i></span>`)
      :tile('deck:','Not assigned to a deck',`${n} cards marked In a Deck`)).join('')}</div>`;
}

/* editing */
function bump(id,d){
  const c=S.byId.get(id);if(!c)return;
  const n=Math.max(1,displayCount(c)+d);S.pending[id]=n;
  const o=$('n-'+id);if(o)o.textContent=n;renderTally();
  clearTimeout(S.timers[id]);
  S.timers[id]=setTimeout(async()=>{
    try{await retry(()=>db.doc('cards/'+id).update({count:n}))}catch(e){toast(failMsg(e))}
    if(S.pending[id]===n)delete S.pending[id];
    queueRender();
  },450);
}
function openEditor(c){
  S.editing=c||null;
  $('editTitle').textContent=c?c.name:'Add card';
  const big=c?tcgdexImage(tcgdexId(c),'high'):'';$('e-img').hidden=!big;if(big)$('e-img').src=big;else $('e-img').removeAttribute('src');
  const set=(id,v)=>$(id).value=v??'';
  fillSelect($('e-type'),TYPES,'');fillSelect($('e-detail'),DETAILS,'');fillSelect($('e-energy'),ENERGIES,'None');fillSelect($('e-rarity'),RARITIES,'Not recorded');
  fillSelect($('e-print'),PRINTINGS);fillSelect($('e-pattern'),PATTERNS,'None');fillSelect($('e-stamp'),STAMPS,'None');
  const v=c||{count:1,print:'Normal',loc:'Box 2 (Red)'};
  for(const k of ['name','type','detail','energy','count','set','num','rarity','print','pattern','stamp','loc','deck','price','notes'])set('e-'+k,v[k]);
  if(!c)$('e-print').value='Normal';
  $('delBtn').hidden=!c||!S.canWrite;$('delBtn').textContent='Delete';delete $('delBtn').dataset.armed;
  $('saveBtn').hidden=!S.canWrite;
  $('moveBox').hidden=!(c&&S.canWrite);
  if(c){$('m-count').value=1;$('m-count').max=c.count;$('m-loc').value=c.loc==='In a Deck'?'Box 2 (Red)':'In a Deck';$('m-deck').value=''}
  $('editor').showModal();
}
function readForm(){
  const g=id=>$(id).value.trim(),price=parseFloat(g('e-price'));
  return clean({name:g('e-name'),type:g('e-type'),detail:g('e-detail'),energy:g('e-energy'),count:Math.max(1,parseInt(g('e-count'),10)||1),set:g('e-set'),num:g('e-num'),rarity:g('e-rarity'),print:g('e-print')||'Normal',pattern:g('e-pattern'),stamp:g('e-stamp'),loc:g('e-loc'),deck:g('e-deck'),price:Number.isFinite(price)?price:null,priceDate:S.editing?.priceDate,notes:g('e-notes')});
}
async function saveCard(ev){
  ev.preventDefault();
  const body=readForm(),was=S.editing;
  $('editor').close();
  try{
    if(was)await retry(()=>db.doc('cards/'+was.id).set(body));
    else await retry(()=>db.collection('cards').doc().set(body));
    toast(was?`Saved ${body.name}`:`Added ${body.name}`);
  }catch(e){toast(failMsg(e))}
}
async function moveCopies(){
  const c=S.editing;if(!c)return;
  const n=Math.min(c.count,Math.max(1,parseInt($('m-count').value,10)||1)),loc=$('m-loc').value.trim(),deck=$('m-deck').value.trim();
  if(!loc){toast('Choose where to move the cards.');return}
  if(loc===c.loc&&deck===(c.deck||'')){toast('These cards are already there.');return}
  const same=x=>x.id!==c.id&&identity(x)===identity(c)&&(x.stamp||'')===(c.stamp||'')&&(x.set||'')===(c.set||'')&&x.loc===loc&&(x.deck||'')===deck;
  const target=S.cards.find(same);
  $('editor').close();
  try{
    if(target)await retry(()=>db.doc('cards/'+target.id).update({count:target.count+n}));
    else{const{id,...rest}=c;await retry(()=>db.collection('cards').doc().set(clean({...rest,count:n,loc,deck})))}
    if(n>=c.count)await retry(()=>db.doc('cards/'+c.id).delete());
    else await retry(()=>db.doc('cards/'+c.id).update({count:c.count-n}));
    toast(`Moved ${n} ${c.name} to ${deck||loc}`);
  }catch(e){toast(failMsg(e))}
}
async function deleteCard(){
  const b=$('delBtn');
  if(!b.dataset.armed){b.dataset.armed='1';b.textContent='Confirm delete';return}
  const c=S.editing;$('editor').close();
  try{await retry(()=>db.doc('cards/'+c.id).delete());toast(`Deleted ${c.name}`)}catch(e){toast(failMsg(e))}
}
async function toggleWish(id){
  const ck=S.checklists.PBL;if(!ck||!S.canWrite)return;
  const w=new Set(ck.wish||[]);w.has(id)?w.delete(id):w.add(id);
  try{await retry(()=>db.doc('checklists/PBL').update({wish:[...w]}))}catch(e){toast(failMsg(e))}
}

/* import and export */
let IMP=null;
function planImport(rows){
  const idx=new Map();for(const c of S.cards){const k=identity(c);(idx.get(k)||idx.set(k,[]).get(k)).push(c)}
  const known=new Map(S.cards.map(c=>[norm(c.name),c]));
  return rows.map(parseTcgRow).filter(r=>r.name).map(r=>{const hits=idx.get(identity(r))||[];return {...r,hits,like:known.get(norm(r.name))}});
}
function openImport(rows){
  IMP=planImport(rows);
  const old=IMP.filter(r=>r.hits.length),fresh=IMP.filter(r=>!r.hits.length);
  $('impSummary').textContent=`${IMP.length} cards in this file: ${old.length} already in your library, ${fresh.length} new. Add to library raises the count on existing cards and creates the new ones, so import each scan only once.`;
  $('impList').innerHTML=IMP.map(r=>`<div>${r.hits.length?'+'+r.qty:'New'} <b>${esc(r.name)}</b> <span class="mono muted">${esc(r.num)}</span> <span class="muted">${esc(r.print)}${r.pattern?', '+esc(r.pattern):''}${r.price!=null?', '+money(r.price):''}</span></div>`).join('');
  $('impLoc').value='Box 2 (Red)';
  $('importer').showModal();
}
async function runImport(addCards){
  const plan=IMP||[],loc=$('impLoc').value.trim()||'Box 2 (Red)',today=new Date().toISOString().slice(0,10);
  $('importer').close();
  const jobs=[];
  for(const r of plan){
    const priced=r.price!=null?{price:r.price,priceDate:today}:{};
    r.hits.forEach((c,i)=>{
      const add=addCards&&i===0?{count:c.count+r.qty}:{};
      if(Object.keys({...priced,...add}).length)jobs.push(()=>db.doc('cards/'+c.id).update({...priced,...add}));
    });
    if(addCards&&!r.hits.length){
      const l=r.like||{};
      jobs.push(()=>db.collection('cards').doc().set(clean({name:r.name,type:l.type,detail:l.detail,energy:l.energy,count:r.qty,loc,set:r.set,num:r.num,rarity:r.rarity,print:r.print,pattern:r.pattern,stamp:r.stamp,...priced,notes:r.set?'':'Set: '+r.setName})));
    }
  }
  try{
    await pool(jobs,j=>j(),4,n=>banner(`Importing ${n} of ${jobs.length}…`));
    banner('');toast(addCards?`Imported ${plan.length} cards`:'Prices updated');
  }catch(e){banner('');toast(failMsg(e))}
}
async function exportCSV(){
  const head=['Card Name','Card Type','Detailed Type','Energy Type','Count','Location','Set Abbr.','Card Number','Rarity','Printing','Pattern','Stamp','TCG Market Price','Notes'];
  const q=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  const rows=[...S.cards].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>[c.name,c.type,c.detail,c.energy,c.count,c.loc,c.set,c.num,c.rarity,c.print,c.pattern,c.stamp,c.price,[c.deck,c.notes].filter(Boolean).join(', ')].map(q).join(','));
  download(`Card_Library_${stamp()}.csv`,'\uFEFF'+[head.join(','),...rows].join('\r\n'),'text/csv');
}
const stamp=()=>new Date().toISOString().slice(0,10).replace(/-/g,'');
function download(filename,data,type){
  const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');
  a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function downloadBackup(){
  download(`Card_Library_Backup_${stamp()}.json`,JSON.stringify({version:1,cards:S.cards,checklists:S.checklists}),'application/json');
}
async function restoreBackup(file){
  let data;
  try{data=JSON.parse(await file.text())}catch{toast('This file is not a Card Library backup.');return}
  if(!Array.isArray(data.cards)||!data.cards.every(c=>c.id&&c.name)){toast('This file is not a Card Library backup.');return}
  const ops=[...data.cards.map(({id,...set})=>({path:'cards/'+id,set})),...Object.entries(data.checklists||{}).map(([id,set])=>({path:'checklists/'+id,set}))];
  try{
    await db.batch(ops,n=>banner(`Restoring ${n} of ${ops.length}…`));
    banner('');toast(`Restored ${data.cards.length} entries`);
  }catch(e){banner('');toast(failMsg(e))}
}
async function updatePrices(){
  const btn=$('pricesBtn'),cards=S.cards.filter(c=>tcgdexId(c)&&!c.pattern&&!c.stamp),ids=[...new Set(cards.map(tcgdexId))],found={};
  btn.disabled=true;
  let done=0,failed=0;
  await Promise.all(Array.from({length:6},async()=>{
    while(ids.length){
      const id=ids.pop();
      try{
        const r=await fetch('https://api.tcgdex.net/v2/en/cards/'+encodeURIComponent(id));
        if(r.ok)found[id]=(await r.json()).pricing?.tcgplayer;else if(r.status!==404)failed++;
      }catch{failed++}
      banner(`Checking prices: ${++done} cards…`);
    }
  }));
  const ops=[];let priced=0;
  for(const c of cards){
    const t=found[tcgdexId(c)],p=marketPrice(t,c.print);
    if(p==null)continue;
    priced++;
    if(p!==c.price)ops.push({path:'cards/'+c.id,update:{price:p,priceDate:(t.updated||'').slice(0,10)}});
  }
  try{
    await db.batch(ops);
    banner('');toast(failed?`Updated ${priced} prices. ${failed} cards could not be reached; try again later.`:`Updated ${priced} prices. Stamped and patterned cards are left out.`);
  }catch(e){banner('');toast(failMsg(e))}
  btn.disabled=false;
}

/* wiring */
document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.id==='restoreBtn'){$('restoreFile').value='';$('restoreFile').click();return}
  if(t.dataset.view){S.view=t.dataset.view;S.limit=PAGE;render();return}
  if(t.dataset.open){const c=S.byId.get(t.dataset.open);if(c)openEditor(c);return}
  if(t.dataset.step){bump(t.dataset.id,+t.dataset.step);return}
  if(t.dataset.set){clearFilters();$('f-set').value=t.dataset.set;$('f-sort').value='set';S.view=t.dataset.set==='PBL'?'checklist':'library';render();return}
  if('loc'in t.dataset){clearFilters();const o=$('f-loc');
    if(![...o.options].some(x=>x.value===t.dataset.loc)&&t.dataset.loc==='deck:')o.add(new Option('Deck: not assigned','deck:'));
    o.value=t.dataset.loc;S.view='library';render();return}
  if(t.dataset.ck){S.ckFilter=t.dataset.ck;renderChecklist();return}
  if(t.dataset.wish&&!t.classList.contains('have')){toggleWish(t.dataset.wish);return}
});
function clearFilters(){for(const i of ['f-q','f-type','f-energy','f-set','f-loc','f-check'])$(i).value='';S.limit=PAGE}
for(const i of ['f-q','f-type','f-energy','f-set','f-loc','f-check','f-sort'])$(i).addEventListener(i==='f-q'?'input':'change',()=>{S.limit=PAGE;renderLibrary()});
$('clearFilters').onclick=()=>{clearFilters();renderLibrary()};
$('more').onclick=()=>{S.limit+=PAGE;renderLibrary()};
$('addBtn').onclick=()=>openEditor(null);
$('cancelBtn').onclick=()=>$('editor').close();
$('editForm').addEventListener('submit',saveCard);
$('delBtn').onclick=deleteCard;$('moveBtn').onclick=moveCopies;
$('e-name').addEventListener('change',()=>{
  if(S.editing)return;const l=S.cards.find(c=>norm(c.name)===norm($('e-name').value));if(!l)return;
  for(const k of ['type','detail','energy'])if(!$('e-'+k).value)$('e-'+k).value=l[k]||'';
});
$('importBtn').onclick=()=>{$('importFile').value='';$('importFile').click()};
$('importFile').addEventListener('change',async e=>{
  const f=e.target.files[0];if(!f)return;
  const rows=parseCSV(await f.text());
  if(!rows.length||!('Product Name'in rows[0])){toast('This does not look like a TCGplayer export. It needs a Product Name column.');return}
  openImport(rows);
});
$('impCancel').onclick=()=>$('importer').close();
$('impAdd').onclick=()=>runImport(true);$('impPrices').onclick=()=>runImport(false);
$('exportBtn').onclick=exportCSV;
$('backupBtn').onclick=downloadBackup;
$('pricesBtn').onclick=updatePrices;
$('restoreFile').addEventListener('change',e=>{const f=e.target.files[0];if(f)restoreBackup(f)});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG')e.target.hidden=true},true);
$('signInBtn').onclick=async()=>{
  try{await auth.signIn()}
  catch(e){if(!/popup-closed|cancelled-popup/.test(e.code||''))gate(e.code==='auth/unauthorized-domain'?'This web address is not on the Firebase authorized domains list yet.':'Sign-in did not finish. Try again.')}
};
$('signOutBtn').onclick=$('gateOutBtn').onclick=()=>auth.signOut();

let stops=[],slow;
function gate(msg,denied){
  $('gateMsg').textContent=msg;$('signInBtn').hidden=!!denied;$('gateOutBtn').hidden=!denied;
  $('gate').hidden=false;$('app').hidden=true;
}
function stopData(){
  stops.forEach(u=>u());stops=[];clearTimeout(slow);
  S.cards=[];S.byId=new Map();S.checklists={};S.ready=false;banner('');
}
function dataError(e){
  clearTimeout(slow);
  if(e.code==='permission-denied'){const who=$('who').textContent;stopData();gate(`${who} does not have access to this library.`,true);return}
  banner(e.code==='resource-exhausted'?'The free daily database limit has been reached. It resets at midnight Pacific time.':'Your library could not be loaded. Reload this page to try again.');
}
function startData(){
  slow=setTimeout(()=>banner('Your library is taking a while to load. Check your connection; it will appear when the connection returns.'),10000);
  stops.push(db.collection('cards').onSnapshot(snap=>{
    S.cards=snap.docs.map(d=>({id:d.id,count:1,...d.data()}));
    S.byId=new Map(S.cards.map(c=>[c.id,c]));
    if(!snap.metadata.fromCache){clearTimeout(slow);if($('banner').textContent.startsWith('Your library is taking'))banner('');S.ready=true}
    queueRender();
  },dataError));
  stops.push(db.collection('checklists').onSnapshot(snap=>{S.checklists=Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]));queueRender()},dataError));
}
function start(){
  const h=location.hash.slice(1);if(['library','sets','checklist','places'].includes(h))S.view=h;
  render();
  auth.onChange(user=>{
    stopData();
    if(!user){gate('Sign in with Google to open your collection.');return}
    $('gate').hidden=true;$('app').hidden=false;$('who').textContent=user.email;
    startData();render();
  });
}
start();
