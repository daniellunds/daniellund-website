(function initSidebarCollapse(){
  const shell=document.querySelector('.app-shell');
  const sidebar=document.querySelector('.sidebar');
  const mapShell=document.querySelector('.map-shell');
  if(!shell||!sidebar||!mapShell)return;

  const style=document.createElement('style');
  style.textContent=`
    .app-shell{transition:grid-template-columns .2s ease,grid-template-rows .2s ease}
    .sidebar{position:relative;transition:opacity .15s ease}
    .sidebar-collapse-button,.sidebar-expand-button{border:1px solid rgba(255,255,255,.18);background:#173e4d;color:#eef8fa;box-shadow:0 2px 10px rgba(9,35,49,.18);cursor:pointer;display:grid;place-items:center;line-height:1}
    .sidebar-collapse-button{position:absolute;z-index:30;top:14px;right:10px;width:30px;height:30px;border-radius:7px;font-size:20px}
    .sidebar-collapse-button:hover,.sidebar-expand-button:hover{background:#285b6b;color:#fff}
    .sidebar-expand-button{position:absolute;z-index:950;top:96px;left:12px;width:34px;height:42px;border-radius:0 8px 8px 0;font-size:24px}
    .sidebar-expand-button[hidden]{display:none!important}
    .app-shell.sidebar-collapsed{grid-template-columns:0 minmax(0,1fr)}
    .app-shell.sidebar-collapsed .sidebar{opacity:0;visibility:hidden;pointer-events:none}
    @media(max-width:760px){
      .sidebar-collapse-button{top:8px;right:8px;width:28px;height:28px}
      .sidebar-expand-button{top:96px;left:0;width:32px;height:40px}
      .app-shell.sidebar-collapsed{grid-template-columns:1fr;grid-template-rows:100dvh 0}
    }
  `;
  document.head.appendChild(style);

  const collapseButton=document.createElement('button');
  collapseButton.id='collapseSidebar';
  collapseButton.className='sidebar-collapse-button';
  collapseButton.type='button';
  collapseButton.setAttribute('aria-label','Skjul sidepanel');
  collapseButton.setAttribute('aria-controls','sidebarContent');
  collapseButton.setAttribute('aria-expanded','true');
  collapseButton.title='Skjul sidepanel';
  collapseButton.textContent='‹';
  sidebar.id=sidebar.id||'sidebarContent';
  sidebar.appendChild(collapseButton);

  const expandButton=document.createElement('button');
  expandButton.id='expandSidebar';
  expandButton.className='sidebar-expand-button';
  expandButton.type='button';
  expandButton.setAttribute('aria-label','Vis sidepanel');
  expandButton.setAttribute('aria-controls',sidebar.id);
  expandButton.title='Vis sidepanel';
  expandButton.textContent='›';
  expandButton.hidden=true;
  mapShell.appendChild(expandButton);

  let resizeTimer=null;
  function resizeMap(){
    window.clearTimeout(resizeTimer);
    resizeTimer=window.setTimeout(()=>{
      if(window.state?.map&&typeof state.map.invalidateSize==='function')state.map.invalidateSize({pan:false});
    },230);
  }

  function setCollapsed(collapsed){
    shell.classList.toggle('sidebar-collapsed',collapsed);
    sidebar.setAttribute('aria-hidden',collapsed?'true':'false');
    collapseButton.setAttribute('aria-expanded',collapsed?'false':'true');
    expandButton.hidden=!collapsed;
    resizeMap();
  }

  collapseButton.addEventListener('click',()=>setCollapsed(true));
  expandButton.addEventListener('click',()=>setCollapsed(false));
  shell.addEventListener('transitionend',event=>{
    if(event.propertyName==='grid-template-columns'||event.propertyName==='grid-template-rows')resizeMap();
  });

  window.setSpildevandskortSidebarCollapsed=setCollapsed;
  window.spildevandskortSidebarState=()=>({collapsed:shell.classList.contains('sidebar-collapsed')});
})();
