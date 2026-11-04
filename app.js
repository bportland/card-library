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
// TCGdex set id, printed total and language (English when left out) for each set abbreviation. Used for card images and prices.
const TCGDEX={ASC:['me02.5','217'],BLK:['sv10.5b','086'],CRI:['me04','086'],CRZ:['swsh12.5','159'],DRI:['sv10','182'],JTG:['sv09','159'],LOR:['swsh11','196'],MEE:['mee',''],MEG:['me01','132'],MEP:['mep',''],PAF:['sv04.5','091'],PAL:['sv02','193'],PAR:['sv04','182'],PBL:['me05','084'],PFL:['me02','094'],POR:['me03','088'],PRE:['sv08.5','131'],SCR:['sv07','142'],SFA:['sv06.5','064'],SSP:['sv08','191'],SVE:['sve',''],SVI:['sv01','198'],TEF:['sv05','162'],TWM:['sv06','167'],WHT:['sv10.5w','086'],sv8a:['SV8a','187','ja']};
const VARIANT={Normal:'normal',Holofoil:'holofoil','Reverse Holofoil':'reverse-holofoil'};
// Cards found through card search carry their own TCGdex id and image, so they work for any set.
function tcgdexId(c){
  if(c.tcg)return c.tcg;
  const s=TCGDEX[c.set];if(!s||!c.num)return '';
  const[n,total='']=c.num.split('/');
  return s[1]&&total!==s[1]?'':`${s[0]}-${n}`;
}
const tcgdexLang=c=>c.lang||(!c.tcg&&TCGDEX[c.set]?.[2])||'en';
const setOf=id=>id.slice(0,id.lastIndexOf('-'));
// TCGdex has no art for the basic energy sets, so those images come from Limitless TCG
const LIMITLESS_ART={mee:'MEE',sve:'SVE'};
function tcgdexImage(id,size='low',lang='en'){
  if(!id)return '';
  const i=id.lastIndexOf('-'),set=id.slice(0,i),code=LIMITLESS_ART[set];
  if(code&&lang==='en')return `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/${code}/${code}_${id.slice(i+1).padStart(3,'0')}_R_EN_${size==='high'?'LG':'SM'}.png`;
  let serie=set.match(/^[a-z]+/i)?.[0];
  if(!serie)return '';// sets such as 2018sm (McDonald's) have no art and no series prefix
  if(/^[a-z]+p$/.test(set))serie=serie.slice(0,-1);// promo sets such as mep live under their series
  return `https://assets.tcgdex.net/${lang}/${serie}/${set}/${id.slice(i+1)}/${size}.webp`;
}
const cardImage=(c,size='low')=>c.img?`${c.img}/${size}.webp`:tcgdexImage(tcgdexId(c),size,tcgdexLang(c));
function marketPrice(tcgplayer,print){
  if(!tcgplayer)return null;
  const hit=tcgplayer[VARIANT[print]]?.marketPrice;
  if(hit!=null)return hit;
  return print==='Reverse Holofoil'?null:tcgplayer.normal?.marketPrice??tcgplayer.holofoil?.marketPrice??null;
}
// Patterned printings have their own TCGdex variant and price; stamped ones have no price, and neither does Cosmos Holo
const FOIL={'Cosmos Holo':'cosmos','Poke Ball Pattern':'pokeball','Master Ball Pattern':'masterball','Energy Pattern':'energy','Team Rocket Pattern':'team-rocket','Quick Ball Pattern':'quickball','Love Ball Pattern':'loveball','Friend Ball Pattern':'friendball','Dusk Ball Pattern':'duskball'};
function cardPrice(d,print,pattern){
  if(!pattern)return {price:marketPrice(d?.pricing?.tcgplayer,print),updated:d?.pricing?.tcgplayer?.updated};
  const tp=(d?.variants_detailed||[]).find(v=>v.foil===FOIL[pattern]&&!v.stamp)?.pricing?.tcgplayer;
  return {price:tp?marketPrice(tp,print)??Object.values(tp).find(x=>x?.marketPrice!=null)?.marketPrice??null:null,updated:tp?.updated};
}
const numKey=s=>String(s).replace(/^0+(?=\d)/,'');
// Stamped printings are priced from TCGplayer listings: Play! stamps are prize pack cards, set logo stamps are promos
const sameNum=(a,b)=>{const x=String(a||'').split('/'),y=String(b||'').split('/');return x.length===y.length&&x.every((n,i)=>numKey(n)===numKey(y[i]))};
function stampPrice(list,c){
  const name=norm(c.name).replace(/[^a-z0-9]/g,''),group=c.stamp==='Play! Stamp'?'prize':c.set;
  const hit=(list?.cards||[]).find(x=>x.g===group&&sameNum(x.num,c.num)&&norm(x.name).replace(/[^a-z0-9]/g,'')===name
    &&!x.tags.includes('Staff')&&x.tags.some(t=>/cosmo/i.test(t))===(c.pattern==='Cosmos Holo'));
  return hit?hit.prices[c.print]??Object.values(hit.prices)[0]??null:null;
}
/*pure-end*/

const TYPES=['Pokemon','Trainer','Energy'];
const DETAILS=['Basic Pokemon','Stage 1 Pokemon','Stage 2 Pokemon','Item','Stadium','Tool','Supporter','Basic Energy','Special Energy'];
const ENERGIES=['Colorless','Dark','Dragon','Fairy','Fighting','Fire','Grass','Lightning','Metal','Psychic','Water'];
const LOCATIONS=['Green Binder','Blue Binder','Box 1 (Gray)','Box 2 (Red)','In a Deck'];
// Where whole decks are put away, shown on the Where's my deck? tab (stored in meta/decks)
const DECK_SPACES=['Deck Box 1','Deck Box 2','Gray Box','Red Box','Dragon Shield Box'];
const PATTERNS=['Cosmos Holo','Poke Ball Pattern','Master Ball Pattern','Energy Pattern','Team Rocket Pattern','Quick Ball Pattern','Love Ball Pattern','Friend Ball Pattern','Dusk Ball Pattern'];
const PRINTINGS=['Normal','Holofoil','Reverse Holofoil'];
const STAMPS=['Play! Stamp','Set Logo Stamp'];
const RARITIES=['Common','Uncommon','Rare','Double Rare','Ultra Rare','Illustration Rare','Special Illustration Rare','Hyper Rare','Mega Hyper Rare','Promo','ACE SPEC Rare','Other'];
const RARITY_MARK={Common:'●',Uncommon:'◆',Rare:'★','Double Rare':'★★','Ultra Rare':'★★','Illustration Rare':'★','Special Illustration Rare':'★★','Hyper Rare':'★★★','Mega Hyper Rare':'✦','ACE SPEC Rare':'★',Promo:'P'};
const NO_TOTAL=new Set(['MEP','UNK','Vintage']);
const CK_RARITY={C:'Common',U:'Uncommon',R:'Rare',DR:'Double Rare',IR:'Illustration Rare',UR:'Ultra Rare',SIR:'Special Illustration Rare',MHR:'Mega Hyper Rare',RH:'Reverse Holos',MAIN:'Main set',SECRET:'Secret rares'};
const VIEWS=['library','sets','checklist','places','decks','trade','activity'];
const PAGE=150,PRICE_DAYS=7;

const stored=(k,d)=>{try{return localStorage.getItem(k)??d}catch{return d}};
const store=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
const S={cards:[],byId:new Map(),checklists:{},activity:[],meta:{},view:'library',limit:PAGE,canWrite:true,ready:false,metaReady:false,ckFilter:'all',ckSel:stored('ck',''),ckNew:false,keep:+stored('keep','1')||1,editing:null,lookup:null,deckSel:'',me:'',pending:{},timers:{}};
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const denom=c=>(c.num||'').split('/')[1]||'';
const base=c=>(c.num||'').split('/')[0];
const newId=()=>db.collection('cards').doc().id;
const shortDate=iso=>new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'});

let toastTimer;
function toast(msg,action){
  const t=$('toast');t.replaceChildren(msg);
  if(action){const b=document.createElement('button');b.textContent=action.label;b.onclick=()=>{t.hidden=true;action.fn()};t.append(b)}
  t.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.hidden=true,action?8000:3500);
}
function banner(msg){const b=$('banner');b.hidden=!msg;b.textContent=msg||''}

