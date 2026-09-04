function bindDnD(){
  document.querySelectorAll('[data-pool-gear]').forEach(el=>{
    el.ondragstart=e=>{ if(el.classList.contains('in-trip')){e.preventDefault();return;} el.classList.add('dragging');e.dataTransfer.setData('text/plain',`pool:${el.dataset.poolGear}`);e.dataTransfer.effectAllowed='copy'; };
    el.ondragend=()=>el.classList.remove('dragging');
  });
  document.querySelectorAll('[data-trip-item]').forEach(el=>{
    el.ondragstart=e=>{el.classList.add('dragging');e.dataTransfer.setData('text/plain',`trip:${el.dataset.tripItem}`);e.dataTransfer.effectAllowed='move';};
    el.ondragend=()=>el.classList.remove('dragging');
  });
  document.querySelectorAll('[data-drop-category]').forEach(el=>{
    el.ondragover=e=>{e.preventDefault();el.classList.add('drag-over');};el.ondragleave=()=>el.classList.remove('drag-over');
    el.ondrop=e=>{e.preventDefault();el.classList.remove('drag-over');const data=e.dataTransfer.getData('text/plain'),cat=el.dataset.dropCategory;if(data.startsWith('pool:'))addGearToWorkspace(data.slice(5),cat);else if(data.startsWith('trip:'))moveWorkspaceItem(data.slice(5),cat);};
  });
  document.querySelectorAll('[data-storage-gear]').forEach(el=>{
    el.ondragstart=e=>{el.classList.add('dragging');e.dataTransfer.setData('text/plain',`storagegear:${el.dataset.storageGear}`);e.dataTransfer.effectAllowed='move';};el.ondragend=()=>el.classList.remove('dragging');
  });
  document.querySelectorAll('[data-storage-drop]').forEach(el=>{
    el.ondragover=e=>{if(e.dataTransfer.types.includes('text/plain')){e.preventDefault();el.classList.add('drag-over');}};el.ondragleave=()=>el.classList.remove('drag-over');
    el.ondrop=e=>{e.preventDefault();el.classList.remove('drag-over');const data=e.dataTransfer.getData('text/plain');if(data.startsWith('storagegear:')){const g=gearById(data.slice(12));if(g){g.storageId=el.dataset.storageDrop==='unassigned'?null:el.dataset.storageDrop;selectedStorageId=el.dataset.storageDrop;commit(`${g.name} flyttet`);}}};
  });
  document.querySelectorAll('[data-storage-select]').forEach(el=>el.onclick=e=>{if(e.target.closest('button'))return;selectedStorageId=el.dataset.storageSelect;render();});
}
function moveWorkspaceItem(itemId,cat){ const ws=workspace(),item=ws?.items.find(i=>i.id===itemId);if(!item)return;item.category=cat;item.order=Math.max(-1,...ws.items.filter(i=>i.category===cat&&i.id!==itemId).map(i=>Number(i.order)||0))+1;commit('Item flyttet'); }

function showToast(msg){ const t=document.getElementById('toast'); if(!t)return;t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),1800); }

render();
