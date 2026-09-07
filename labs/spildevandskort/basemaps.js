// Basemap switcher kept separate from wastewater data layers.
// Public aerial imagery is used without exposing credentials in the frontend.
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
  state.activeBasemap="Kort";

  const Switcher=L.Control.extend({
    options:{position:"topright"},
    onAdd(){
      const wrap=L.DomUtil.create("div","basemap-switcher leaflet-bar");
      wrap.setAttribute("role","group");
      wrap.setAttribute("aria-label","Vælg grundkort");
      const kort=L.DomUtil.create("button","basemap-option active",wrap);
      const luft=L.DomUtil.create("button","basemap-option",wrap);
      kort.type=luft.type="button";
      kort.textContent="Kort";
      luft.textContent="Luftfoto";
      const setBase=name=>{
        const useImagery=name==="Luftfoto";
        if(useImagery){if(state.map.hasLayer(street))state.map.removeLayer(street);if(!state.map.hasLayer(imagery))imagery.addTo(state.map);}
        else {if(state.map.hasLayer(imagery))state.map.removeLayer(imagery);if(!state.map.hasLayer(street))street.addTo(state.map);}
        state.activeBasemap=name;
        kort.classList.toggle("active",!useImagery);
        luft.classList.toggle("active",useImagery);
        console.info("BASEMAP_CHANGED",name);
      };
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.on(kort,"click",()=>setBase("Kort"));
      L.DomEvent.on(luft,"click",()=>setBase("Luftfoto"));
      state.setBasemap=setBase;
      return wrap;
    }
  });
  state.basemapControl=new Switcher().addTo(state.map);

  window.spildevandskortBasemapState=()=>({
    active:state.activeBasemap,
    available:["Kort","Luftfoto"],
    imageryOnMap:state.map.hasLayer(imagery)
  });
  console.info("BASEMAPS_READY",{layers:["Kort","Luftfoto"]});
})();
