#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "labs/spildevandskort/data/model");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const organizationDocument = readJson(path.join(dataRoot, "organization-registry.json"));
const facilityDocument = readJson(path.join(dataRoot, "facility-registry.json"));
const relationDocument = readJson(path.join(dataRoot, "wastewater-relations.json"));
const createOrganizationRegistry = require(path.join(root, "labs/spildevandskort/canonical-registry.js"));
const createFacilityRegistry = require(path.join(root, "labs/spildevandskort/facility-registry.js"));
const createWastewaterRelations = require(path.join(root, "labs/spildevandskort/wastewater-relations.js"));

const organizationRegistry = createOrganizationRegistry(organizationDocument);
const facilityRegistry = createFacilityRegistry(facilityDocument);
const relations = createWastewaterRelations(relationDocument, {organizationRegistry,facilityRegistry});
const verified = row => row.verification?.status === "verified";
const calculatedCounts = {
  auditedOrganizations: relationDocument.organizationSemantics.filter(verified).length,
  verifiedFacilityRelations: relationDocument.facilityPartyRelations.filter(verified).length,
  verifiedRoutes: relationDocument.wastewaterRoutes.filter(verified).length,
  verifiedOrganizationRelations: relationDocument.organizationRelations.filter(verified).length
};
assert.deepEqual(calculatedCounts, relationDocument.counts);
assert.deepEqual(relations.counts, relationDocument.counts);

const expectedCounts = new Map([
  ["org:biofos",3],
  ["org:aarhus-vand",4],
  ["org:vandcenter-syd",8],
  ["org:aquadjurs",10],
  ["org:moelleaavaerket",1],
  ["org:frederiksberg-forsyning",0],
  ["org:glostrup-forsyning",0],
  ["org:ishoej-forsyning",0],
  ["org:ltf",0],
  ["org:fanoe-vand",0]
]);
for (const [organizationId, expected] of expectedCounts) {
  const semantics = relations.semanticsForOrganizationId(organizationId);
  assert.equal(semantics.auditStatus, "verified", `${organizationId} must be audited`);
  assert.equal(semantics.directActiveFacilityCount, expected, `${organizationId} has the wrong direct facility count`);
}

const biofos = relations.semanticsForOrganizationId("org:biofos");
assert.equal(biofos.primaryRole, "jointTreatmentOrganization");
assert.deepEqual(new Set(biofos.directFacilities.map(row => row.name)), new Set(["Renseanlæg Lynetten","Spildevandscenter Avedøre","Renseanlæg Damhusåen"]));
assert.equal(biofos.auditedActivePulsRecords, 4);

const aarhus = relations.semanticsForOrganizationId("org:aarhus-vand");
assert.equal(aarhus.directActiveFacilityCount, 4);
assert.equal(aarhus.auditedActivePulsRecords, 185);
assert.ok(aarhus.directFacilities.some(row => row.name === "Viby Renseanlæg"));

const frederiksberg = relations.semanticsForOrganizationId("org:frederiksberg-forsyning");
assert.equal(frederiksberg.primaryRole, "networkUtility");
assert.deepEqual(new Set(frederiksberg.routes.map(row => row.facility?.name)), new Set(["Renseanlæg Lynetten","Renseanlæg Damhusåen"]));

const ishoej = relations.semanticsForOrganizationId("org:ishoej-forsyning");
assert.equal(ishoej.routes.length, 1);
assert.equal(ishoej.routes[0].facility, null);
assert.equal(ishoej.routes[0].destinationPrecision, "organization");
assert.match(ishoej.routes[0].displayLabel, /ikke verificeret/);

const lyngby = relations.semanticsForOrganizationId("org:ltf");
assert.deepEqual(new Set(lyngby.routes.map(row => row.toOrganizationId)), new Set(["org:moelleaavaerket","org:biofos"]));
assert.equal(lyngby.coOwnerships.length, 2);
assert.deepEqual(new Set(lyngby.coOwnerships.map(row => row.subjectEntity.kind)), new Set(["municipality","wastewaterCompany"]));
assert.ok(relationDocument.organizationRelations.every(row => row.relationType === "coOwnsOrganizationOrFacility"));
assert.ok(relationDocument.organizationRelations.every(row => row.profileOrganizationId && !row.fromOrganizationId));

const fanoe = relations.semanticsForOrganizationId("org:fanoe-vand");
assert.equal(fanoe.routes[0].facility?.id, "facility:din-forsyning-renseanlaeg-oest");
assert.equal(fanoe.routes[0].toOrganizationId, "org:din-forsyning");

