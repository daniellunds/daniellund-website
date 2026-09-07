// Current wastewater-operator identities layered on top of stable legacy map IDs.
// Legacy IDs are deliberately preserved because catchment, plant and project joins depend on them.
(function initCurrentOperators(){
  const overrides=new Map([
    ["nordfyns-forsyning",{
      operatorBrandId:"vandcenter-syd",
      operatorName:"VandCenter Syd",
      displayName:"VandCenter Syd – Nordfyn",
      reason:"Nordfyns Kommune states that VandCenter Syd is responsible for the public sewers in Nordfyn.",
      sourceUrl:"https://www.nordfynskommune.dk/borger/bolig-byggeri-og-energi/spildevand-og-regnvand/"
    }],
    ["syddjurs-spildevand",{
      operatorBrandId:"aquadjurs",
      operatorName:"AquaDjurs",
      displayName:"AquaDjurs – Syddjurs",
      reason:"Syddjurs Spildevand was merged into AquaDjurs; AquaDjurs is the current wastewater company across Norddjurs and Syddjurs.",
      sourceUrl:"https://www.aquadjurs.dk/"
    }],
    ["thisted-vand",{
      operatorBrandId:"thisted-vand",
      operatorName:"Thy Forsyning",
      displayName:"Thy Forsyning",
      reason:"The current group is Thy Forsyning; the legacy map ID and Plandata label are retained for joins.",
      sourceUrl:"https://www.thyforsyning.dk/"
    }],
    ["vesthimmerlands-vand",{
      operatorBrandId:"vesthimmerlands-vand",
      operatorName:"Vesthimmerlands Forsyning",
      displayName:"Vesthimmerlands Forsyning",
      reason:"The current utility brand is Vesthimmerlands Forsyning; the legacy map ID is retained for joins.",
      sourceUrl:"https://vesthimmerlandsforsyning.dk/"
    }],
    ["mariagerfjord-vand",{
      operatorBrandId:"mariagerfjord-vand",
      operatorName:"Mariagerfjord Vand",
      displayName:"Ren Forsyning Mariagerfjord – Mariagerfjord Vand",
      reason:"Since 1 January 2025, Ren Forsyning Mariagerfjord is the parent/customer-facing group for wastewater, while Mariagerfjord Vand remains the wastewater company. The legacy map ID is retained for joins.",
      sourceUrl:"https://www.renform.dk/spildevand"
    }]
  ]);

  function currentOperatorForBrand(brandId){
    const b=state.brandById?.get(brandId)||null;
    const override=overrides.get(brandId)||null;
    const operatorBrandId=override?.operatorBrandId||brandId;
    const operatorBrand=state.brandById?.get(operatorBrandId)||b;
    return {
      legacyBrandId:brandId,
      operatorBrandId,
      operatorName:override?.operatorName||operatorBrand?.name||b?.name||brandId,
      displayName:override?.displayName||operatorBrand?.name||b?.name||brandId,
      color:operatorBrand?.color||b?.color||"#657D84",
      isOverride:Boolean(override),
      reason:override?.reason||null,
      sourceUrl:override?.sourceUrl||null
    };
  }

  state.currentOperatorOverrides=overrides;
  window.currentOperatorForBrand=currentOperatorForBrand;
  window.spildevandskortCurrentOperatorState=()=>({
    overrides:[...overrides.entries()].map(([legacyBrandId,v])=>({legacyBrandId,...v}))
  });
})();
