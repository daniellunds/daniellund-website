#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const app1 = fs.readFileSync(path.join(root, "labs/spildevandskort/app1.js"), "utf8");
const app2 = fs.readFileSync(path.join(root, "labs/spildevandskort/app2.js"), "utf8");
const html = fs.readFileSync(path.join(root, "labs/spildevandskort/index.html"), "utf8");
const registry = JSON.parse(fs.readFileSync(path.join(root, "labs/spildevandskort/data/model/facility-registry.json"), "utf8"));

const helperStart = app1.indexOf("function facilityRecordRank");
const helperEnd = app1.indexOf("async function fetchAllPulsFeatures");
assert.ok(helperStart >= 0 && helperEnd > helperStart, "Facility presentation helpers must remain testable");

const context = vm.createContext({});
vm.runInContext(`${app1.slice(helperStart, helperEnd)}\nthis.buildFacilityPlants = buildFacilityPlants;`, context);

const facilities = new Map(registry.facilities.map(row => [row.id, row]));
const mappedPlants = registry.sourceRecords
  .filter(row => row.mappingStatus === "verified")
  .map((row, index) => {
    const facility = facilities.get(row.facilityId);
    return {
      id: row.pulsRecordId,
      sourceRecordId: row.pulsRecordId,
      sourceRecordRole: row.recordRole,
      facilityMappingStatus: row.mappingStatus,
      facilityId: row.facilityId,
      facilityName: facility.name,
      facilityLifecycleStatus: facility.lifecycleStatus,
      name: `Source ${index}`,
      active: true,
      coordinates: [10 + index / 1000, 56],
      capacity: 1000
    };
  });

const facilityPlants = context.buildFacilityPlants(mappedPlants);
assert.equal(facilityPlants.length, registry.facilities.length, "Default layer must contain one marker per verified facility");
assert.equal(new Set(facilityPlants.map(row => row.id)).size, registry.facilities.length, "Default facility markers must be unique");

const aarhus = facilityPlants.filter(row => row.facilityId.startsWith("facility:aarhus-vand-"));
assert.deepEqual(new Set(aarhus.map(row => row.name)), new Set(["Egå Renseanlæg", "Marselisborg Renseanlæg", "Åby Renseanlæg", "Viby Renseanlæg"]));
const viby = aarhus.find(row => row.name === "Viby Renseanlæg");
assert.equal(viby.facilitySourceCount, 4, "Four Viby source records must collapse to one physical facility");
assert.equal(viby.sourceRecordRole, "outletRecord", "Viby must use the real outlet record as its map anchor");

assert.match(html, /id="showVerifiedPlants" type="checkbox" checked/);
assert.match(html, /id="showPulsRecords" type="checkbox"(?! checked)/);
assert.match(app1, /state\.plants\.filter\(p=>!p\.includeInFacilityCount\)/);
assert.match(app2, /Ikke et selvstændigt verificeret anlæg/);

console.log("PLANT_PRESENTATION_QA", JSON.stringify({
  verifiedFacilities: facilityPlants.length,
  aarhusFacilities: aarhus.length,
  vibySourceRecords: viby.facilitySourceCount
}));
