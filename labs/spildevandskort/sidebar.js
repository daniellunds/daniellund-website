(function initSidebarCollapse(){
  const shell=document.querySelector('.app-shell');
  const sidebar=document.querySelector('.sidebar');
  const collapseButton=document.getElementById('collapseSidebar');
  const expandButton=document.getElementById('expandSidebar');
  if(!shell||!sidebar||!collapseButton||!expandButton)return;

  function resizeMap(){
    window.setTimeout(()=>{
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

  window.setSpildevandskortSidebarCollapsed=setCollapsed;
  window.spildevandskortSidebarState=()=>({collapsed:shell.classList.contains('sidebar-collapsed')});
})();