async function retry(fn){
  for(let i=0;;i++){
    try{return await fn()}catch(e){
      if(!['resource-exhausted','unavailable','aborted','deadline-exceeded'].includes(e?.code)||i>=6)throw e;
      await sleep(800*(i+1)+Math.random()*400)}
  }
}
function failMsg(e){return e?.code==='resource-exhausted'?'The free daily database limit has been reached. Try again tomorrow.':e?.code==='permission-denied'?'This account cannot change the library.':'That change was not saved. Check your connection and try again.'}
function clean(o){const r={};for(const[k,v]of Object.entries(o))if(v!==''&&v!=null)r[k]=v;return r}

/* activity: every change is written together with a log entry that holds what is needed to undo it */
function prevDoc(path){
  const[col,id]=path.split('/');
  if(col==='cards'){const c=S.byId.get(id);if(!c)return null;const{id:_,...rest}=c;return rest}
  if(col==='checklists'){const ck=S.checklists[id];return ck?structuredClone(ck):null}
  if(col==='meta'){const m=S.meta[id];return m?structuredClone(m):null}
  return null;
}
async function act(text,ops,extra=[],more={}){
  const undo=ops.map(o=>{const p=prevDoc(o.path);return p?{path:o.path,set:p}:{path:o.path,delete:true}}).reverse();
  const id=newId();
  await retry(()=>db.batch([...ops,...extra,{path:'activity/'+id,set:{at:new Date().toISOString(),by:S.me,text,undo,...more}}]));
  return id;
}
const undoAction=id=>({label:'Undo',fn:()=>undoAct(id)});
async function undoAct(id){
  const i=S.activity.findIndex(a=>a.id===id),a=S.activity[i];
  if(!a||a.undone||!a.undo?.length)return;
  // A later change to the same card blocks this undo, unless that change was itself undone (the pair cancels out)
  const paths=new Set(a.undo.map(o=>o.path)),newer=S.activity.slice(0,i),newerIds=new Set(newer.map(x=>x.id));
  const later=newer.find(x=>!x.undone&&!(x.undoes&&newerIds.has(x.undoes))&&x.undo?.some(o=>paths.has(o.path)));
  if(later){toast(`“${later.text}” changed the same card afterwards. Undo that first.`);return}
  const extra=[{path:'activity/'+id,update:{undone:true}}];
  if(a.undoes&&S.activity.some(x=>x.id===a.undoes))extra.push({path:'activity/'+a.undoes,update:{undone:false}});// redo
  const text=a.text.startsWith('Undid: ')?a.text.replace('Undid: ','Redid: '):`Undid: ${a.text.replace(/^Redid: /,'')}`;
  try{await act(text,a.undo,extra,{undoes:id});toast(text)}
  catch(e){toast(failMsg(e))}
}

/* TCGdex */
const API='https://api.tcgdex.net/v2/',apiCache=new Map();
// Built weekly by .github/workflows/stamp-prices.yml
const STAMP_PRICES='https://raw.githubusercontent.com/bportland/card-library/prices/stamp-prices.json';
let stampList;
const stampPrices=()=>stampList??=fetch(STAMP_PRICES).then(r=>r.ok?r.json():null).catch(()=>null);
function api(path){
  if(!apiCache.has(path))apiCache.set(path,fetch(API+path).then(r=>{if(!r.ok)throw new Error(r.status);return r.json()}).catch(e=>{apiCache.delete(path);throw e}));
  return apiCache.get(path);
}
// Newest first, without TCG Pocket (the phone game) sets
async function tcgSets(){
  const all=await api('en/sets');
  return all.filter(s=>!(s.logo||'').includes('/tcgp/')&&!/^([AB]\d|P-[AB])/.test(s.id)).reverse();
}
const abbrFor=(setId,info)=>Object.keys(TCGDEX).find(k=>TCGDEX[k][0]===setId)||info?.abbreviation?.official||setId.toUpperCase();
function rarityFrom(r){
  if(!r||r==='None')return '';
  return RARITIES.find(x=>x.toLowerCase()===r.toLowerCase())||(/^rare/i.test(r)?'Rare':'Other');
}
// TCGdex gives energy cards no type, and marks some special energies (Growing Grass Energy) as basic,
// so the type comes from the name, or from the card text ("provides {G} Energy")
const ENERGY_WORDS='Grass|Fire|Water|Lightning|Psychic|Fighting|Darkness|Dark|Metal|Fairy|Dragon';
const ENERGY_LETTER={G:'Grass',R:'Fire',W:'Water',L:'Lightning',P:'Psychic',F:'Fighting',D:'Dark',M:'Metal',C:'Colorless',Y:'Fairy',N:'Dragon'};
const energyName=w=>w==='Darkness'?'Dark':w;
const typedSpecial=name=>String(name||'').match(new RegExp(`^(?!Basic )\\S+ (${ENERGY_WORDS}) Energy$`))?.[1];
function fromTcgdex(d,abbr){
  const total=d.set?.cardCount?.official||0;
  const basic=d.category==='Energy'&&d.energyType!=='Special'&&d.name.match(new RegExp(`^(?:Basic )?(${ENERGY_WORDS}) Energy$`))?.[1];
  const detail=d.category==='Pokemon'?`${(d.stage||'').replace(/(\d)/,' $1')} Pokemon`
    :d.category==='Trainer'?DETAILS.find(x=>(d.trainerType||'').includes(x))
    :d.category==='Energy'?(basic?'Basic Energy':'Special Energy'):'';
  const word=basic||(d.category==='Energy'&&typedSpecial(d.name)),letter=d.category==='Energy'&&(d.effect||'').match(/provides (?:\d+ )?\{([A-Z])\} Energy/)?.[1];
  const energy=word?energyName(word):letter?ENERGY_LETTER[letter]:energyName(d.types?.[0]||'');
  const print=d.variants&&!d.variants.normal&&d.variants.holo?'Holofoil':'Normal';
  return {name:basic&&ENERGIES.includes(energy)?`Basic ${energy} Energy`:d.name,type:TYPES.includes(d.category)?d.category:'',detail:DETAILS.includes(detail)?detail:'',energy:ENERGIES.includes(energy)?energy:'',
    set:abbr,num:total?`${d.localId}/${String(total).padStart(3,'0')}`:d.localId,rarity:rarityFrom(d.rarity),print,tcg:d.id,img:d.image||''};
}

