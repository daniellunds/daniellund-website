// Basemap switcher kept separate from wastewater data layers.
// GeoDanmark Ortofoto requires a Datafordeler API key, so the public frontend
// uses Esri World Imagery without embedding credentials. The control can be
// swapped to GeoDanmark later without touching the operational data layers.
(function initBasemapSwitcher(){
  if(!state?.map || !window.L)return;

  let street=null;
  state.map.eachLayer(layer=>{
    if(!street && layer instanceof L.TileLayer)street=layer;
  });
  if(!street){
    street=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:18,
      attribution:"© OpenStreetMap contributors"
    }).addTo(state.map);
  }

  const imagery=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{
    maxZoom:19,
    attribution:"Tiles © Esri · Sources: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
  });

  state.basemaps={street,imagery};
  state.basemapControl=L.control.layers(
    {"Kort":street,"Luftfoto":imagery},
    {},
    {position:"topright",collapsed:window.matchMedia("(max-width:760px)").matches}
  ).addTo(state.map);

  state.map.on("baselayerchange",event=>{
    state.activeBasemap=event.name;
    console.info("BASEMAP_CHANGED",event.name);
  });
  state.activeBasemap="Kort";

  window.spildevandskortBasemapState=()=>({
    active:state.activeBasemap,
    available:["Kort","Luftfoto"],
    imageryOnMap:state.map.hasLayer(imagery)
  });
  console.info("BASEMAPS_READY",{layers:["Kort","Luftfoto"]});
})();