const silkeborg = relations.semanticsForOrganizationId("org:silkeborg-forsyning");
assert.equal(silkeborg.auditStatus, "notAudited");
assert.equal(silkeborg.directActiveFacilityCount, null);
assert.match(silkeborg.roleLabel, /ikke fuldt auditeret/);

const uiFiles = ["index.html","app2.js","profile-integration.js","profiles.js"].map(file =>
  fs.readFileSync(path.join(root, "labs/spildevandskort", file), "utf8")
);
assert.match(uiFiles[0], /verificerede anlæg/);
assert.match(uiFiles[0], /Verificerede fysiske anlæg/);
assert.match(uiFiles[0], /Øvrige tekniske PULS-poster/);
assert.doesNotMatch(uiFiles.slice(0,3).join("\n"), />aktive renseanlæg<|\$\{plants\} aktive renseanlæg/);
assert.match(uiFiles[3], /Egne\/driftede aktive renseanlæg/);
assert.match(uiFiles[3], /Spildevand behandles hos/);
assert.match(uiFiles[3], /Aktive PULS-poster/);
assert.match(uiFiles[3], /data-wastewater-audit-status="not-audited"/);
assert.match(fs.readFileSync(path.join(root, "labs/spildevandskort/profile-integration.js"), "utf8"), /Anlægsejer · uden eget oplandslag/);

// Render the broad profile sample without a browser so the actual profile
// template is covered locally as well as by the desktop/mobile Playwright job.
const runtimePulsCounts = new Map(relationDocument.organizationSemantics.map(row => [row.organizationId,row.activePulsSourceRecords]));
runtimePulsCounts.set("org:silkeborg-forsyning", 12);
const profileContext = vm.createContext({
  console,
  state:{canonicalRegistry:organizationRegistry},
  wastewaterSemanticsForOrganizationId:organizationId => relations.semanticsForOrganizationId(organizationId),
  activePulsRecordCountForOrganizationId:organizationId => runtimePulsCounts.get(organizationId) || 0
});
vm.runInContext(uiFiles[3], profileContext, {filename:"profiles.js"});
const renderWastewater = organizationId => vm.runInContext(
  `renderWastewaterProfileSemantics({id:${JSON.stringify(organizationId)}})`, profileContext
);
const renderedCases = [
  ["org:biofos",3,["Fælles renseorganisation","Renseanlæg Lynetten","Renseanlæg Damhusåen","Spildevandscenter Avedøre"]],
  ["org:aarhus-vand",4,["Netforsyning · driver renseanlæg"]],
  ["org:vandcenter-syd",8,["Netforsyning · driver renseanlæg"]],
  ["org:aquadjurs",10,["Netforsyning · driver renseanlæg"]],
  ["org:moelleaavaerket",1,["Fælles renseorganisation"]],
  ["org:frederiksberg-forsyning",0,["BIOFOS · Renseanlæg Lynetten","BIOFOS · Renseanlæg Damhusåen"]],
  ["org:glostrup-forsyning",0,["BIOFOS · Spildevandscenter Avedøre"]],
  ["org:ishoej-forsyning",0,["BIOFOS · præcis anlægsfordeling ikke verificeret"]],
  ["org:ltf",0,["Mølleåværket","BIOFOS · dele af kommunen","medejer af Mølleåværket"]],
  ["org:fanoe-vand",0,["DIN Forsyning · Renseanlæg Øst"]]
];
for (const [organizationId,count,snippets] of renderedCases) {
  const html = renderWastewater(organizationId);
  assert.match(html, /data-wastewater-audit-status="verified"/, organizationId);
  assert.match(html, new RegExp(`Egne/driftede aktive renseanlæg[\\s\\S]*?<strong>${count}<\\/strong>`), organizationId);
  assert.match(html, /Aktive PULS-poster/, organizationId);
  for (const snippet of snippets) assert.ok(html.includes(snippet), `${organizationId} is missing ${snippet}`);
}
const unauditedHtml = renderWastewater("org:silkeborg-forsyning");
assert.match(unauditedHtml, /data-wastewater-audit-status="not-audited"/);
assert.match(unauditedHtml, /Egne\/driftede aktive renseanlæg[\s\S]*?<strong>Ikke verificeret<\/strong>/);
assert.match(unauditedHtml, /Aktive PULS-poster[\s\S]*?<strong>12<\/strong>/);
assert.match(unauditedHtml, /må ikke læses som antal fysiske renseanlæg/);

console.log("WASTEWATER_RELATIONS_QA", JSON.stringify({
  ...calculatedCounts,
  verifiedDirectFacilities:[...expectedCounts.values()].reduce((sum,value)=>sum+value,0),
  renderedProfileSample:renderedCases.length+1,
  unauditedRegression:"org:silkeborg-forsyning"
}));
