#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const registryDocument = JSON.parse(fs.readFileSync(path.join(root, "labs/spildevandskort/data/model/facility-registry.json"), "utf8"));
const organizationDocument = JSON.parse(fs.readFileSync(path.join(root, "labs/spildevandskort/data/model/organization-registry.json"), "utf8"));
const createFacilityRegistry = require(path.join(root, "labs/spildevandskort/facility-registry.js"));
const registry = createFacilityRegistry(registryDocument);

const calculated = {
  facilities: registryDocument.facilities.length,
  sourceRecords: registryDocument.sourceRecords.length,
  verifiedMappings: registryDocument.sourceRecords.filter(row => row.mappingStatus === "verified").length,
  unresolvedMappings: registryDocument.sourceRecords.filter(row => row.mappingStatus === "unresolved").length,
  countableSourceRecords: registryDocument.sourceRecords.filter(row => row.includeInFacilityCount === true).length
};
assert.deepEqual(calculated, registryDocument.counts, "Declared facility counts must match the data");
assert.deepEqual(registry.counts, registryDocument.counts, "Adapter counts must match the document");

const organizationIds = new Set(organizationDocument.organizations.map(row => row.id));
for (const facility of registryDocument.facilities) {
  assert.equal(facility.facilityType, "wastewaterTreatmentPlant");
  assert.equal(facility.verification?.status, "verified");
  assert.ok(organizationIds.has(facility.presentationOrganizationId), `${facility.id} references a missing organization`);
  assert.ok(facility.verification.sourceUrls?.length, `${facility.id} needs verification provenance`);
}

const damhusTechnical = "Renseanlaeg.1542048b-26b1-415a-8b0f-28effaef0c41";
const damhusMain = "Renseanlaeg.87c30072-633c-440b-b3a1-1b0f529acf6f";
assert.equal(registry.facilityIdForPulsRecordId(damhusTechnical), "facility:biofos-damhusaaen");
assert.equal(registry.facilityIdForPulsRecordId(damhusMain), "facility:biofos-damhusaaen");
assert.equal(registry.sourceRecordForPulsId(damhusTechnical).includeInFacilityCount, false);
assert.equal(registry.presentationOrganizationIdForPulsRecordId(damhusMain), "org:biofos");

const vibyIds = [
  "Renseanlaeg.12c7c11f-becc-40c2-a459-6661ceced388",
  "Renseanlaeg.2e64c1a1-10e8-41d3-823c-7375272f70c9",
  "Renseanlaeg.b98813a1-680b-463d-8009-cc26ed36aad8",
  "Renseanlaeg.d68d86f2-e486-4a0d-ad32-9ad59cff0766"
];
assert.deepEqual(new Set(vibyIds.map(id => registry.facilityIdForPulsRecordId(id))), new Set(["facility:aarhus-vand-viby"]));
assert.ok(vibyIds.every(id => registry.sourceRecordForPulsId(id).includeInFacilityCount === false));

const unresolved = "Renseanlaeg.f30e0031-62be-4312-9a23-c0135fe921e2";
assert.equal(registry.sourceRecordForPulsId(unresolved).mappingStatus, "unresolved");
assert.equal(registry.facilityIdForPulsRecordId(unresolved), null);
assert.equal(registry.presentationOrganizationIdForPulsRecordId(unresolved), null);

const biofosFacilities = registryDocument.facilities.filter(row => row.presentationOrganizationId === "org:biofos");
assert.equal(biofosFacilities.length, 3, "BIOFOS must have three verified physical facilities");
const mappedFacilityIds = new Set(registryDocument.sourceRecords.filter(row => row.mappingStatus === "verified").map(row => row.facilityId));
assert.ok(registryDocument.facilities.every(row => mappedFacilityIds.has(row.id)), "Every verified facility needs at least one map anchor");
const aarhusFacilities = registryDocument.facilities.filter(row => row.presentationOrganizationId === "org:aarhus-vand");
assert.equal(aarhusFacilities.length, 4, "Aarhus Vand must have four verified physical facilities");
assert.ok(aarhusFacilities.every(row => mappedFacilityIds.has(row.id)), "All four Aarhus facilities need PULS map anchors");
assert.equal(registry.presentationOrganizationIdForPulsRecordId("Renseanlaeg.44f9a35f-2848-47f1-a82f-bdc2da36947c"), "org:moelleaavaerket");
assert.equal(registry.facilityForId("facility:din-forsyning-renseanlaeg-oest").presentationOrganizationId, "org:din-forsyning");

console.log("FACILITY_REGISTRY_QA", JSON.stringify(calculated));
