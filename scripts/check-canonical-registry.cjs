#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const registryPath = path.join(root, "labs/spildevandskort/data/model/organization-registry.json");
const brandsPath = path.join(root, "labs/spildevandskort/data/brands.json");
const adapterPath = path.join(root, "labs/spildevandskort/canonical-registry.js");
const registryDocument = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const brandsDocument = JSON.parse(fs.readFileSync(brandsPath, "utf8"));
const createRegistry = require(adapterPath);
const registry = createRegistry(registryDocument);

const organizations = registryDocument.organizations;
const sources = registryDocument.sourceIdentities;
const organizationIds = new Set(organizations.map((row) => row.id));
const sourceIds = new Set(sources.map((row) => row.id));
const legacyIds = new Set(sources.map((row) => row.legacyBrandId));
const runtimeLegacyIds = new Set([
  ...(brandsDocument.brands || brandsDocument).map((row) => row.id),
  "biofos",
  "moelleaavaerket",
  "laesoe-forsyning"
]);

assert.equal(registryDocument.schemaVersion, 1);
assert.equal(organizations.length, 74);
assert.equal(sources.length, 76);
assert.equal(organizationIds.size, organizations.length, "canonical IDs must be unique");
assert.equal(sourceIds.size, sources.length, "source identity IDs must be unique");
assert.equal(legacyIds.size, sources.length, "legacy brand IDs must map at most once");
assert.deepEqual([...legacyIds].sort(), [...runtimeLegacyIds].sort(), "all runtime legacy IDs must be preserved exactly");

for (const source of sources) {
  assert.match(source.id, /^source:(app|plandata):brand:/);
  assert.ok(["verified", "probable", "unresolved"].includes(source.mappingStatus));
  assert.equal(registry.sourceIdentityForLegacyBrandId(source.legacyBrandId)?.id, source.id);
  if (source.mappingStatus === "verified") {
    assert.ok(source.presentationOrganizationId, `${source.legacyBrandId} needs a canonical ID`);
    assert.ok(organizationIds.has(source.presentationOrganizationId), `${source.legacyBrandId} maps to a missing canonical ID`);
    assert.equal(registry.organizationIdForLegacyBrandId(source.legacyBrandId), source.presentationOrganizationId);
    assert.ok(registry.legacyBrandIdsForOrganizationId(source.presentationOrganizationId).includes(source.legacyBrandId));
  } else {
    assert.equal(registry.organizationIdForLegacyBrandId(source.legacyBrandId), null, `${source.mappingStatus} mappings must not drive presentation`);
  }
  assert.ok(source.verification.sourceUrls.length > 0);
  assert.ok(source.verification.sourceUrls.every((url) => url.startsWith("https://")));
}

for (const organization of organizations) {
  assert.match(organization.id, /^org:/);
  assert.equal(registry.organizationForId(organization.id)?.id, organization.id);
  assert.ok(organization.verification?.status === "verified");
  assert.ok(organization.sourceUrls?.length > 0);
  const expectedLegacyIds = sources
    .filter((source) => source.mappingStatus === "verified" && source.presentationOrganizationId === organization.id)
    .map((source) => source.legacyBrandId)
    .sort((a, b) => a.localeCompare(b, "da"));
  assert.deepEqual(registry.legacyBrandIdsForOrganizationId(organization.id), expectedLegacyIds);
  assert.deepEqual(registry.sourceIdentitiesForOrganizationId(organization.id).map((row) => row.legacyBrandId).sort((a, b) => a.localeCompare(b, "da")), expectedLegacyIds);
  assert.ok(registry.preferredLegacyBrandIdForOrganizationId(organization.id));
  assert.deepEqual([...organization.legacyIds].sort((a, b) => a.localeCompare(b, "da")), expectedLegacyIds);
  assert.ok(organization.searchNames.includes(organization.displayName));
}

const knownCvrs = new Set();
for (const finding of registryDocument.legalStructureFindings) {
  assert.ok(organizationIds.has(finding.organizationId), `${finding.organizationId} is missing from organizations`);
  assert.ok(finding.sourceUrl.startsWith("https://"));
  assert.ok(finding.legalEntities.length > 0);
  for (const legalEntity of finding.legalEntities) {
    assert.ok(legalEntity.legalName);
    if (!legalEntity.cvr) continue;
    assert.match(legalEntity.cvr, /^\d{8}$/);
    assert.ok(!knownCvrs.has(legalEntity.cvr), `duplicate verified CVR ${legalEntity.cvr}`);
    knownCvrs.add(legalEntity.cvr);
  }
}

