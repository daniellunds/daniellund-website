# Canonical organization registry

Delopgave 5 introduced an additive identity layer beside the existing map model.
Delopgave 6 uses it for supply-list search and utility profiles without rewriting
`brandId` values, PULS IDs, project IDs or source geometry. Delopgave 7 uses the
same canonical IDs for map colors and introduces a separate, additive registry
for verified physical facilities. Delopgave 8 adds verified operational and
treatment-route relations without deriving them from presentation identity.

## Files

- `organization-registry.json` contains the 74 verified current presentation
  organizations and all 76 runtime source/legacy identities audited on
  2026-09-18.
- `facility-registry.json` contains 27 verified physical wastewater facilities:
  26 with a verified direct operating relation in the audited sample and DIN
  Forsyning's Renseanlæg Øst as a verified route destination. It also contains
  32 explicitly audited PULS source-record mappings. One unresolved small record
  remains without a `facilityId`.
- `wastewater-relations.json` contains the verified semantics for ten audited
  organizations: direct operation, external treatment routes and documented
  co-ownership context. Organizations outside that sample remain explicitly
  unaudited.
- `../../canonical-registry.js` creates pure forward and reverse lookups without
  touching application state or UI rendering.
- `../../facility-registry.js` keeps source-record identity separate from
  physical-facility identity.
- `../../wastewater-relations.js` exposes only verified facility and treatment
  relations to lists and profiles.
- `../../../../scripts/check-canonical-registry.cjs` validates the registry and
  its compatibility invariants.
- `../../../../scripts/check-canonical-ui.cjs` validates the 76-to-74 UI
  projection, old/new runtime parity, legacy-name search and canonical profile
  selection.

## Identity rules

- A **canonical organization** is the one current presentation identity used
  for list rows, profiles, search results and colors. It is not automatically a
  legal company, network owner or treatment-plant operator.
- A **legacy ID** is an immutable identity from the existing application or a
  source dataset. It remains available for Plandata, PULS, project and catchment
  joins even when several legacy IDs present through one organization.
- A **verified merger** changes presentation only: every merged legacy ID maps
  directly to the same `org:<slug>` ID, while its original ID and source data
  remain unchanged.
- Customer-facing brands and legal companies are separate concepts. Verified
  legal names and CVR numbers live in `legalStructureFindings`; they do not
  replace canonical display identity or source IDs.
- A **joint treatment organization** uses
  `organizationType: jointTreatmentOrganization` and is not presented as an
  ordinary municipal network utility.
- Canonical organization IDs use the stable `org:<slug>` namespace.
- Existing `legacyBrandId` values remain immutable source identities.
- A verified source identity maps directly to one canonical organization.
- `probable` and `unresolved` identities remain inspectable but do not resolve
  for presentation.
- Presentation mapping does not prove ownership, operation, network
  responsibility or a wastewater treatment route.
- Ownership context names its subject legal entity separately (for example a
  municipality) and uses `profileOrganizationId` only to choose the profile on
  which the context is presented.
- Direct facility counts are calculated from verified `operatesFacility`
  relations to unique active physical facilities. They are never inferred from
  PULS source-record counts.
- PULS `Owner` remains unchanged source data. A facility's
  `presentationOrganizationId` controls public identity and color only.
- A source record receives a `facilityId` only when the physical relation is
  verified. Technical, fictitious and outlet records may share one facility;
  unresolved records retain `facilityId: null`.

The two verified mergers are:

```text
nordfyns-forsyning  -> org:vandcenter-syd
syddjurs-spildevand -> org:aquadjurs
```

Display-name and legal-source remaps such as `thisted-vand`,
`mariagerfjord-vand` and `langeland-forsyning` remain separate source
identities even though they present through a current canonical organization.

## Compatibility API

Create an adapter with `createSpildevandskortCanonicalRegistry(document)` in a
browser or by requiring `canonical-registry.js` in Node. The adapter exposes:

```text
organizationIdForLegacyBrandId(id)
legacyBrandIdsForOrganizationId(id)
organizationForLegacyBrandId(id)
organizationForId(id)
sourceIdentityForLegacyBrandId(id)
sourceIdentitiesForOrganizationId(id)
preferredLegacyBrandIdForOrganizationId(id)
```

The production page loads all three adapters before PULS normalization. The
list and profile integration render one row per canonical organization. Map
selection, projects and source joins retain legacy IDs, while administrative
areas, adopted catchments, plants and profile swatches resolve their color
through the canonical organization. During the transition, every source
identity is still compared with `current-operators.js`; a mismatch stops
canonical UI activation.

The supply list and profiles show `Egne/driftede renseanlæg` only for the ten
audited organizations. External treatment is shown separately as `Spildevand
behandles hos`. All other profiles show `Ikke verificeret`; the technical count
of active PULS source records remains visibly labelled as a separate concept.
