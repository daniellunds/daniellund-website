#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const dataRoot = path.join(root, "labs/spildevandskort/data");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const createRegistry = require(path.join(root, "labs/spildevandskort/canonical-registry.js"));
const registry = createRegistry(readJson(path.join(dataRoot, "model/organization-registry.json")));
const sourceBrands = readJson(path.join(dataRoot, "brands.json")).brands;
const virtualBrands = [
  { id: "biofos", name: "BIOFOS", municipalities: [] },
  { id: "moelleaavaerket", name: "Mølleåværket", municipalities: [] },
  { id: "laesoe-forsyning", name: "Læsø Forsyning", municipalities: [] }
];
const brands = [...sourceBrands, ...virtualBrands.filter((row) => !sourceBrands.some((brand) => brand.id === row.id))];
const state = { brands, brandById: new Map(brands.map((brand) => [brand.id, brand])) };
const context = { state, window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, "labs/spildevandskort/current-operators.js"), "utf8"), context);

const parity = brands.map((brand) => {
  const oldTarget = context.window.currentOperatorForBrand(brand.id).operatorBrandId;
  return {
    legacyBrandId: brand.id,
    oldCanonical: registry.organizationIdForLegacyBrandId(oldTarget),
    newCanonical: registry.organizationIdForLegacyBrandId(brand.id)
  };
});
assert.equal(parity.length, 76);
assert.deepEqual(parity.filter((row) => !row.oldCanonical || row.oldCanonical !== row.newCanonical), []);

const canonicalRows = registry.counts.organizations === 74
  ? [...new Set(brands.map((brand) => registry.organizationIdForLegacyBrandId(brand.id)))]
  : [];
assert.equal(canonicalRows.length, 74);
assert.ok(canonicalRows.every(Boolean));

const profileIndex = readJson(path.join(dataRoot, "utility-profiles-index.json"));
const profiles = Object.assign({}, ...profileIndex.files.map((file) => readJson(path.join(dataRoot, file)).profiles || {}));
const profileForOrganization = (organizationId) => {
  const preferred = registry.preferredLegacyBrandIdForOrganizationId(organizationId);
  return profiles[organizationId] || profiles[preferred]
    || registry.legacyBrandIdsForOrganizationId(organizationId).map((id) => profiles[id]).find(Boolean)
    || null;
};
assert.deepEqual(canonicalRows.filter((organizationId) => !profileForOrganization(organizationId)), []);
for (const organizationId of canonicalRows) {
  const profile = profileForOrganization(organizationId);
  assert.ok(profile.website, `${organizationId} is missing website`);
  assert.ok(profile.phone || profile.email, `${organizationId} is missing contact information`);
}
const searchableOrganizationIds = (query) => {
  const q = query.toLocaleLowerCase("da");
  return registry.counts.organizations && canonicalRows.filter((organizationId) => {
    const organization = registry.organizationForId(organizationId);
    const sources = registry.sourceIdentitiesForOrganizationId(organizationId);
    return [organization.displayName, ...(organization.searchNames || []), ...sources.flatMap((source) => [source.sourceName, source.legacyBrandId])]
      .filter(Boolean).join(" ").toLocaleLowerCase("da").includes(q);
  });
};

assert.deepEqual(searchableOrganizationIds("Nordfyns Forsyning"), ["org:vandcenter-syd"]);
assert.deepEqual(searchableOrganizationIds("Syddjurs Spildevand"), ["org:aquadjurs"]);
assert.equal(registry.organizationForId("org:vandcenter-syd").displayName, "VandCenter Syd");
assert.equal(registry.organizationForId("org:aquadjurs").displayName, "AquaDjurs");
assert.equal(profileForOrganization("org:vandcenter-syd"), profiles["vandcenter-syd"]);
assert.equal(profileForOrganization("org:aquadjurs"), profiles.aquadjurs);
assert.match(profileForOrganization("org:vandcenter-syd").website, /vandcenter\.dk/);
assert.match(profileForOrganization("org:aquadjurs").website, /aquadjurs\.dk/);

console.log("CANONICAL_UI_QA_OK", JSON.stringify({
  sourceIdentities: parity.length,
  parityMatches: parity.length,
  canonicalRows: canonicalRows.length,
  canonicalProfiles: canonicalRows.length,
  legacySearches: 2
}));
