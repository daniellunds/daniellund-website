#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const mapColors = fs.readFileSync(path.join(root, "labs/spildevandskort/map-colors.js"), "utf8");
const coverage = fs.readFileSync(path.join(root, "labs/spildevandskort/coverage-areas.js"), "utf8");
const app1 = fs.readFileSync(path.join(root, "labs/spildevandskort/app1.js"), "utf8");
const catchments = fs.readFileSync(path.join(root, "labs/spildevandskort/wwtp-catchments.js"), "utf8");
const profiles = fs.readFileSync(path.join(root, "labs/spildevandskort/profiles.js"), "utf8");
const registry = JSON.parse(fs.readFileSync(path.join(root, "labs/spildevandskort/data/model/organization-registry.json"), "utf8"));
const createRegistry = require(path.join(root, "labs/spildevandskort/canonical-registry.js"));

assert.equal(registry.counts.canonicalOrganizations, 74);
assert.match(mapColors, /canonical-organization-near-neighbour-max-contrast/);
assert.match(mapColors, /state\.organizationColors=new Map/);
assert.match(mapColors, /organizationIdForLegacyBrandId/);
assert.match(coverage, /coverageHighlightOrganizationId/);
assert.match(coverage, /state\.organizationColors\.get\(c\.organizationId\)/);
assert.match(app1, /facilityId:facility\?\.id\|\|null/);
assert.match(app1, /organizationId,facilityId/);
assert.match(app1, /plantPresentationColor\(p\)/);
assert.match(catchments, /plantPresentationColor/);
assert.match(profiles, /state\.organizationColors\.get\(canonicalId\)/);
assert.match(profiles, /data-organization-id/);
assert.doesNotMatch(app1, /activePlantCount\.textContent=state\.plants\.filter\(p=>p\.facilityId/,
  "Facility-count UI migration belongs to Delopgave 8");

const paletteMatch = mapColors.match(/const PALETTE=\[([^\]]+)\]/);
assert.ok(paletteMatch, "Existing color palette must remain explicit");
const palette = JSON.parse(`[${paletteMatch[1]}]`);
assert.equal(palette.length, 10);
assert.equal(new Set(palette).size, palette.length);

const sourceBrands = JSON.parse(fs.readFileSync(path.join(root, "labs/spildevandskort/data/brands.json"), "utf8")).brands;
const virtualBrands = [
  {id:"biofos",name:"BIOFOS",municipalities:[],sourceFeatureCount:0,color:"#087e90"},
  {id:"moelleaavaerket",name:"Mølleåværket",municipalities:[],sourceFeatureCount:0,color:"#087e90"},
  {id:"laesoe-forsyning",name:"Læsø Forsyning",municipalities:[],sourceFeatureCount:0,color:"#087e90"}
];
const brands = [...sourceBrands, ...virtualBrands.filter(row => !sourceBrands.some(brand => brand.id === row.id))];
const canonicalRegistry = createRegistry(registry);
const state = {canonicalRegistry,brands,brandById:new Map(brands.map(brand => [brand.id,brand])),organizationColors:new Map(),features:[]};
const context = {state,window:{},console:{info(){},warn(){},error(){}}};
vm.createContext(context);
vm.runInContext(mapColors, context);

const municipalities = JSON.parse(fs.readFileSync(path.join(root, "labs/spildevandskort/data/municipalities.geojson"), "utf8"));
const norm = value => String(value || "").toLocaleLowerCase("da").trim().replace(/\s+/g, " ");
const administrativeFeatures = [];
for (const feature of municipalities.features) {
  const properties = feature.properties || {};
  const name = properties.navn || properties.name || properties.NAVN || "";
  let candidates = brands.filter(brand => (brand.municipalities || []).some(municipality => norm(municipality) === norm(name))).map(brand => brand.id);
  if (!candidates.length && norm(name) === "læsø") candidates = ["laesoe-forsyning"];
  if (!candidates.length && norm(name) === "københavn") candidates = ["hofor"];
  candidates = [...new Set(candidates)];
  if (candidates.length === 1) administrativeFeatures.push({...feature,properties:{...properties,brandId:candidates[0]}});
}
const colorQa = context.window.applyNeighborContrastColors(administrativeFeatures, brands);
assert.equal(colorQa.strategy, "canonical-organization-near-neighbour-max-contrast");
assert.equal(colorQa.organizationGroups, 74);
assert.equal(colorQa.canonicalMappings, 76);
assert.equal(colorQa.sameColorNeighbourPairs, 0, "Adjacent different organizations must have different colors nationwide");
assert.equal(colorQa.sameOrganizationNeighbourPairs, 2);
assert.ok(palette.includes(state.organizationColors.get("org:silkeborg-forsyning")));
assert.equal(state.brandById.get("nordfyns-forsyning").color, state.brandById.get("vandcenter-syd").color);
assert.equal(state.brandById.get("syddjurs-spildevand").color, state.brandById.get("aquadjurs").color);
assert.notEqual(state.brandById.get("hofor").color, state.brandById.get("ishoej-forsyning").color);

console.log("CANONICAL_COLOR_STATIC_QA", JSON.stringify({
  strategy: "canonical-organization-near-neighbour-max-contrast",
  canonicalOrganizations: registry.counts.canonicalOrganizations,
  paletteSize: palette.length,
  nationwideNeighbourPairs: colorQa.neighbourPairs,
  sameOrganizationNeighbourPairs: colorQa.sameOrganizationNeighbourPairs,
  sameColorNeighbourPairs: colorQa.sameColorNeighbourPairs,
  minimumNeighbourDistance: colorQa.minNeighbourDistance
}));