// Direct org: targets make alias chains and circular aliases impossible.
assert.ok(sources.every((source) => source.presentationOrganizationId === null || source.presentationOrganizationId?.startsWith("org:")));
assert.ok(sources.every((source) => !legacyIds.has(source.presentationOrganizationId)));

const expectedMerges = new Map([
  ["nordfyns-forsyning", "org:vandcenter-syd"],
  ["syddjurs-spildevand", "org:aquadjurs"]
]);
assert.equal(registryDocument.verifiedMerges.length, expectedMerges.size);
for (const [legacyBrandId, organizationId] of expectedMerges) {
  const merge = registryDocument.verifiedMerges.find((row) => row.legacyBrandId === legacyBrandId);
  assert.equal(merge?.canonicalOrganizationId, organizationId);
  assert.equal(registry.organizationIdForLegacyBrandId(legacyBrandId), organizationId);
}
assert.equal(registry.preferredLegacyBrandIdForOrganizationId("org:vandcenter-syd"), "vandcenter-syd");
assert.equal(registry.preferredLegacyBrandIdForOrganizationId("org:aquadjurs"), "aquadjurs");
assert.deepEqual(registry.sourceIdentitiesForOrganizationId("org:vandcenter-syd").map((row) => row.legacyBrandId), ["vandcenter-syd", "nordfyns-forsyning"]);
assert.deepEqual(registry.sourceIdentitiesForOrganizationId("org:aquadjurs").map((row) => row.legacyBrandId), ["aquadjurs", "syddjurs-spildevand"]);

// Regression coverage for verified display-name/legal-source remaps.
for (const [legacyBrandId, organizationId] of [
  ["langeland-forsyning", "org:langeland-energi-forsyning"],
  ["mariagerfjord-vand", "org:ren-forsyning-mariagerfjord"],
  ["nyborg-forsyning", "org:nyborg-forsyning"],
  ["thisted-vand", "org:thy-forsyning"],
  ["vesthimmerlands-vand", "org:vesthimmerlands-forsyning"],
  ["biofos", "org:biofos"],
  ["moelleaavaerket", "org:moelleaavaerket"]
]) {
  assert.equal(registry.organizationIdForLegacyBrandId(legacyBrandId), organizationId);
}

// Unresolved/probable rows remain inspectable source identities but never resolve for presentation.
for (const status of ["unresolved", "probable"]) {
  const synthetic = createRegistry({
    schemaVersion: 1,
    modelVersion: "test",
    organizations: [{ id: "org:test", displayName: "Test" }],
    sourceIdentities: [{
      id: `source:plandata:brand:${status}`,
      legacyBrandId: status,
      mappingStatus: status,
      presentationOrganizationId: "org:test"
    }]
  });
  assert.equal(synthetic.organizationIdForLegacyBrandId(status), null);
  assert.equal(synthetic.sourceIdentityForLegacyBrandId(status).mappingStatus, status);
}

assert.throws(() => createRegistry({
  organizations: [{ id: "org:a" }],
  sourceIdentities: [
    { id: "source:1", legacyBrandId: "same", mappingStatus: "verified", presentationOrganizationId: "org:a" },
    { id: "source:2", legacyBrandId: "same", mappingStatus: "verified", presentationOrganizationId: "org:a" }
  ]
}), /Duplicate or missing legacy brand ID/);

assert.throws(() => createRegistry({
  organizations: [{ id: "org:a" }],
  sourceIdentities: [{ id: "source:1", legacyBrandId: "legacy-a", mappingStatus: "verified", presentationOrganizationId: "legacy-a" }]
}), /must map directly to an org: ID/);

assert.deepEqual(registry.counts, {
  organizations: 74,
  sourceIdentities: 76,
  verifiedMappings: 76,
  probableMappings: 0,
  unresolvedMappings: 0
});
assert.deepEqual(registryDocument.counts, {
  canonicalOrganizations: 74,
  sourceIdentities: 76,
  verifiedMappings: 76,
  probableMappings: 0,
  unresolvedMappings: 0,
  verifiedMerges: 2
});

console.log("CANONICAL_REGISTRY_QA_OK", JSON.stringify(registry.counts));
