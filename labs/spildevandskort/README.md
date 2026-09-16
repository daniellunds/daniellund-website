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

## Belastningsscreening

Tilføjelsen ligger i `load-screening.js` og `load-screening-ui.js`. Kortvisningen slås til under Renseanlæg. Eksisterende forsyningsfarver og kapacitetsstørrelser bevares, når screening er slået fra. Anlægslisten og detaljerne viser belastningens kilde og år; teknisk kapacitet og godkendt belastning er separate baggrundsfelter.

`data/plant-loads.json` kobles kun på PULS UUID. De 303 historiske koblinger er overført fra prototypens EEA 2022-import: unikt eksakt navn og højst 1 km, med EEA-id, afstand og kilde gemt på hver kobling. De omfatter også nedlagte anlæg; kun aktive anlæg tælles i screeningens datadækning. EEA bruges kun, når dokumenteret PULS-årsbelastning mangler. Ingen værdier overføres til et nyt anlæg med et andet UUID.

Seneste dokumenterede årsindløbs-PE importeres med:

```
node scripts/import-annual-puls-loads.cjs annual.json labs/spildevandskort/data/plant-loads.json
```

Input: `{ "basis": "annual-inlet", "sourceUrl": "https://...", "retrievedAt": "YYYY-MM-DD", "records": [{ "plantId": "PULS-UUID", "year": 2025, "inletLoadPE": 12345 }] }`. Kildens betydning og rapporteringsperiode skal kontrolleres før normalisering. Prøver, udløbsbelastning, kapacitet og godkendt belastning accepteres ikke som årsindløbsdata. Nyeste afsluttede år prioriteres pr. anlæg. Dubletter og modstridende værdier for samme anlæg/år afvises.

### Kontrol af det uploadede Arealdata-udtræk, 16. september 2026

`puls_vRenseanlaegResultater.csv.zip` indeholder `vRenseanlaegResultater.csv`, 5.287.580.793 udpakkede bytes. Alle 9.219.995 CSV-poster er gennemgået som semikolonsepareret UTF-8 med citerede flerlinjefelter. Der er 5.844.414 analyser, 2.361.543 feltmålinger og 1.014.038 feltobservationer.

Parameteren Personækvivalenter forekommer 1.008 gange ved 17 anlæg i prøveår 2020–2026. 884 poster angiver enheden PE, 124 angiver ikke en enhed. 135 har ikke to gyldige prøvedatoer; ingen af de øvrige har en periode over 32 dage. Disse prøver er ikke dokumenterede årsindberetninger. Den eneste BI5-post med enheden kg/år er modificeret BI5 i FMC/Cheminovas afløb og må ikke bruges som årlig indløbsbelastning. Nogle uvedkommende parametre er også mærket PE; enhed alene er derfor ikke nok til at identificere belastning.

Status: **PULS-årsbelastning mangler fortsat**. Det uploadede prøveresultat-udtræk importeres ikke som årsbelastning. Der kræves et særskilt udtræk af årsindberetning eller dokumenteret årlig indløbstransport. Screeningen er foreløbig: års-PE er ikke dokumentation for maksimal gennemsnitlig ugebelastning; byområdestørrelse, recipient/risikoudpegning og eksisterende renseevne skal verificeres.

Det korrekte manuelle udtræk findes i PULS, ikke under Arealdatas eksport af analyseresultater:

1. Log ind på `https://puls.miljoeportal.dk/`.
2. Åbn værktøjskassen øverst til højre og vælg **Eksport af data**.
3. Vælg punktkildetypen **Renseanlæg** og datasættet for årsindberettet **Organisk belastning**.
4. Vælg **Miljøstyrelsen** som myndighed for et landsdækkende udtræk og vælg det nyeste afsluttede indberetningsår. Eksportér gerne flere afsluttede år, så hvert anlæg kan få det nyeste tilgængelige år.
5. Bevar PULS-id, år og felterne for husholdning/industri i eksporten. Importadapteren fastlægges først efter kontrol af de faktiske kolonnenavne og datasættets definitioner.

Danmarks Miljøportal beskriver årsindberetningen som spildevandsmængde, organisk belastning og hydraulisk belastning. Under Organisk belastning indberettes PE for husholdning og industri. Den officielle REST API har desuden `GET /wwtps/{id}/computations/terms/{year}`, hvor `loadComputation.load` og `authorizedLoad` holdes adskilt. API-kaldet kræver PULS-adgang; klientoplysninger må ikke gemmes i repository eller browserkode.

Kontrol: `node scripts/check-load-screening.cjs`. Eksisterende projekt- og oplandskontroller: `node scripts/check-project-geography.cjs` og `node scripts/qa_avedoere_catchment.cjs`. Desktop/mobil browserkontrol skal gennemføres før merge.
