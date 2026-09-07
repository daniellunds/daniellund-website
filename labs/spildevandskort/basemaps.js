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
      const wrap=L.DomUtil.create("div","basemap-switcher leaflet-control-layers leaflet-bar");
      wrap.setAttribute("role","group");
      wrap.setAttribute("aria-label","Vælg grundkort");
      const base=L.DomUtil.create("div","leaflet-control-layers-base",wrap);

      const makeOption=(name,checked)=>{
        const label=L.DomUtil.create("label","basemap-option",base);
        const input=L.DomUtil.create("input","basemap-radio",label);
        input.type="radio";input.name="basemap";input.value=name;input.checked=checked;
        const span=L.DomUtil.create("span","",label);span.textContent=name;
        return {label,input};
      };
      const kort=makeOption("Kort",true);
      const luft=makeOption("Luftfoto",false);

      const setBase=name=>{
        const useImagery=name==="Luftfoto";
        if(useImagery){
          if(state.map.hasLayer(street))state.map.removeLayer(street);
          if(!state.map.hasLayer(imagery))imagery.addTo(state.map);
        }else{
          if(state.map.hasLayer(imagery))state.map.removeLayer(imagery);
          if(!state.map.hasLayer(street))street.addTo(state.map);
        }
        state.activeBasemap=name;
        kort.input.checked=!useImagery;
        luft.input.checked=useImagery;
        kort.label.classList.toggle("active",!useImagery);
        luft.label.classList.toggle("active",useImagery);
        console.info("BASEMAP_CHANGED",name);
      };
      kort.label.classList.add("active");
      L.DomEvent.disableClickPropagation(wrap);
      L.DomEvent.on(kort.input,"change",()=>{if(kort.input.checked)setBase("Kort")});
      L.DomEvent.on(luft.input,"change",()=>{if(luft.input.checked)setBase("Luftfoto")});
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
