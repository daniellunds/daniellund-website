// Current wastewater-operator identities layered on top of stable legacy map IDs.
// Legacy IDs are deliberately preserved because catchment, plant and project joins depend on them.
(function initCurrentOperators(){
  const overrides=new Map([
    ["nordfyns-forsyning",{
      operatorBrandId:"vandcenter-syd",
      canonicalOrganizationId:"org:vandcenter-syd",
      operatorName:"VandCenter Syd",
      displayName:"VandCenter Syd",
      organizationType:"utility",
      searchNames:["Nordfyns Forsyning","VandCenter Syd"],
      disposition:"legacyAlias",
      relationToCanonical:"mergedIntoCurrentOrganization",
      reason:"Nordfyns Forsyning is a legacy/source identity; VandCenter Syd is the current wastewater utility for both Odense and Nordfyn.",
      sourceUrl:"https://www.vandcenter.dk/"
    }],
    ["syddjurs-spildevand",{
      operatorBrandId:"aquadjurs",
      canonicalOrganizationId:"org:aquadjurs",
      operatorName:"AquaDjurs",
      displayName:"AquaDjurs",
      organizationType:"utility",
      searchNames:["Syddjurs Spildevand","AquaDjurs"],
      disposition:"legacyAlias",
      relationToCanonical:"mergedIntoCurrentOrganization",
      reason:"Syddjurs Spildevand is a legacy/source identity; AquaDjurs is the current wastewater utility for Norddjurs and Syddjurs.",
      sourceUrl:"https://www.aquadjurs.dk/om-os"
    }],
    ["thisted-vand",{
      operatorBrandId:"thisted-vand",
      canonicalOrganizationId:"org:thy-forsyning",
      operatorName:"Thy Forsyning",
      displayName:"Thy Forsyning",
      organizationType:"utility",
      searchNames:["Thisted Vand","Thy Forsyning"],
      disposition:"legacyAlias",
      relationToCanonical:"currentPublicName",
      reason:"Thisted Vand is the source identity; Thy Forsyning is the current public organization.",
      sourceUrl:"https://thyforsyning.dk/spildevand/"
    }],
    ["vesthimmerlands-vand",{
      operatorBrandId:"vesthimmerlands-vand",
      canonicalOrganizationId:"org:vesthimmerlands-forsyning",
      operatorName:"Vesthimmerlands Forsyning",
      displayName:"Vesthimmerlands Forsyning",
      organizationType:"utility",
      searchNames:["Vesthimmerlands Vand","Vesthimmerlands Forsyning"],
      disposition:"legacyAlias",
      relationToCanonical:"currentPublicName",
      reason:"Vesthimmerlands Vand is the source identity; Vesthimmerlands Forsyning is the current public name for the wastewater service.",
      sourceUrl:"https://vesthimmerlandsforsyning.dk/spildevand/dit-spildevand"
    }],
    ["mariagerfjord-vand",{
      operatorBrandId:"mariagerfjord-vand",
      canonicalOrganizationId:"org:ren-forsyning-mariagerfjord",
      operatorName:"Ren Forsyning Mariagerfjord",
      displayName:"Ren Forsyning Mariagerfjord",
      organizationType:"utilityGroup",
      searchNames:["Mariagerfjord Vand","Ren Forsyning Mariagerfjord"],
      disposition:"legalEntitySource",
      relationToCanonical:"publicBrandForActiveLegalEntity",
      reason:"Mariagerfjord Vand A/S remains the wastewater legal entity; Ren Forsyning Mariagerfjord is the current public/customer-facing organization.",
      sourceUrl:"https://www.renform.dk/spildevand"
    }],
    ["langeland-forsyning",{
      operatorBrandId:"langeland-forsyning",
      canonicalOrganizationId:"org:langeland-energi-forsyning",
      operatorName:"Langeland Energi & Forsyning",
      displayName:"Langeland Energi & Forsyning",
      organizationType:"utilityGroup",
      searchNames:["Langeland Forsyning","Langeland Energi & Forsyning"],
      disposition:"legacyAlias",
      relationToCanonical:"currentServiceBrand",
      reason:"Langeland Energi & Forsyning is the current shared service identity; Langeland Forsyning remains a source/company identity in the underlying structure.",
      sourceUrl:"https://lef.dk/"
    }],
    ["nyborg-forsyning",{
      operatorBrandId:"nyborg-forsyning",
      canonicalOrganizationId:"org:nyborg-forsyning",
      operatorName:"Nyborg Forsyning",
      displayName:"Nyborg Forsyning",
      organizationType:"utility",
      searchNames:["Nyborg Forsyning & Service","Nyborg Forsyning"],
      disposition:"legalEntitySource",
      relationToCanonical:"publicBrandForActiveLegalEntity",
      reason:"Nyborg Forsyning is the public identity; Nyborg Forsyning & Service A/S is the legal/source name.",
      sourceUrl:"https://www.nfs.as/"
    }],
    ["vand-og-affald",{
      operatorBrandId:"vand-og-affald",
      canonicalOrganizationId:"org:vand-og-affald",
      operatorName:"Vand & Affald",
      displayName:"Vand & Affald",
      organizationType:"utility",
      searchNames:["Vand og Affald","Vand & Affald"],
      disposition:"canonicalSource",
      relationToCanonical:"minorDisplayCorrection",
      reason:"The verified current public display uses '&' rather than 'og'.",
      sourceUrl:"https://www.vandogaffald.dk/"
    }],
    ["biofos",{
      operatorBrandId:"biofos",
      canonicalOrganizationId:"org:biofos",
      operatorName:"BIOFOS",
      displayName:"BIOFOS",
      organizationType:"jointTreatmentOrganization",
      searchNames:["BIOFOS"],
      disposition:"virtualCanonical",
      relationToCanonical:"canonicalTreatmentOrganization",
      isPresentationOverride:false,
      sourceUrl:"https://biofos.dk/om-biofos/hvem-er-vi/ejerforhold"
    }],
    ["moelleaavaerket",{
      operatorBrandId:"moelleaavaerket",
      canonicalOrganizationId:"org:moelleaavaerket",
      operatorName:"Mølleåværket",
      displayName:"Mølleåværket",
      organizationType:"jointTreatmentOrganization",
      searchNames:["Mølleåværket"],
      disposition:"virtualCanonical",
      relationToCanonical:"canonicalTreatmentOrganization",
      isPresentationOverride:false,
      sourceUrl:"https://moelleaavaerket.dk/om-os/"
    }],
    ["hofor",{
      operatorBrandId:"hofor",
      canonicalOrganizationId:"org:hofor",
      operatorName:"HOFOR",
      displayName:"HOFOR",
      organizationType:"utilityGroup",
      searchNames:["HOFOR"],
      disposition:"canonicalSource",
      relationToCanonical:"publicBrandForMultipleNetworkCompanies",
      isPresentationOverride:false,
      sourceUrl:"https://www.hofor.dk/om-hofor/organisationen/koncerndiagram/selskaber-i-hofor/holding/hofor-spildevand-holding-as/"
    }],
    ["laesoe-forsyning",{
      operatorBrandId:"laesoe-forsyning",
      canonicalOrganizationId:"org:laesoe-forsyning",
      operatorName:"Læsø Forsyning",
      displayName:"Læsø Forsyning",
      organizationType:"utilityGroup",
      searchNames:["Læsø Forsyning"],
      disposition:"virtualCanonical",
      relationToCanonical:"publicBrandForActiveLegalEntity",
      isPresentationOverride:false,
      sourceUrl:"https://laesoeforsyning.dk/laesoe-vand-a-s-spildevand/"
    }]
  ]);

  function currentOperatorForBrand(brandId){
    const b=state.brandById?.get(brandId)||null;
    const override=overrides.get(brandId)||null;
    const operatorBrandId=override?.operatorBrandId||brandId;
    const operatorBrand=state.brandById?.get(operatorBrandId)||b;
    const displayName=override?.displayName||operatorBrand?.name||b?.name||brandId;
    return {
      legacyBrandId:brandId,
      operatorBrandId,
      canonicalOrganizationId:override?.canonicalOrganizationId||`org:${operatorBrandId}`,
      operatorName:override?.operatorName||displayName,
      displayName,
      organizationType:override?.organizationType||"utility",
      searchNames:[...new Set([...(override?.searchNames||[]),displayName,b?.name].filter(Boolean))],
      disposition:override?.disposition||"canonicalSource",
      relationToCanonical:override?.relationToCanonical||"currentOrganization",
      color:operatorBrand?.color||b?.color||"#657D84",
      isOverride:override?.isPresentationOverride??Boolean(override),
      reason:override?.reason||null,
      sourceUrl:override?.sourceUrl||null
    };
  }

  state.currentOperatorOverrides=overrides;
  window.currentOperatorForBrand=currentOperatorForBrand;
  window.spildevandskortCurrentOperatorState=()=>({
    overrides:[...overrides.entries()].map(([legacyBrandId,v])=>({legacyBrandId,...v})),
    canonicalOrganizationCount:new Set((state.brands||[]).map(b=>currentOperatorForBrand(b.id).canonicalOrganizationId)).size
  });
})();
