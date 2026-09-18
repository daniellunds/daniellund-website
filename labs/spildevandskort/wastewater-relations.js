// Verified UI semantics for physical wastewater facilities and treatment routes.
// Unverified organizations remain explicit instead of inheriting PULS-record counts.
(function exposeWastewaterRelations(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.createSpildevandskortWastewaterRelations = factory;
})(typeof globalThis !== "undefined" ? globalThis : this, function createWastewaterRelations(document, dependencies = {}) {
  if (!document || !Array.isArray(document.organizationSemantics) || !Array.isArray(document.facilityPartyRelations)
    || !Array.isArray(document.wastewaterRoutes) || !Array.isArray(document.organizationRelations)) {
    throw new TypeError("Wastewater relations require organizationSemantics, facilityPartyRelations, wastewaterRoutes and organizationRelations arrays");
  }

  const { organizationRegistry, facilityRegistry } = dependencies;
  if (!organizationRegistry || !facilityRegistry) throw new TypeError("Wastewater relations require organization and facility registries");
  const verified = row => row?.verification?.status === "verified";
  const semanticsByOrganizationId = new Map();
  const facilityRelationsByOrganizationId = new Map();
  const routesByOrganizationId = new Map();
  const organizationRelationsByOrganizationId = new Map();

  const requireOrganization = id => {
    if (!organizationRegistry.organizationForId(id)) throw new Error(`Missing canonical organization: ${id}`);
  };
  const requireFacility = id => {
    if (id && !facilityRegistry.facilityForId(id)) throw new Error(`Missing physical facility: ${id}`);
  };
  const append = (map, key, value) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(Object.freeze({ ...value }));
  };

  for (const row of document.organizationSemantics) {
    requireOrganization(row.organizationId);
    if (semanticsByOrganizationId.has(row.organizationId)) throw new Error(`Duplicate organization semantics: ${row.organizationId}`);
    semanticsByOrganizationId.set(row.organizationId, Object.freeze({ ...row }));
  }
  for (const row of document.facilityPartyRelations) {
    requireOrganization(row.organizationId);requireFacility(row.facilityId);
    if (!row.id || row.relationType !== "operatesFacility") throw new Error(`Invalid facility relation: ${row.id}`);
    append(facilityRelationsByOrganizationId, row.organizationId, row);
  }
  for (const row of document.wastewaterRoutes) {
    requireOrganization(row.fromOrganizationId);requireOrganization(row.toOrganizationId);requireFacility(row.facilityId);
    if (!row.id || row.relationType !== "routesWastewaterTo") throw new Error(`Invalid wastewater route: ${row.id}`);
    append(routesByOrganizationId, row.fromOrganizationId, row);
  }
  for (const row of document.organizationRelations) {
    requireOrganization(row.profileOrganizationId);requireOrganization(row.toOrganizationId);
    if (!row.id || row.relationType !== "coOwnsOrganizationOrFacility" || !row.subjectEntity?.displayName) {
      throw new Error(`Invalid organization relation: ${row.id}`);
    }
    append(organizationRelationsByOrganizationId, row.profileOrganizationId, row);
  }

  function semanticsForOrganizationId(organizationId) {
    const organization = organizationRegistry.organizationForId(organizationId);
    if (!organization) return null;
    const summary = semanticsByOrganizationId.get(organizationId) || null;
    const facilityRelations = (facilityRelationsByOrganizationId.get(organizationId) || []).filter(verified);
    const directFacilities = facilityRelations
      .map(row => facilityRegistry.facilityForId(row.facilityId))
      .filter(facility => facility?.facilityType === "wastewaterTreatmentPlant" && facility.lifecycleStatus === "active");
    const routes = (routesByOrganizationId.get(organizationId) || []).filter(verified).map(row => ({
      ...row,
      facility: facilityRegistry.facilityForId(row.facilityId),
      treatmentOrganization: organizationRegistry.organizationForId(row.toOrganizationId)
    }));
    const coOwnerships = (organizationRelationsByOrganizationId.get(organizationId) || []).filter(verified).map(row => ({
      ...row,
      targetOrganization: organizationRegistry.organizationForId(row.toOrganizationId)
    }));
    const auditStatus = verified(summary) ? "verified" : "notAudited";
    if (auditStatus === "verified" && Number(summary.recommendedDirectFacilityCount) !== new Set(directFacilities.map(row => row.id)).size) {
      throw new Error(`Facility count mismatch for ${organizationId}`);
    }
    const defaultRole = organization.organizationType === "jointTreatmentOrganization"
      ? { primaryRole: "jointTreatmentOrganization", roleLabel: "Fælles renseorganisation" }
      : { primaryRole: "utility", roleLabel: "Forsyning · roller ikke fuldt auditeret" };
    return Object.freeze({
      organizationId,
      organization,
      auditStatus,
      primaryRole: summary?.primaryRole || defaultRole.primaryRole,
      roleLabel: summary?.roleLabel || defaultRole.roleLabel,
      directActiveFacilityCount: auditStatus === "verified" ? new Set(directFacilities.map(row => row.id)).size : null,
      directFacilities: Object.freeze([...new Map(directFacilities.map(row => [row.id, row])).values()]),
      routes: Object.freeze(routes),
      coOwnerships: Object.freeze(coOwnerships),
      auditedActivePulsRecords: auditStatus === "verified" ? summary.activePulsSourceRecords : null,
      verification: summary?.verification || null
    });
  }

  return Object.freeze({
    schemaVersion: document.schemaVersion,
    modelVersion: document.modelVersion,
    semanticsForOrganizationId,
    counts: Object.freeze({
      auditedOrganizations: [...semanticsByOrganizationId.values()].filter(verified).length,
      verifiedFacilityRelations: document.facilityPartyRelations.filter(verified).length,
      verifiedRoutes: document.wastewaterRoutes.filter(verified).length,
      verifiedOrganizationRelations: document.organizationRelations.filter(verified).length
    })
  });
});
