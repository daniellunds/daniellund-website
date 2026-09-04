# Dansk spildevandskort

Interaktivt kort under `daniellund.dk/labs/spildevandskort/`.

- Kloakoplande: Plandata, vedtagne oplande. 53.179 kildeoplande er samlet/dissolved til 276 render-features i fire gzip-chunks for bedre browserperformance.
- Renseanlæg: PULS, Danmarks Miljøportal.
- Forsyninger grupperes i otte landsdele som navigationslag; kortdata og ejerrelationer ændres ikke af grupperingen.
- PULS' registrerede ejer bevares; ansvarlig forsyning kobles separat via kuraterede aliases.

Browser-QA køres på featurebranchen for desktop og mobil før merge til `main`.
