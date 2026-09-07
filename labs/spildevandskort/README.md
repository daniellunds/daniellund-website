# Dansk spildevandskort

Interaktivt kort under `daniellund.dk/labs/spildevandskort/`.

- Kloakoplande: Plandata, vedtagne oplande. 53.179 kildeoplande er samlet/dissolved til 276 render-features i fire gzip-chunks for bedre browserperformance.
- Renseanlæg: PULS, Danmarks Miljøportal.
- Forsyninger grupperes i otte landsdele som navigationslag; kortdata og ejerrelationer ændres ikke af grupperingen.
- PULS' registrerede ejer bevares; ansvarlig forsyning kobles separat via kuraterede aliases.

Browser-QA køres med Playwright/Chromium på featurebranchen for både desktop og mobil før merge til `main`.

## Projektgeografi

`data/project-geography.json` klassificerer alle 143 profilposter som punkt, linje, område/polygon eller uafklaret. Klassifikation bygger på de eksisterende projektbeskrivelser og betyder ikke, at geografien er verificeret. Id og projektnavn skal begge matche; nye eller omordnede poster får ingen automatisk placering.

Punktprojekter kobles kun til eksplicit kontrollerede PULS-id'er. Områdeprojekter kan have et dokumenteret stedanker; det er ikke en entreprisegrænse. Linjeprojekter og uafklarede programmer får ingen punkt-fallback. Flere delanlæg skal opdeles før georeferering.

Svanemøllen Skybrudstunnel bruger HOFORs offentliggjorte datalag: 20 borede tunnelstrækninger, 11 gravede strækninger, én tømmeledning og 16 byggepladser med skakte. HOFORs kildegeometri i EPSG:25832 er transformeret til GeoJSON i EPSG:4326. De tre medbygherreposter deler én geometri på kortet. Kilden og hentningsdatoen fremgår af datasættet og projektdetaljerne.

`python scripts/import-svanemoellen.py` opdaterer geometrien (kræver `pyproj`). Kortets serviceadresser gemmes ikke i appen. `node scripts/check-project-geography.cjs` kontrollerer fuld klassifikationsdækning, identiteter, koordinater og blokering af misvisende fallback. Desktop- og mobil-QA omfatter også geometri-filter, tracé, skakte og fællesprojekter.

Næste research: afgrænsninger for de 59 områdeprojekter, øvrige seks linjeposter uden verificeret tracé, samt opdeling af 47 uafklarede programmer og projekter med flere delanlæg. Aarhus ReWater beholder Tangkrogen som områdeanker. Værdivand og centraliseringen på Djursland placeres først, når deres respektive delanlæg og transportnet er dokumenteret.