/* derived data */
function setLabel(abbr){
  return SETS[abbr]||S.checklists[abbr]?.name||S.cards.find(c=>c.set===abbr&&c.setName)?.setName||abbr;
}
function totalsDenom(){
  const m={};
  for(const c of S.cards){const d=denom(c);if(!c.set||!d)continue;(m[c.set]??={})[d]=(m[c.set][d]||0)+1}
  const out={};for(const[s,v]of Object.entries(m))out[s]=Object.entries(v).sort((a,b)=>b[1]-a[1])[0][0];
  return out;
}
function reviewReason(c,td){
  if(!c.type)return 'Card type missing';
  if(c.set&&!c.num)return 'Card number missing';
  if(!c.set&&c.detail!=='Basic Energy')return 'Set missing';
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
    if(lo&&!(lo.startsWith('deck:')?(inDeck(c)&&(c.deck||'')===lo.slice(5)):c.loc===lo))return false;
    if(ck==='special'&&!c.pattern&&!c.stamp)return false;
    if(ck==='review'&&!reviewReason(c,td))return false;
    if(ck==='noset'&&c.set)return false;
    if(ck==='priced'&&c.price==null)return false;
    return true});
  const srt=$('f-sort').value,rk=c=>{const i=RARITIES.indexOf(c.rarity);return c.rarity==='Other'?0:i};
  const byName=(a,b)=>a.name.localeCompare(b.name);
  // Energy, then Pokemon, then Trainer; Basic Energy before Special Energy; then by energy type
  const tk=c=>{const t=['Energy','Pokemon','Trainer'].indexOf(c.type);return t<0?3:t},
    ek=c=>c.type!=='Energy'?0:c.detail==='Basic Energy'?0:c.detail==='Special Energy'?1:2;
  // Blank values go last (localeCompare would put a '~' placeholder before letters)
  const blankLast=(x,y)=>!x-!y||(x||'').localeCompare(y||'');
  rows.sort(srt==='type'?(a,b)=>tk(a)-tk(b)||ek(a)-ek(b)||blankLast(a.energy,b.energy)||byName(a,b)
    :srt==='set'?(a,b)=>blankLast(a.set,b.set)||(a.num||'').localeCompare(b.num||'')||byName(a,b)
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
  for(const v of VIEWS){$('view-'+v).hidden=S.view!==v;$('tab-'+v).setAttribute('aria-selected',S.view===v)}
  ({library:renderLibrary,sets:renderSets,checklist:renderChecklist,places:renderPlaces,decks:renderDecks,trade:renderTrade,activity:renderActivity})[S.view]();
}
function renderTally(){
  const copies=S.cards.reduce((n,c)=>n+displayCount(c),0),val=S.cards.reduce((n,c)=>n+(c.price||0)*displayCount(c),0),priced=S.cards.filter(c=>c.price!=null).length;
  const sets=new Set(S.cards.map(c=>c.set).filter(Boolean)).size,asOf=S.meta.prices?.at;
  $('tally').innerHTML=[[copies.toLocaleString(),'cards'],[S.cards.length.toLocaleString(),'entries'],[sets,'sets'],[priced?money(val):'—',priced?(asOf?`value as of ${shortDate(asOf)}`:`value, ${priced} priced`):'value, none priced']]
    .map(([b,s])=>`<div><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('');
}
function fillSelect(el,opts,placeholder){
  const cur=el.value;
  el.innerHTML=(placeholder!=null?`<option value="">${esc(placeholder)}</option>`:'')+opts.map(o=>Array.isArray(o)?`<option value="${esc(o[0])}">${esc(o[1])}</option>`:`<option>${esc(o)}</option>`).join('');
  el.value=[...el.options].some(o=>o.value===cur)?cur:'';
}
const allLocs=()=>[...new Set([...LOCATIONS,...S.cards.map(c=>c.loc).filter(Boolean)])];
const inDeck=c=>c.loc==='In a Deck';
// {spaces:[names], at:{deck name: space}}
const deckHome=()=>({spaces:DECK_SPACES,at:{},...S.meta.decks});
const whereText=c=>inDeck(c)?(c.deck?['Deck: '+c.deck,deckHome().at[c.deck]].filter(Boolean).join(' · '):'In a deck'):c.loc||'';
const allDecks=()=>[...new Set(S.cards.map(c=>c.deck).filter(Boolean))].sort();
function renderLists(){
  const sets=[...new Set(S.cards.map(c=>c.set).filter(Boolean))].sort((a,b)=>setLabel(a).localeCompare(setLabel(b)));
  fillSelect($('f-type'),TYPES,'All types');fillSelect($('f-energy'),ENERGIES,'All energy');
  fillSelect($('f-set'),sets.map(s=>[s,`${setLabel(s)} (${s})`]),'All sets');
  fillSelect($('f-loc'),[...allLocs().filter(l=>S.cards.some(c=>c.loc===l)),...allDecks().map(d=>['deck:'+d,'Deck: '+d])],'All locations');
  const td=totalsDenom();
  $('f-check').querySelector('[value="review"]').textContent=`Needs attention (${S.cards.filter(c=>reviewReason(c,td)).length})`;
  const dl=(id,vals)=>$(id).innerHTML=vals.map(v=>`<option value="${esc(v)}">`).join('');
  dl('nameList',[...new Set(S.cards.map(c=>c.name))].sort());dl('setList',[...new Set([...sets,...Object.keys(SETS)])]);dl('locList',allLocs());dl('deckList',allDecks());
}
function rarityMark(r){const m=RARITY_MARK[r];return m?`<span class="stars${r==='ACE SPEC Rare'?' ace':''}" aria-hidden="true">${m}</span> `:''}
const pipAttr=c=>c.energy?`style="--e:var(--e-${esc(c.energy.toLowerCase())})" title="${esc(c.energy)}"`:'';
const thumbHTML=c=>{const img=cardImage(c);return `<span class="thumb">${img?`<img loading="lazy" src="${esc(img)}" alt="">`:''}</span>`};
function rowHTML(c,td){
  const bits=[];
  if(c.set||c.num)bits.push(`<span class="mono">${esc([c.set,c.num].filter(Boolean).join(' '))}</span>`);
  else bits.push(`<span>${esc(c.detail||'')}</span>`);
  if(c.rarity)bits.push(`<span>${rarityMark(c.rarity)}${esc(c.rarity)}</span>`);
  if(c.print&&c.print!=='Normal')bits.push(`<span>${esc(c.print)}</span>`);
  if(c.pattern)bits.push(`<span class="tag">${esc(c.pattern)}</span>`);
  if(c.stamp)bits.push(`<span class="tag">${esc(c.stamp)}</span>`);
  bits.push(`<span>${esc(whereText(c))}</span>`);
  if(c.notes)bits.push(`<span>${esc(c.notes)}</span>`);
  const why=reviewReason(c,td);if(why)bits.push(`<span class="tag warn">${esc(why)}</span>`);
  if(c.price!=null)bits.push(`<span class="price">${money(c.price)}</span>`);
  const dis=S.canWrite?'':' disabled';
  return `<div class="row"><span class="pip" ${pipAttr(c)}></span>${thumbHTML(c)}
    <button class="open" data-open="${esc(c.id)}"><span class="nm">${esc(c.name)}</span><span class="meta">${bits.join('')}</span></button>
    <div class="stepper"><button data-step="-1" data-id="${esc(c.id)}" aria-label="Remove one ${esc(c.name)}"${dis}>−</button><output id="n-${esc(c.id)}">${displayCount(c)}</output><button data-step="1" data-id="${esc(c.id)}" aria-label="Add one ${esc(c.name)}"${dis}>+</button></div></div>`;
}
function renderLibrary(){
  const rows=filtered(),td=totalsDenom(),copies=rows.reduce((n,c)=>n+displayCount(c),0);
  $('resultCount').textContent=S.ready||rows.length?`${rows.length.toLocaleString()} entries, ${copies.toLocaleString()} cards`:'';
  const active=['f-q','f-type','f-energy','f-set','f-loc','f-check'].some(i=>$(i).value);
  $('clearFilters').hidden=!active;
  $('attnNote').hidden=$('f-check').value!=='review';
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
    return `<button class="set" data-set="${esc(e.set)}"><span class="top"><h3>${esc(setLabel(e.set))}</h3><span class="mono small muted">${esc(e.set)}</span></span>
      ${total?`<span class="bar"><i style="width:${pct.toFixed(1)}%"></i></span><span class="small muted">${within} of ${total} set numbers, ${e.copies} cards${S.checklists[e.set]?', has a checklist':''}</span>`:`<span class="small muted">${e.nums.size} different cards, ${e.copies} copies</span>`}</button>`}).join('')||'<p class="note">Sets appear here once your cards load.</p>';
}

/* checklists */
const ckList=()=>Object.entries(S.checklists).map(([id,ck])=>({...ck,id})).sort((a,b)=>a.name.localeCompare(b.name));
function currentCk(){const l=ckList();return l.find(x=>x.id===S.ckSel)||l[0]}
function ckState(ck){
  const own=new Map(),rh=ck.cards.some(x=>x.id.endsWith(' RH'));
  for(const c of S.cards){
    const hit=ck.tcg&&c.tcg?setOf(c.tcg)===ck.tcg:c.set===ck.code&&denom(c)===(ck.printed||'');
    if(!hit)continue;
    const k=numKey(base(c))+(rh&&c.print==='Reverse Holofoil'?' RH':'');own.set(k,(own.get(k)||0)+displayCount(c))}
  return own;
}
function pocketImage(ck,x){
  if(x.img)return x.img+'/low.webp';
  const s=TCGDEX[ck.code];
  return tcgdexImage(`${s?.[0]||ck.tcg}-${x.id.split(' ')[0]}`,'low',ck.lang||s?.[2]||'en');
}
function ownedSetIds(){
  const ids=new Set();
  for(const c of S.cards){const id=tcgdexId(c);if(id&&tcgdexLang(c)==='en')ids.add(setOf(id))}
  return ids;
}
async function fillNewChecklistSets(){
  try{
    const sets=await tcgSets(),sel=$('ckNewSet');if(!sel)return;
    const own=ownedSetIds(),opt=s=>`<option value="${esc(s.id)}">${esc(s.name)}${s.cardCount?.official?` (${s.cardCount.official} cards)`:''}</option>`;
    sel.innerHTML=`<optgroup label="Sets you have cards from">${sets.filter(s=>own.has(s.id)).map(opt).join('')}</optgroup><optgroup label="All sets, newest first">${sets.filter(s=>!own.has(s.id)).map(opt).join('')}</optgroup>`;
    if(S.ckNewVal)sel.value=S.ckNewVal;
  }catch{const sel=$('ckNewSet');if(sel)sel.innerHTML='<option value="">Set list unavailable. Check your connection.</option>'}
}
function renderChecklist(){
  const el=$('checklist'),list=ckList(),ck=currentCk();
  let html=`<div class="ckbar">${list.length?`<label class="field"><span>Checklist</span><select id="ckSel">${list.map(x=>`<option value="${esc(x.id)}"${x.id===ck.id?' selected':''}>${esc(x.name)}</option>`).join('')}</select></label>`:''}
    ${S.canWrite&&!S.ckNew?'<button class="btn" id="ckNew">New checklist</button>':''}${S.canWrite&&ck?'<button class="btn danger" id="ckRemove">Remove checklist</button>':''}</div>`;
  if(S.ckNew)html+=`<div class="ckbar"><label class="field grow"><span>Set to collect</span><select id="ckNewSet"><option value="">Loading sets…</option></select></label>
    <button class="btn primary" id="ckCreate">Start checklist</button><button class="btn" id="ckCancel">Cancel</button></div>`;
  if(!ck){
    el.innerHTML=html+`<p class="note">${S.ready?'No checklists yet. Use New checklist to pick a set and see which cards you still need.':'Your checklists will appear here once the library loads.'}</p>`;
    if(S.ckNew)fillNewChecklistSets();return;
  }
  const own=ckState(ck),wish=new Set(ck.wish||[]),have=ck.cards.filter(x=>own.has(numKey(x.id))).length;
  const printed=parseInt(ck.printed,10)||0,grp=x=>x.r||(!printed||parseInt(x.id,10)<=printed?'MAIN':'SECRET');
  const groups=[...new Set(ck.cards.map(grp))];
  const pass=x=>{const h=own.has(numKey(x.id));return S.ckFilter==='all'||(S.ckFilter==='need'&&!h)||(S.ckFilter==='have'&&h)||(S.ckFilter==='wish'&&wish.has(x.id))};
  html+=`<div class="sectionhead"><div><h2>${esc(ck.name)} master set</h2><span class="small muted">${have} of ${ck.cards.length} collected, ${ck.cards.length-have} to go. Tap a faded card to wishlist it.</span></div>
    <div class="seg">${[['all','All'],['need','Need'],['have','Have'],['wish','Wishlist']].map(([k,l])=>`<button data-ck="${k}" aria-pressed="${S.ckFilter===k}">${l}</button>`).join('')}</div></div>
    <div class="bar"><i style="width:${(have/ck.cards.length*100).toFixed(1)}%"></i></div>`;
  for(const g of groups){
    const all=ck.cards.filter(x=>grp(x)===g),show=all.filter(pass);if(!show.length)continue;
    const got=all.filter(x=>own.has(numKey(x.id))).length;
    html+=`<div class="sectionhead"><h3>${esc(CK_RARITY[g]||g)}</h3><span class="small muted mono">${got}/${all.length}</span></div><div class="page">`+show.map(x=>{
      const n=own.get(numKey(x.id)),h=!!n,w=wish.has(x.id);
      return `<button class="pocket${h?' have':w?' wish':''}" data-wish="${esc(x.id)}" aria-label="${esc(x.name)}, number ${esc(x.id)}, ${h?'collected':w?'on wishlist':'needed'}"${h||!S.canWrite?' aria-disabled="true"':''}>
        <img loading="lazy" src="${esc(pocketImage(ck,x))}" alt=""><span class="n"><span>${esc(x.id)}</span><span>${h?'×'+n:w?'★':''}</span></span><span>${esc(x.name)}</span></button>`}).join('')+'</div>';
  }
  el.innerHTML=html;
  if(S.ckNew)fillNewChecklistSets();
}
async function createChecklist(){
  const setId=$('ckNewSet')?.value;if(!setId)return;
  $('ckCreate').disabled=true;
  try{
    const info=await api('en/sets/'+encodeURIComponent(setId)),code=abbrFor(setId,info);
    S.ckNew=false;S.ckNewVal='';S.ckSel=code;store('ck',code);
    if(S.checklists[code]){renderChecklist();return}
    const official=info.cardCount?.official||0;
    const doc={code,name:info.name,printed:official?String(official).padStart(3,'0'):'',tcg:setId,cards:info.cards.map(x=>clean({id:x.localId,name:x.name,img:x.image})),wish:[]};
    await act(`Started the ${info.name} checklist`,[{path:'checklists/'+code,set:doc}]);
  }catch(e){toast(e?.code?failMsg(e):'That set could not be loaded. Check your connection and try again.');if($('ckCreate'))$('ckCreate').disabled=false}
}
async function removeChecklist(btn){
  if(!btn.dataset.armed){btn.dataset.armed='1';btn.textContent='Confirm remove';return}
  const ck=currentCk();if(!ck)return;
  try{const id=await act(`Removed the ${ck.name} checklist`,[{path:'checklists/'+ck.id,delete:true}]);toast(`Removed the ${ck.name} checklist`,undoAction(id))}
  catch(e){toast(failMsg(e))}
}

/* boxes and decks */
function deckIssues(cards){
  const sum=f=>cards.filter(f).reduce((n,c)=>n+displayCount(c),0),out=[],n=sum(()=>true);
  if(n!==60)out.push(n<60?`${60-n} short of 60`:`${n-60} over 60`);
  const byName=new Map();
  for(const c of cards){if(c.detail==='Basic Energy')continue;const k=norm(c.name),e=byName.get(k)||{name:c.name,n:0};e.n+=displayCount(c);byName.set(k,e)}
  for(const e of byName.values())if(e.n>4)out.push(`${e.n} copies of ${e.name}, 4 allowed`);
  const ace=sum(c=>c.rarity==='ACE SPEC Rare');if(ace>1)out.push(`${ace} ACE SPEC cards, 1 allowed`);
  const rad=sum(c=>/^radiant /i.test(c.name));if(rad>1)out.push(`${rad} Radiant Pokémon, 1 allowed`);
  if(!cards.some(c=>c.detail==='Basic Pokemon'))out.push('No Basic Pokémon');
  return out;
}
function renderPlaces(){
  const sum=f=>S.cards.filter(f).reduce((n,c)=>n+displayCount(c),0);
  const locs=LOCATIONS.concat(allLocs().filter(l=>!LOCATIONS.includes(l)));
  const tile=(key,name,sub,extra)=>`<button class="set" data-loc="${esc(key)}"><span class="top"><h3>${esc(name)}</h3></span>${extra??''}<span class="small muted">${esc(sub)}</span></button>`;
  const decks=allDecks(),loose=sum(c=>inDeck(c)&&!c.deck);
  $('places').innerHTML=`<h2>Where your cards are</h2><div class="places">${locs.map(l=>{const n=sum(c=>c.loc===l);return tile(l,l,`${n.toLocaleString()} cards`)}).join('')}</div>
    <h2 style="margin-top:8px">Decks</h2><div class="places">${decks.map(d=>{
      const cards=S.cards.filter(c=>inDeck(c)&&c.deck===d),n=cards.reduce((t,c)=>t+displayCount(c),0),issues=deckIssues(cards);
      const check=issues.length?`<ul class="issues">${issues.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>`:'<span class="small ok">✓ Meets the deck rules</span>';
      return tile('deck:'+d,d,[`${n} of 60 cards`,deckHome().at[d]].filter(Boolean).join(' · '),`<span class="bar"><i style="width:${Math.min(100,n/60*100).toFixed(1)}%"></i></span>${check}`)}).join('')}
    ${loose?tile('deck:','Not assigned to a deck',`${loose} cards marked In a Deck with no deck name`):''}</div>
    <p class="small muted">Deck checks cover 60 cards, at most 4 copies of a card name (Basic Energy excepted), one ACE SPEC, one Radiant Pokémon and at least one Basic Pokémon. They use the card type and rarity recorded in your library.</p>`;
}

/* where's my deck? */
function renderDecks(){
  const home=deckHome(),decks=allDecks(),spaces=home.spaces;
  const size=d=>S.cards.filter(c=>inDeck(c)&&c.deck===d).reduce((n,c)=>n+displayCount(c),0);
  const chip=d=>`<button class="deckchip${S.deckSel===d?' sel':''}" data-deck="${esc(d)}" aria-pressed="${S.deckSel===d}"><b>${esc(d)}</b><span class="small muted">${size(d)} card${size(d)===1?'':'s'}</span></button>`;
  const box=(space,name,list,canRemove)=>`<div class="space" data-space="${esc(space)}"><div class="top"><h3>${esc(name)}</h3>
      ${canRemove?`<button class="linkbtn small" data-delspace="${esc(space)}" aria-label="Remove ${esc(name)}">Remove</button>`:`<span class="small muted">${list.length} deck${list.length===1?'':'s'}</span>`}</div>
    ${list.map(chip).join('')||'<span class="small muted">Empty</span>'}</div>`;
  const loose=decks.filter(d=>!spaces.includes(home.at[d]));
  $('decks').innerHTML=`<div class="sectionhead"><div><h2>Where's my deck?</h2>
      <span class="small muted">${S.canWrite?(S.deckSel?`Now tap where the ${esc(S.deckSel)} deck is kept.`:'Drag a deck onto the place it is kept, or tap a deck and then tap a place.'):'Where each deck is put away.'}</span></div></div>
    <div class="spaces">${box('','Not put away',loose,false)}${spaces.map(s=>{const list=decks.filter(d=>home.at[d]===s);return box(s,s,list,S.canWrite&&!list.length)}).join('')}</div>
    ${S.canWrite?`<form class="addspace" id="addSpace"><label class="field"><span>New storage space</span><input id="spaceName" autocomplete="off" placeholder="Such as Blue Box"></label><button class="btn">Add</button></form>`:''}
    ${decks.length?'':'<p class="small muted">No decks yet. Give cards a deck name in the Deck field and they show up here.</p>'}`;
}
async function saveDeckHome(text,home){
  // Drop decks that no longer have cards, so renamed or broken-up decks don't linger
  const live=new Set(allDecks());home={spaces:home.spaces,at:Object.fromEntries(Object.entries(home.at).filter(([d])=>live.has(d)))};
  // act() records the undo from the current state before it awaits, so show the change only after calling it
  const saving=act(text,[{path:'meta/decks',set:home}]);
  S.meta={...S.meta,decks:home};renderDecks();
  try{toast(text,undoAction(await saving))}catch(e){toast(failMsg(e))}
}
function moveDeck(deck,space){
  const home=deckHome(),from=home.at[deck]||'';S.deckSel='';
  if(from===space){renderDecks();return}
  const at={...home.at};if(space)at[deck]=space;else delete at[deck];
  saveDeckHome(space?`Put the ${deck} deck in ${space}`:`Took the ${deck} deck out of ${from}`,{spaces:home.spaces,at});
}
// Pointer-based drag so it works with a finger as well as a mouse; a tap selects instead
let drag=null;
$('decks').addEventListener('pointerdown',e=>{
  const chip=e.target.closest('.deckchip');if(!chip||!S.canWrite||e.button>0)return;
  drag={chip,deck:chip.dataset.deck,x:e.clientX,y:e.clientY,ghost:null,over:null,id:e.pointerId};
});
$('decks').addEventListener('pointermove',e=>{
  if(!drag||e.pointerId!==drag.id)return;
  if(!drag.ghost){
    if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<6)return;
    const r=drag.chip.getBoundingClientRect();drag.dx=drag.x-r.left;drag.dy=drag.y-r.top;
    drag.ghost=drag.chip.cloneNode(true);drag.ghost.classList.add('ghost');drag.ghost.style.width=r.width+'px';document.body.append(drag.ghost);
    drag.chip.classList.add('dragging');try{drag.chip.setPointerCapture(e.pointerId)}catch{}
  }
  drag.ghost.style.transform=`translate(${e.clientX-drag.dx}px,${e.clientY-drag.dy}px)`;
  // Near the top or bottom edge, scroll so places further down a phone screen can be reached
  const edge=70;if(e.clientY<edge)scrollBy(0,-14);else if(e.clientY>innerHeight-edge)scrollBy(0,14);
  const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('.space');
  if(over!==drag.over){drag.over?.classList.remove('over');over?.classList.add('over');drag.over=over}
});
function endDrag(e,cancel){
  if(!drag||e.pointerId!==drag.id)return;
  const d=drag;drag=null;if(!d.ghost)return;
  d.ghost.remove();d.chip.classList.remove('dragging');d.over?.classList.remove('over');
  d.chip.dataset.dragged='1';// the click that follows a drag is not a tap
  if(!cancel&&d.over)moveDeck(d.deck,d.over.dataset.space);
}
$('decks').addEventListener('pointerup',e=>endDrag(e,false));
$('decks').addEventListener('pointercancel',e=>endDrag(e,true));
$('decks').addEventListener('click',e=>{
  if(!S.canWrite)return;
  const chip=e.target.closest('.deckchip');
  if(chip){if(chip.dataset.dragged){delete chip.dataset.dragged;return}S.deckSel=S.deckSel===chip.dataset.deck?'':chip.dataset.deck;renderDecks();return}
  const del=e.target.closest('[data-delspace]');
  if(del){const s=del.dataset.delspace,home=deckHome();saveDeckHome(`Removed the ${s} storage space`,{spaces:home.spaces.filter(x=>x!==s),at:home.at});return}
  const space=e.target.closest('.space');
  if(space&&S.deckSel)moveDeck(S.deckSel,space.dataset.space);
});
$('decks').addEventListener('submit',e=>{
  e.preventDefault();
  const name=$('spaceName').value.trim(),home=deckHome();if(!name)return;
  if(home.spaces.some(s=>s.toLowerCase()===name.toLowerCase())){toast(`${name} is already listed.`);return}
  saveDeckHome(`Added the ${name} storage space`,{spaces:[...home.spaces,name],at:home.at});
});
// Cards used to be filed under deck box locations; they are now In a Deck, and the box is where their deck is kept
let deckLocsChecked=false;
async function fixDeckLocations(){
  if(deckLocsChecked||!S.ready||!S.metaReady||!S.canWrite)return;
  deckLocsChecked=true;
  const moved=S.cards.filter(c=>/deck/i.test(c.loc||'')&&c.loc!=='In a Deck');
  if(!moved.length)return;
  const home=deckHome(),spaces=[...home.spaces],at={...home.at};
  for(const c of moved){
    const box=c.loc.replace(/^deckbox\s*(\d+)$/i,'Deck Box $1');
    if(!spaces.some(s=>s.toLowerCase()===box.toLowerCase()))spaces.push(box);
    if(c.deck&&!at[c.deck])at[c.deck]=spaces.find(s=>s.toLowerCase()===box.toLowerCase());
  }
  const ops=[...moved.map(c=>({path:'cards/'+c.id,update:{loc:'In a Deck'}})),{path:'meta/decks',set:{spaces,at}}];
  const text=`Moved ${moved.length} entr${moved.length===1?'y':'ies'} from deck box locations to In a Deck, and noted where their decks are kept`;
  try{const id=await act(text,ops);toast(text,undoAction(id))}catch{}
}

/* trade pile */
function tradeRows(){
  const groups=new Map();
  for(const c of S.cards){if(c.detail==='Basic Energy')continue;const k=[identity(c),c.set||'',c.stamp||''].join('|');(groups.get(k)||groups.set(k,[]).get(k)).push(c)}
  const rows=[];
  for(const g of groups.values()){
    const inDecks=g.filter(inDeck).reduce((n,c)=>n+displayCount(c),0),spare=g.filter(c=>!inDeck(c));
    const extra=spare.reduce((n,c)=>n+displayCount(c),0)-Math.max(0,S.keep-inDecks);
    if(extra>0)rows.push({c:[...spare].sort((a,b)=>b.count-a.count)[0],extra,inDecks,locs:[...new Set(spare.map(c=>c.loc).filter(Boolean))],price:g.find(c=>c.price!=null)?.price??null});
  }
  return rows.sort((a,b)=>(b.price||0)*b.extra-(a.price||0)*a.extra||b.extra-a.extra||a.c.name.localeCompare(b.c.name));
}
function renderTrade(){
  const rows=tradeRows(),n=rows.reduce((t,r)=>t+r.extra,0),val=rows.reduce((t,r)=>t+(r.price||0)*r.extra,0);
  $('trade').innerHTML=`<div class="sectionhead"><div><h2>Trade pile</h2><span class="small muted">${n.toLocaleString()} extra cards${val?`, worth about ${money(val)}`:''}</span></div>
    <label class="field inline"><span>Keep</span><select id="keepSel">${[1,2,3,4].map(k=>`<option value="${k}"${k===S.keep?' selected':''}>${k} of each card</option>`).join('')}</select></label></div>
    <p class="small muted">Extras are the copies outside your decks, after keeping the number you choose. A card your decks already use needs no spare. Basic Energy is left out.</p>
    <div class="ledger">${rows.length?rows.slice(0,S.limit).map(({c,extra,inDecks,locs,price})=>`<div class="row"><span class="pip" ${pipAttr(c)}></span>${thumbHTML(c)}
      <button class="open" data-open="${esc(c.id)}"><span class="nm">${esc(c.name)}</span><span class="meta">${c.set||c.num?`<span class="mono">${esc([c.set,c.num].filter(Boolean).join(' '))}</span>`:''}${c.rarity?`<span>${rarityMark(c.rarity)}${esc(c.rarity)}</span>`:''}${c.print&&c.print!=='Normal'?`<span>${esc(c.print)}</span>`:''}<span>${esc(locs.join(', '))}</span>${inDecks?`<span>${inDecks} in decks</span>`:''}${price!=null?`<span class="price">${money(price)} each</span>`:''}</span></button>
      <span class="extra"><b>${extra}</b> extra</span></div>`).join(''):'<div class="row" style="grid-template-columns:1fr"><span class="muted">No extra copies at this setting.</span></div>'}</div>
    ${rows.length>S.limit?`<div style="text-align:center"><button class="btn" id="tradeMore">Show more (${(rows.length-S.limit).toLocaleString()} left)</button></div>`:''}`;
}

/* activity */
function ago(iso){
  const t=new Date(iso),m=Math.round((Date.now()-t)/60000);
  if(m<1)return 'just now';if(m<60)return `${m} min ago`;
  const time=t.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'}),day=new Date();day.setHours(0,0,0,0);
  if(t>=day)return 'today at '+time;
  if(t>=day-864e5)return 'yesterday at '+time;
  return t.toLocaleDateString(undefined,{month:'short',day:'numeric',year:t.getFullYear()===day.getFullYear()?undefined:'numeric'})+' at '+time;
}
function renderActivity(){
  $('activity').innerHTML=`<div class="sectionhead"><div><h2>Recent activity</h2><span class="small muted">The last 100 changes either of you made. Undo puts the cards back the way they were before that change.</span></div></div>
    <div class="ledger">${S.activity.length?S.activity.map(a=>`<div class="arow${a.undone?' undone':''}"><div class="atext"><span class="nm">${esc(a.text)}</span>
      <span class="meta"><span>${esc(a.by||'Someone')}</span><span>${esc(ago(a.at))}</span>${a.undone?'<span class="tag">Undone</span>':''}</span></div>
      ${a.undo?.length&&!a.undone&&S.canWrite?`<button class="btn" data-undo="${esc(a.id)}">${a.text.startsWith('Undid: ')?'Redo':'Undo'}</button>`:''}</div>`).join(''):'<div class="arow"><span class="muted">Changes will be listed here as you make them.</span></div>'}</div>`;
}

/* editing */
function bump(id,d){
  const c=S.byId.get(id);if(!c)return;
  const n=Math.max(1,displayCount(c)+d);S.pending[id]=n;
  const o=$('n-'+id);if(o)o.textContent=n;renderTally();
  clearTimeout(S.timers[id]);
  S.timers[id]=setTimeout(async()=>{
    const cur=S.byId.get(id);
    if(cur&&cur.count!==n){
      try{await act(`${cur.name}: ${cur.count} → ${n} copies`,[{path:'cards/'+id,update:{count:n}}])}catch(e){toast(failMsg(e))}
    }
    if(S.pending[id]===n)delete S.pending[id];
    queueRender();
  },600);
}
function openEditor(c){
  if($('editor').open)$('editor').close();
  S.editing=c||null;S.lookup=null;
  $('editTitle').textContent=c?c.name:'Add card';
  showBig(c?cardImage(c,'high'):'');
  const set=(id,v)=>$(id).value=v??'';
  fillSelect($('e-type'),TYPES,'');fillSelect($('e-detail'),DETAILS,'');fillSelect($('e-energy'),ENERGIES,'None');fillSelect($('e-rarity'),RARITIES,'Not recorded');
  fillSelect($('e-print'),PRINTINGS);fillSelect($('e-pattern'),PATTERNS,'None');fillSelect($('e-stamp'),STAMPS,'None');
  // A new card goes where the library is filtered to, otherwise the location starts blank and must be chosen
  const lo=$('f-loc').value,deck=lo.startsWith('deck:');
  const v=c||{count:1,print:'Normal',loc:deck?'In a Deck':lo,deck:deck?lo.slice(5):''};
  for(const k of ['name','type','detail','energy','count','set','num','rarity','print','pattern','stamp','loc','deck','price','notes'])set('e-'+k,v[k]);
  if(!c)$('e-print').value='Normal';
  $('lookup').hidden=!S.canWrite;$('lookup').open=!c;
  $('lookupSum').textContent=c?'Look up this card to fill in its set, number and picture':'Find the card';
  $('l-q').value=c?c.name.replace(/\s*\((JPN|CHN)\)$/,''):'';$('l-results').innerHTML='';lookupMsg('');
  fillLookupSets(c&&TCGDEX[c.set]&&!TCGDEX[c.set][2]?TCGDEX[c.set][0]:c?.tcg?setOf(c.tcg):'');
  $('delBtn').hidden=!c||!S.canWrite;$('delBtn').textContent='Delete';delete $('delBtn').dataset.armed;
  $('saveBtn').hidden=!S.canWrite;
  $('moveBox').hidden=!(c&&S.canWrite);
  if(c){$('m-count').value=1;$('m-count').max=c.count;$('m-loc').value=inDeck(c)?'Box 2 (Red)':'In a Deck';$('m-deck').value=''}
  $('editor').showModal();
  if(!c)$('l-q').focus();
}
function showBig(src){$('e-img').hidden=!src;if(src)$('e-img').src=src;else $('e-img').removeAttribute('src')}
function lookupMsg(html){$('l-msg').innerHTML=html;$('l-msg').hidden=!html}
async function fillLookupSets(want){
  const sel=$('l-set');
  try{
    const sets=await tcgSets(),cur=want??sel.value;
    sel.innerHTML='<option value="">Any set</option>'+sets.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    sel.value=sets.some(s=>s.id===cur)?cur:'';
  }catch{}
}
async function runLookup(){
  const q=$('l-q').value.trim(),setId=$('l-set').value,R=$('l-results');
  if(!q&&!setId){lookupMsg('Type a card name, or choose a set.');return}
  lookupMsg('Searching…');R.innerHTML='';
  try{
    const sets=await tcgSets(),order=new Map(sets.map((s,i)=>[s.id,i])),names=new Map(sets.map(s=>[s.id,s.name]));
    let list=setId?(await api('en/sets/'+encodeURIComponent(setId))).cards:await api('en/cards?name='+encodeURIComponent(q));
    if(setId&&q)list=list.filter(x=>/^\d+$/.test(q)?numKey(x.localId)===numKey(q):norm(x.name).includes(norm(q)));
    list=list.filter(x=>order.has(setOf(x.id)));
    list.sort((a,b)=>order.get(setOf(a.id))-order.get(setOf(b.id))||String(a.localId).localeCompare(String(b.localId),undefined,{numeric:true}));
    if(!list.length){lookupMsg('No cards found. Check the spelling, or try a shorter name.');return}
    const max=120;
    lookupMsg(list.length>max?`Showing the newest ${max} of ${list.length} cards. Choose a set to narrow it down.`:`${list.length} card${list.length===1?'':'s'} found. Tap the one you have.`);
    R.innerHTML=list.slice(0,max).map(x=>{const img=x.image?x.image+'/low.webp':tcgdexImage(x.id);return `<button type="button" class="pick" data-pick="${esc(x.id)}">${img?`<img loading="lazy" src="${esc(img)}" alt="">`:'<span class="noimg"></span>'}
      <span class="nm">${esc(x.name)}</span><span class="small muted">${esc(names.get(setOf(x.id)))} · ${esc(x.localId)}</span></button>`}).join('');
  }catch{lookupMsg('Card search is unavailable right now. Check your connection and try again.')}
}
async function pickCard(id){
  lookupMsg('Loading card…');
  try{
    const setId=setOf(id),[d,info]=await Promise.all([api('en/cards/'+encodeURIComponent(id)),api('en/sets/'+encodeURIComponent(setId)).catch(()=>null)]);
    const abbr=abbrFor(setId,info),c=fromTcgdex(d,abbr);
    const print=S.editing?$('e-print').value||'Normal':c.print;
    S.lookup={set:c.set,num:c.num,tcg:c.tcg,img:c.img,setName:SETS[abbr]?'':(info?.name||d.set?.name||''),card:d};
    for(const k of ['name','type','detail','energy','set','num','rarity'])$('e-'+k).value=c[k]||'';
    $('e-print').value=print;lookupPrice();
    showBig(cardImage(c,'high'));$('l-results').innerHTML='';$('lookup').open=false;
    let msg=`Filled in from ${esc(info?.name||abbr)} ${esc(c.num)}. Check the printing, count and location, then save.`;
    if(!S.editing){
      const same=S.cards.filter(x=>x.tcg===c.tcg||(x.set===c.set&&x.num===c.num));
      if(same.length)msg+=` <br>You already have ${same.reduce((n,x)=>n+x.count,0)} of this card (${esc([...new Set(same.map(whereText))].join(', '))}). <button type="button" class="linkbtn" data-open="${esc(same[0].id)}">Open that entry instead</button>`;
    }
    $('lookupDone').innerHTML=msg;$('lookupDone').hidden=false;lookupMsg('');
  }catch{lookupMsg('That card could not be loaded. Check your connection and try again.')}
}
function readForm(){
  const g=id=>$(id).value.trim(),price=parseFloat(g('e-price')),set=g('e-set'),num=g('e-num');
  // Keep the TCGdex link only while the set and number still match the card it came from
  const ref=[S.lookup,S.editing].find(r=>r&&(r.set||'')===set&&(r.num||'')===num)||{};
  return clean({name:g('e-name'),type:g('e-type'),detail:g('e-detail'),energy:g('e-energy'),count:Math.max(1,parseInt(g('e-count'),10)||1),set,num,rarity:g('e-rarity'),print:g('e-print')||'Normal',pattern:g('e-pattern'),stamp:g('e-stamp'),loc:g('e-loc'),deck:g('e-deck'),
    price:Number.isFinite(price)?price:null,priceDate:S.lookup?.priceDate||S.editing?.priceDate,notes:g('e-notes'),tcg:ref.tcg,img:ref.img,lang:ref.lang,setName:ref.setName});
}
async function saveCard(ev){
  ev.preventDefault();
  const body=readForm(),was=S.editing;
  $('editor').close();
  try{
    const text=was?`Edited ${body.name}`:`Added ${body.count}× ${body.name}`;
    const id=await act(text,[{path:'cards/'+(was?was.id:newId()),set:body}]);
    toast(was?`Saved ${body.name}`:`Added ${body.name}`,undoAction(id));
  }catch(e){toast(failMsg(e))}
}
async function moveCopies(){
  const c=S.editing;if(!c)return;
  const n=Math.min(c.count,Math.max(1,parseInt($('m-count').value,10)||1)),loc=$('m-loc').value.trim(),deck=$('m-deck').value.trim();
  if(!loc){toast('Choose where to move the cards.');return}
  if(loc===c.loc&&deck===(c.deck||'')){toast('These cards are already there.');return}
  const same=x=>x.id!==c.id&&identity(x)===identity(c)&&(x.stamp||'')===(c.stamp||'')&&(x.set||'')===(c.set||'')&&x.loc===loc&&(x.deck||'')===deck;
  const target=S.cards.find(same),ops=[];
  if(target)ops.push({path:'cards/'+target.id,update:{count:target.count+n}});
  else{const{id,...rest}=c;ops.push({path:'cards/'+newId(),set:clean({...rest,count:n,loc,deck})})}
  ops.push(n>=c.count?{path:'cards/'+c.id,delete:true}:{path:'cards/'+c.id,update:{count:c.count-n}});
  $('editor').close();
  try{const id=await act(`Moved ${n}× ${c.name} to ${deck||loc}`,ops);toast(`Moved ${n} ${c.name} to ${deck||loc}`,undoAction(id))}
  catch(e){toast(failMsg(e))}
}
async function deleteCard(){
  const b=$('delBtn');
  if(!b.dataset.armed){b.dataset.armed='1';b.textContent='Confirm delete';return}
  const c=S.editing;$('editor').close();
  try{const id=await act(`Deleted ${c.count}× ${c.name}`,[{path:'cards/'+c.id,delete:true}]);toast(`Deleted ${c.name}`,undoAction(id))}
  catch(e){toast(failMsg(e))}
}
async function toggleWish(xid){
  const ck=currentCk();if(!ck||!S.canWrite)return;
  const w=new Set(ck.wish||[]),on=!w.has(xid);on?w.add(xid):w.delete(xid);
  const name=ck.cards.find(x=>x.id===xid)?.name||xid;
  try{await act(`${on?'Wishlisted':'Took off the wishlist:'} ${name} (${ck.name} ${xid})`,[{path:'checklists/'+ck.id,update:{wish:[...w]}}])}catch(e){toast(failMsg(e))}
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
  const ops=[];
  for(const r of plan){
    const priced=r.price!=null?{price:r.price,priceDate:today}:{};
    r.hits.forEach((c,i)=>{
      const add=addCards&&i===0?{count:c.count+r.qty}:{};
      if(Object.keys({...priced,...add}).length)ops.push({path:'cards/'+c.id,update:{...priced,...add}});
    });
    if(addCards&&!r.hits.length){
      const l=r.like||{};
      ops.push({path:'cards/'+newId(),set:clean({name:r.name,type:l.type,detail:l.detail,energy:l.energy,count:r.qty,loc,set:r.set,num:r.num,rarity:r.rarity,print:r.print,pattern:r.pattern,stamp:r.stamp,...priced,notes:r.set?'':'Set: '+r.setName})});
    }
  }
  banner(addCards?'Importing…':'Updating prices…');
  try{
    let id;
    if(addCards)id=await act(`Imported ${plan.reduce((n,r)=>n+r.qty,0)} cards from TCGplayer`,ops);
    else await db.batch(ops);
    banner('');toast(addCards?`Imported ${plan.length} cards`:'Prices updated',id&&undoAction(id));
  }catch(e){banner('');toast(failMsg(e))}
}
async function exportCSV(){
  const head=['Card Name','Card Type','Detailed Type','Energy Type','Count','Location','Set Abbr.','Card Number','Rarity','Printing','Pattern','Stamp','TCG Market Price','Notes'];
  const q=v=>{const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  const rows=[...S.cards].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>[c.name,c.type,c.detail,c.energy,c.count,c.loc,c.set,c.num,c.rarity,c.print,c.pattern,c.stamp,c.price,[c.deck,c.notes].filter(Boolean).join(', ')].map(q).join(','));
  download(`Card_Library_${stamp()}.csv`,'﻿'+[head.join(','),...rows].join('\r\n'),'text/csv');
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
// quiet: the automatic weekly refresh, which shows no progress banner
async function updatePrices(quiet){
  const btn=$('pricesBtn'),key=c=>tcgdexLang(c)+'/'+tcgdexId(c);
  const cards=S.cards.filter(c=>tcgdexId(c)&&!c.stamp),keys=[...new Set(cards.map(key))],found={};
  btn.disabled=true;
  const stamps=await stampPrices();
  try{await db.doc('meta/prices').set({at:new Date().toISOString(),by:S.me})}catch{}
  let done=0,failed=0;
  await Promise.all(Array.from({length:6},async()=>{
    while(keys.length){
      const k=keys.pop(),[lang,id]=k.split('/');
      try{
        const r=await fetch(`${API}${lang}/cards/${encodeURIComponent(id)}`);
        if(r.ok)found[k]=await r.json();else if(r.status!==404)failed++;
      }catch{failed++}
      done++;if(!quiet)banner(`Checking prices: ${done} cards…`);
    }
  }));
  const ops=[];let priced=0;
  for(const c of cards){
    const {price:p,updated}=cardPrice(found[key(c)],c.print,c.pattern);
    if(p==null)continue;
    priced++;
    if(p!==c.price)ops.push({path:'cards/'+c.id,update:{price:p,priceDate:(updated||'').slice(0,10)}});
  }
  for(const c of S.cards.filter(c=>c.stamp)){
    const p=stampPrice(stamps,c);
    if(p==null)continue;
    priced++;
    if(p!==c.price)ops.push({path:'cards/'+c.id,update:{price:p,priceDate:stamps.updated}});
  }
  try{
    await db.batch(ops);
    banner('');
    if(!quiet)toast(failed?`Updated ${priced} prices. ${failed} cards could not be reached; try again later.`:`Updated ${priced} prices. Cards with no match keep the price you entered.`);
    else if(ops.length)toast(`Prices refreshed for this week: ${ops.length} changed.`);
  }catch(e){banner('');if(!quiet)toast(failMsg(e))}
  btn.disabled=false;
}
// Special energies added through card search before the type fix were saved as Basic Energy with no type
let energyChecked=false;
async function fixSpecialEnergies(){
  if(energyChecked||!S.ready||!S.canWrite)return;
  energyChecked=true;
  const ops=S.cards.filter(c=>{const w=typedSpecial(c.name);return w&&(c.type!=='Energy'||c.detail!=='Special Energy'||c.energy!==energyName(w))})
    .map(c=>({path:'cards/'+c.id,update:{type:'Energy',detail:'Special Energy',energy:energyName(typedSpecial(c.name))}}));
  if(!ops.length)return;
  const text=`Set the energy type on ${ops.length} special energ${ops.length===1?'y':'ies'}`;
  try{const id=await act(text,ops);toast(text,undoAction(id))}catch{}
}
let autoPriced=false;
function maybeAutoPrices(){
  if(autoPriced||!S.ready||!S.metaReady||!S.canWrite||!S.cards.length)return;
  const last=S.meta.prices?.at;
  if(last&&Date.now()-Date.parse(last)<PRICE_DAYS*864e5)return;
  autoPriced=true;updatePrices(true);
}

/* wiring */
document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.id==='restoreBtn'){$('restoreFile').value='';$('restoreFile').click();return}
  if(t.dataset.view){S.view=t.dataset.view;S.limit=PAGE;render();return}
  if(t.dataset.open){const c=S.byId.get(t.dataset.open);if(c)openEditor(c);return}
  if(t.dataset.step){bump(t.dataset.id,+t.dataset.step);return}
  if(t.dataset.pick){pickCard(t.dataset.pick);return}
  if(t.dataset.undo){undoAct(t.dataset.undo);return}
  if(t.dataset.set){
    const s=t.dataset.set;clearFilters();
    if(S.checklists[s]){S.ckSel=s;S.view='checklist'}else{$('f-set').value=s;$('f-sort').value='set';S.view='library'}
    render();return}
  if('loc'in t.dataset){clearFilters();const o=$('f-loc');
    if(![...o.options].some(x=>x.value===t.dataset.loc)&&t.dataset.loc==='deck:')o.add(new Option('Deck: not assigned','deck:'));
    o.value=t.dataset.loc;S.view='library';render();return}
  if(t.dataset.ck){S.ckFilter=t.dataset.ck;renderChecklist();return}
  if(t.dataset.wish&&!t.classList.contains('have')){toggleWish(t.dataset.wish);return}
  if(t.id==='ckNew'){S.ckNew=true;renderChecklist();return}
  if(t.id==='ckCancel'){S.ckNew=false;renderChecklist();return}
  if(t.id==='ckCreate'){createChecklist();return}
  if(t.id==='ckRemove'){removeChecklist(t);return}
  if(t.id==='tradeMore'){S.limit+=PAGE;renderTrade();return}
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='keepSel'){S.keep=+t.value;store('keep',t.value);renderTrade()}
  if(t.id==='ckSel'){S.ckSel=t.value;store('ck',t.value);renderChecklist()}
  if(t.id==='ckNewSet')S.ckNewVal=t.value;
});
function clearFilters(){for(const i of ['f-q','f-type','f-energy','f-set','f-loc','f-check'])$(i).value='';S.limit=PAGE}
for(const i of ['f-q','f-type','f-energy','f-set','f-loc','f-check','f-sort'])$(i).addEventListener(i==='f-q'?'input':'change',()=>{S.limit=PAGE;renderLibrary()});
$('clearFilters').onclick=()=>{clearFilters();renderLibrary()};
$('more').onclick=()=>{S.limit+=PAGE;renderLibrary()};
$('addBtn').onclick=()=>openEditor(null);
$('cancelBtn').onclick=()=>$('editor').close();
$('editor').addEventListener('close',()=>{$('lookupDone').hidden=true});
$('editForm').addEventListener('submit',saveCard);
$('delBtn').onclick=deleteCard;$('moveBtn').onclick=moveCopies;
$('l-go').onclick=runLookup;
$('l-q').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();runLookup()}});
$('l-set').addEventListener('change',runLookup);
// After a lookup, keep the price in step with the chosen printing and pattern
// A stamped card's price is filled in only when a TCGplayer listing matches, so a typed price isn't cleared
async function lookupPrice(){
  if($('e-stamp').value){
    const list=await stampPrices(),f=readForm(),p=stampPrice(list,f);
    if(p!=null&&$('e-stamp').value===f.stamp){$('e-price').value=p;if(S.lookup)S.lookup.priceDate=list.updated}
    return;
  }
  if(!S.lookup?.card)return;
  const {price,updated}=cardPrice(S.lookup.card,$('e-print').value,$('e-pattern').value);
  $('e-price').value=price??'';S.lookup.priceDate=(updated||'').slice(0,10);
}
for(const i of ['e-print','e-pattern','e-stamp'])$(i).addEventListener('change',lookupPrice);
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
$('pricesBtn').onclick=()=>updatePrices(false);
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
  S.cards=[];S.byId=new Map();S.checklists={};S.activity=[];S.meta={};S.ready=false;S.metaReady=false;autoPriced=false;banner('');
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
    if(!snap.metadata.fromCache){clearTimeout(slow);if($('banner').textContent.startsWith('Your library is taking'))banner('');S.ready=true;maybeAutoPrices();fixSpecialEnergies();fixDeckLocations()}
    queueRender();
  },dataError));
  stops.push(db.collection('checklists').onSnapshot(snap=>{S.checklists=Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]));queueRender()},dataError));
  stops.push(db.collection('meta').onSnapshot(snap=>{
    S.meta=Object.fromEntries(snap.docs.map(d=>[d.id,d.data()]));
    if(!snap.metadata.fromCache){S.metaReady=true;maybeAutoPrices();fixDeckLocations()}
    queueRender();
  },dataError));
  stops.push(db.collection('activity').recent('at',100,snap=>{S.activity=snap.docs.map(d=>({...d.data(),id:d.id}));if(S.view==='activity')queueRender()},dataError));
}
function start(){
  const h=location.hash.slice(1);if(VIEWS.includes(h))S.view=h;
  render();
  auth.onChange(user=>{
    stopData();
    if(!user){gate('Sign in with Google to open your collection.');return}
    $('gate').hidden=true;$('app').hidden=false;$('who').textContent=user.email;
    S.me=(user.displayName||'').split(' ')[0]||user.email;
    startData();render();
  });
}
start();
