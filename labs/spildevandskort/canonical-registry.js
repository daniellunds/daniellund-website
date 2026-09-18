// Additive canonical-organization compatibility layer.
// Legacy/source IDs stay available for data joins, while list and profile UI
// can use one stable organization ID per current organization.
(function exposeCanonicalRegistry(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.createSpildevandskortCanonicalRegistry = factory;
})(typeof globalThis !== "undefined" ? globalThis : this, function createCanonicalRegistry(document) {
  if (!document || !Array.isArray(document.organizations) || !Array.isArray(document.sourceIdentities)) {
    throw new TypeError("Canonical registry requires organizations and sourceIdentities arrays");
  }

  const organizationById = new Map();
  const sourceById = new Map();
  const sourceByLegacyBrandId = new Map();
  const sourceIdentitiesByOrganizationId = new Map();
  const legacyBrandIdsByOrganizationId = new Map();
  const allowedStatuses = new Set(["verified", "probable", "unresolved"]);

  for (const organization of document.organizations) {
    if (!organization?.id?.startsWith("org:")) throw new Error(`Invalid canonical organization ID: ${organization?.id}`);
    if (organizationById.has(organization.id)) throw new Error(`Duplicate canonical organization ID: ${organization.id}`);
    organizationById.set(organization.id, Object.freeze({ ...organization }));
    sourceIdentitiesByOrganizationId.set(organization.id, []);
    legacyBrandIdsByOrganizationId.set(organization.id, []);
  }

  for (const sourceIdentity of document.sourceIdentities) {
    const { id, legacyBrandId, mappingStatus, presentationOrganizationId } = sourceIdentity || {};
    if (!id || sourceById.has(id)) throw new Error(`Duplicate or missing source identity ID: ${id}`);
    if (!legacyBrandId || sourceByLegacyBrandId.has(legacyBrandId)) {
      throw new Error(`Duplicate or missing legacy brand ID: ${legacyBrandId}`);
    }
    if (!allowedStatuses.has(mappingStatus)) throw new Error(`Invalid mapping status for ${legacyBrandId}: ${mappingStatus}`);
    if (presentationOrganizationId !== null && presentationOrganizationId !== undefined) {
      if (!String(presentationOrganizationId).startsWith("org:")) {
        throw new Error(`Source identity ${legacyBrandId} must map directly to an org: ID`);
      }
      if (!organizationById.has(presentationOrganizationId)) {
        throw new Error(`Source identity ${legacyBrandId} maps to missing organization ${presentationOrganizationId}`);
      }
    } else if (mappingStatus === "verified") {
      throw new Error(`Verified source identity ${legacyBrandId} is missing a canonical organization`);
    }

    const frozen = Object.freeze({ ...sourceIdentity });
    sourceById.set(id, frozen);
    sourceByLegacyBrandId.set(legacyBrandId, frozen);
    if (mappingStatus === "verified" && presentationOrganizationId) {
      sourceIdentitiesByOrganizationId.get(presentationOrganizationId).push(frozen);
      legacyBrandIdsByOrganizationId.get(presentationOrganizationId).push(legacyBrandId);
    }
  }

  const dispositionPriority = new Map([
    ["canonicalSource", 0],
    ["virtualCanonical", 1],
    ["legalEntitySource", 2],
    ["legacyAlias", 3]
  ]);
  for (const [organizationId, sourceIdentities] of sourceIdentitiesByOrganizationId) {
    sourceIdentitiesByOrganizationId.set(organizationId, Object.freeze([...sourceIdentities].sort((a, b) =>
      (dispositionPriority.get(a.disposition) ?? 99) - (dispositionPriority.get(b.disposition) ?? 99)
      || a.legacyBrandId.localeCompare(b.legacyBrandId, "da")
    )));
  }
  for (const [organizationId, legacyIds] of legacyBrandIdsByOrganizationId) {
    legacyBrandIdsByOrganizationId.set(organizationId, Object.freeze([...legacyIds].sort((a, b) => a.localeCompare(b, "da"))));
  }

  function sourceIdentityForLegacyBrandId(legacyBrandId) {
    return sourceByLegacyBrandId.get(legacyBrandId) || null;
  }

  function organizationIdForLegacyBrandId(legacyBrandId) {
    const sourceIdentity = sourceIdentityForLegacyBrandId(legacyBrandId);
    return sourceIdentity?.mappingStatus === "verified" ? sourceIdentity.presentationOrganizationId || null : null;
  }

  function organizationForLegacyBrandId(legacyBrandId) {
    const organizationId = organizationIdForLegacyBrandId(legacyBrandId);
    return organizationId ? organizationById.get(organizationId) || null : null;
  }

  function organizationForId(organizationId) {
    return organizationById.get(organizationId) || null;
  }

  function legacyBrandIdsForOrganizationId(organizationId) {
    return legacyBrandIdsByOrganizationId.get(organizationId) || Object.freeze([]);
  }

  function sourceIdentitiesForOrganizationId(organizationId) {
    return sourceIdentitiesByOrganizationId.get(organizationId) || Object.freeze([]);
  }

  function preferredLegacyBrandIdForOrganizationId(organizationId) {
    return sourceIdentitiesForOrganizationId(organizationId)[0]?.legacyBrandId || null;
  }

  return Object.freeze({
    schemaVersion: document.schemaVersion,
    modelVersion: document.modelVersion,
    organizationForId,
    organizationIdForLegacyBrandId,
    organizationForLegacyBrandId,
    sourceIdentityForLegacyBrandId,
    sourceIdentitiesForOrganizationId,
    legacyBrandIdsForOrganizationId,
    preferredLegacyBrandIdForOrganizationId,
    counts: Object.freeze({
      organizations: organizationById.size,
      sourceIdentities: sourceById.size,
      verifiedMappings: [...sourceById.values()].filter((row) => row.mappingStatus === "verified").length,
      probableMappings: [...sourceById.values()].filter((row) => row.mappingStatus === "probable").length,
      unresolvedMappings: [...sourceById.values()].filter((row) => row.mappingStatus === "unresolved").length
    })
  });
});
