// Additive physical-facility registry for verified PULS source-record mappings.
// A presentation organization is a color/identity relation only; it does not
// infer legal ownership, operation, network responsibility or treatment route.
(function exposeFacilityRegistry(root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory;
  else root.createSpildevandskortFacilityRegistry = factory;
})(typeof globalThis !== "undefined" ? globalThis : this, function createFacilityRegistry(document) {
  if (!document || !Array.isArray(document.facilities) || !Array.isArray(document.sourceRecords)) {
    throw new TypeError("Facility registry requires facilities and sourceRecords arrays");
  }

  const facilityById = new Map();
  const sourceRecordById = new Map();
  const allowedStatuses = new Set(["verified", "probable", "unresolved"]);

  for (const facility of document.facilities) {
    if (!facility?.id?.startsWith("facility:")) throw new Error(`Invalid facility ID: ${facility?.id}`);
    if (facilityById.has(facility.id)) throw new Error(`Duplicate facility ID: ${facility.id}`);
    if (!facility.presentationOrganizationId?.startsWith("org:")) {
      throw new Error(`Facility ${facility.id} is missing its presentation organization`);
    }
    facilityById.set(facility.id, Object.freeze({ ...facility }));
  }

  for (const sourceRecord of document.sourceRecords) {
    const { pulsRecordId, mappingStatus, facilityId } = sourceRecord || {};
    if (!pulsRecordId || sourceRecordById.has(pulsRecordId)) {
      throw new Error(`Duplicate or missing PULS source-record ID: ${pulsRecordId}`);
    }
    if (!allowedStatuses.has(mappingStatus)) throw new Error(`Invalid mapping status for ${pulsRecordId}: ${mappingStatus}`);
    if (mappingStatus === "verified" && !facilityId) throw new Error(`Verified PULS record ${pulsRecordId} needs a facilityId`);
    if (mappingStatus !== "verified" && facilityId) throw new Error(`Only verified PULS records may resolve to a facility: ${pulsRecordId}`);
    if (facilityId && !facilityById.has(facilityId)) throw new Error(`PULS record ${pulsRecordId} maps to missing facility ${facilityId}`);
    sourceRecordById.set(pulsRecordId, Object.freeze({ ...sourceRecord }));
  }

  function facilityForId(facilityId) {
    return facilityById.get(facilityId) || null;
  }

  function sourceRecordForPulsId(pulsRecordId) {
    return sourceRecordById.get(pulsRecordId) || null;
  }

  function facilityIdForPulsRecordId(pulsRecordId) {
    const sourceRecord = sourceRecordForPulsId(pulsRecordId);
    return sourceRecord?.mappingStatus === "verified" ? sourceRecord.facilityId || null : null;
  }

  function facilityForPulsRecordId(pulsRecordId) {
    const facilityId = facilityIdForPulsRecordId(pulsRecordId);
    return facilityId ? facilityForId(facilityId) : null;
  }

  function presentationOrganizationIdForPulsRecordId(pulsRecordId) {
    return facilityForPulsRecordId(pulsRecordId)?.presentationOrganizationId || null;
  }

  return Object.freeze({
    schemaVersion: document.schemaVersion,
    modelVersion: document.modelVersion,
    facilityForId,
    sourceRecordForPulsId,
    facilityIdForPulsRecordId,
    facilityForPulsRecordId,
    presentationOrganizationIdForPulsRecordId,
    counts: Object.freeze({
      facilities: facilityById.size,
      sourceRecords: sourceRecordById.size,
      verifiedMappings: [...sourceRecordById.values()].filter(row => row.mappingStatus === "verified").length,
      unresolvedMappings: [...sourceRecordById.values()].filter(row => row.mappingStatus === "unresolved").length,
      countableSourceRecords: [...sourceRecordById.values()].filter(row => row.includeInFacilityCount === true).length
    })
  });
});
