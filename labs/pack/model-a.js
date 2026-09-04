const STORAGE_KEY = 'packlab.v1';
const DEFAULT_CATEGORIES = [
  'Pack','Shelter','Sleep system','Hiking clothes','Carried clothes','Electronics',
  'Camp stuff, tools and repair','Kitchen','Toiletries and meds','Consumables','Personal items'
];
function uid(prefix='id'){ return `${prefix}_${Math.random().toString(36).slice(2,9)}${Date.now().toString(36).slice(-4)}`; }
function esc(v=''){ return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function fmtWeight(g){ const n=Number(g)||0; return n>=1000 ? `${(n/1000).toFixed(n>=10000?1:2)} kg` : `${Math.round(n)} g`; }
function fmtDate(s){ if(!s) return 'Ingen dato'; try{return new Intl.DateTimeFormat('da-DK',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${s}T12:00:00`));}catch{return s;} }
function deepClone(v){ return JSON.parse(JSON.stringify(v)); }

function inferCategory(name, desc=''){
  const s=`${name} ${desc}`.toLowerCase();
  if(/backpack|pack liner|shoulder strap|drybag til backpack/.test(s)) return 'Pack';
  if(/hammock|tarp|stakes|ground sheet|mosquito net/.test(s) && !/underquilt/.test(s)) return 'Shelter';
  if(/topquilt|underquilt|sleeping bag|pillow/.test(s)) return 'Sleep system';
  if(/powerbank|cable|charger|headlamp|flashlight|phone|camera|tripod|headphones|watch|hygrometer|lightning/.test(s)) return 'Electronics';
  if(/gas burner|stove|cooking|pot|spoon|fork|plate|cup|mug|coffee filter|cutting board|bowl|cantene/.test(s)) return 'Kitchen';
  if(/soap|sanitizer|tooth|deodorant|painkiller|leukotape|wet wipe|sunscreen|lip balm|compeed|toilet paper|towel/.test(s)) return 'Toiletries and meds';
  if(/water$|1l|dry food|snacks|electrolyte|gas canister|oat meal|salt and pepper|smokes/.test(s)) return 'Consumables';
  if(/saw|knife|chair|trowel|lighter|tenacious|thread|tools bag|hiking poles|emergency blanket|trash bag/.test(s)) return 'Camp stuff, tools and repair';
  if(/keys|cards|passport|wallet|sunglasses|ear plugs/.test(s)) return 'Personal items';
  if(/extra|backup|down jacket|camp shoes|flannel/.test(s)) return 'Carried clothes';
  if(/shoe|rain pant|rain jacket|sock|mid layer|base layer|pants|cap|t-shirt|gloves|running shorts|boxers|buff/.test(s)) return 'Hiking clothes';
  return 'Camp stuff, tools and repair';
}

function buildDefaultTemplates(gear){
  const find=(name,descPart='')=>{
    const n=name.toLowerCase(), d=descPart.toLowerCase();
    return gear.find(g=>g.name.toLowerCase()===n && (!d || g.description.toLowerCase().includes(d)));
  };
  const by=(name,desc='')=>find(name,desc)?.id;
  const items=(ids)=>ids.filter(Boolean).map((gearId,i)=>({id:uid('ti'),gearId,category:gear.find(g=>g.id===gearId)?.defaultCategory||'Camp stuff, tools and repair',worn:false,consumable:false,notes:'',order:i}));
  const hammockIds=[
    by('Backpack','Mariposa'),by('Pack liner'),by('Hammock with straps'),by('Tarp with ridgeline and snakeskin'),
    by('Stakes and guylines'),by('Underquilt'),by('Underquilt protector'),by('Topquilt','Cumulus'),by('Pillow','Stuff sack'),
    by('Rain Jacket'),by('Rain Pants'),by('Headlamp'),by('Powerbank','Nitecore'),by('Universal USB Cable'),by('Phone'),
    by('Gas burner'),by('Titanium pot'),by('Long Spoon, knife and fork'),by('Lighter'),by('Water filter'),
    by('Toothbrush and paste'),by('Universal Soap'),by('Towel')
  ];
  const genericOvernight=[by('Backpack','Mariposa'),by('Pack liner'),by('Sleeping bag'),by('Ground Sheet'),by('Rain Jacket'),by('Headlamp'),by('Powerbank','Nitecore'),by('Phone'),by('Water filter'),by('Lighter'),by('Toothbrush and paste')];
  const day=[by('Rain Jacket'),by('Headlamp'),by('Powerbank','Nitecore'),by('Phone'),by('Water filter'),by('Sunglasses'),by('Hiking poles'),by('Snacks'),by('Emergency Blanket'),by('Camera')];
  const bike=[by('Sleeping bag'),by('Ground Sheet'),by('Rain Jacket'),by('Headlamp'),by('Powerbank','Nitecore'),by('Phone'),by('Water filter'),by('Gas burner'),by('Titanium pot'),by('Lighter'),by('Toothbrush and paste')];
  return [
    {id:'tpl_hammock',name:'Hammock / 3-season',icon:'◒',description:'Hammock, tarp, sleep system og dine gennemgående tur-items.',categories:deepClone(DEFAULT_CATEGORIES),items:items(hammockIds)},
    {id:'tpl_tent',name:'Tent / 3-season',icon:'△',description:'Starter til teltture. Tilføj dit telt, når det ligger i Gear Pool.',categories:deepClone(DEFAULT_CATEGORIES),items:items(genericOvernight)},
    {id:'tpl_day',name:'Day hike',icon:'↗',description:'Let basisliste til dagsture og foto-hikes.',categories:deepClone(DEFAULT_CATEGORIES),items:items(day)},
    {id:'tpl_bike',name:'Bikepacking / overnight',icon:'○',description:'Basis til en overnatning på cykel. Tasker kan tilføjes fra Gear Pool.',categories:deepClone(DEFAULT_CATEGORIES),items:items(bike)}
  ];
}

function initialState(){
  const gear=SEED_GEAR.map((g,i)=>({
    id:`gear_${String(i+1).padStart(3,'0')}`,
    name:g.name,
    weight:Number(g.weight)||0,
    description:g.description||'',
    storageId:null,
    defaultCategory:inferCategory(g.name,g.description),
    notes:'',
    url:'',
    archived:false
  }));
  return {
    version:1,
    gear,
    storage:[{id:'st_basement',type:'location',name:'Kælder',number:null,parentId:null}],
    templates:buildDefaultTemplates(gear),
    trips:[],
    activeTripId:null
  };
}
function loadState(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw){ const parsed=JSON.parse(raw); if(parsed && parsed.version===1) return parsed; }
  }catch(e){ console.warn('PackLab state load failed',e); }
  return initialState();
}
function saveState(){ localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
function commit(message){ saveState(); render(); if(message) showToast(message); }
