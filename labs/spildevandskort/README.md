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

Tilføjelsen ligger i `load-screening.js` og `load-screening-ui.js`. Kortvisningen slås til under Renseanlæg. Eksisterende forsyningsfarver og kapacitetsstørrelser bevares, når screeningen er slået fra.

Screeningen bruger udelukkende EEA's rapporterede `uwwLoadEnteringUWWTP` for 2022. `data/plant-loads.json` kobles kun på PULS UUID. De 303 koblinger er lavet ved unikt eksakt anlægsnavn og højst 1 km afstand; EEA-id, afstand og kilde er gemt på hver kobling. Koblingerne omfatter også nedlagte anlæg, men kun aktive anlæg tælles i datadækningen. Ingen værdi overføres til et nyt anlæg med et andet UUID.

Teknisk kapacitet og godkendt belastning vises som separate PULS-baggrundsfelter og bruges aldrig til 10.000/150.000 PE-screeningen. Anlæg uden EEA-kobling vises som "EEA-belastning mangler".

Grupperne er en screening efter direktiv (EU) 2024/3019, artikel 7 og 8:

- mindst 150.000 PE: direkte tærskelscreening for tertiær og kvaternær rensning;
- 10.000–149.999 PE: risikobaseret screening, hvor byområde, recipient og national risikoudpegning skal vurderes;
- under 10.000 PE: under direktivets generelle screeningstærskel, men lokale og konkrete krav kan stadig gælde.

EEA 2022 er historisk og ikke en myndighedsudpegning. Direktivet anvender maksimal gennemsnitlig ugebelastning i det relevante år. Byområde, recipient, udledningstilladelse, risikoudpegning og eksisterende renseevne skal derfor verificeres, før et konkret opgraderingsbehov kan fastslås.

Det korrekte manuelle udtræk findes i PULS, ikke under Arealdatas eksport af analyseresultater:

1. Log ind på `https://puls.miljoeportal.dk/`.
2. Åbn værktøjskassen øverst til højre og vælg **Eksport af data**.
3. Vælg punktkildetypen **Renseanlæg** og datasættet for årsindberettet **Organisk belastning**.
4. Vælg **Miljøstyrelsen** som myndighed for et landsdækkende udtræk og vælg det nyeste afsluttede indberetningsår. Eksportér gerne flere afsluttede år, så hvert anlæg kan få det nyeste tilgængelige år.
5. Bevar PULS-id, år og felterne for husholdning/industri i eksporten. Importadapteren fastlægges først efter kontrol af de faktiske kolonnenavne og datasættets definitioner.

Danmarks Miljøportal beskriver årsindberetningen som spildevandsmængde, organisk belastning og hydraulisk belastning. Under Organisk belastning indberettes PE for husholdning og industri. Den officielle REST API har desuden `GET /wwtps/{id}/computations/terms/{year}`, hvor `loadComputation.load` og `authorizedLoad` holdes adskilt. API-kaldet kræver PULS-adgang; klientoplysninger må ikke gemmes i repository eller browserkode.

Kontrol: `node scripts/check-load-screening.cjs`. Eksisterende projekt- og oplandskontroller: `node scripts/check-project-geography.cjs` og `node scripts/qa_avedoere_catchment.cjs`. Desktop/mobil browserkontrol skal gennemføres før merge.
