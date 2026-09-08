import json
from pathlib import Path

ROOT=Path('labs/spildevandskort/data')
geo=json.loads((ROOT/'wwtp-catchment-pilot.geojson').read_text(encoding='utf-8'))
meta=json.loads((ROOT/'wwtp-catchment-pilot-meta.json').read_text(encoding='utf-8'))
features=geo['features']

assert len(features)>=145,len(features)
assert meta['mapFeatureCount']==len(features),(meta['mapFeatureCount'],len(features))
assert set(f['properties']['plantKey'] for f in features)=={'lynetten','damhusaen','moelleaavaerket'}
assert meta['coverageStatus']=='partial-documented-pilot'
for key in ('lynetten','damhusaen','moelleaavaerket'):
    assert meta['plants'][key]['isCompleteCatchment'] is False
assert meta['plants']['lynetten']['puls']['id']=='Renseanlaeg.8793f333-ad28-446d-8d0e-c9c854ca4a6d'
assert meta['plants']['damhusaen']['puls']['id']=='Renseanlaeg.87c30072-633c-440b-b3a1-1b0f529acf6f'
assert meta['plants']['moelleaavaerket']['puls']['id']=='Renseanlaeg.44f9a35f-2848-47f1-a82f-bdc2da36947c'

for f in features:
    codes=set(f['properties'].get('sewerTypeCodes') or [])
    assert not codes.intersection({4,5}),(f['properties'].get('municipalityCode'),f['properties'].get('planNumber'),codes)

def rows(mcode,key=None):
    return [f for f in features if f['properties'].get('municipalityCode')==mcode and (key is None or f['properties'].get('plantKey')==key)]

def plans(fs):
    return {f['properties'].get('planNumber') for f in fs}

# Gentofte -> Lynetten pilot relations.
gentofte=rows(157,'lynetten')
gentofte_expected={'ENGHAVERENDEN','KILDESKOVSRENDEN','SKOVSHOVED','SØBORGHUSRENDEN','TUBORG','AUREHØJVEJ','SOFIEVEJ','SANKTPEDERSVEJ','CAROLINEVEJ','TUBORGPARKVEJ','JOMSBORGVEJ','EVANSTONEVEJ'}
assert gentofte_expected.issubset(plans(gentofte))

# Frederiksberg split between Lynetten and Damhusåen.
fb=rows(147)
assert len(fb)==5,len(fb)
assert plans(rows(147,'lynetten'))=={'OPLAND1','OPLAND2','OPLAND3'}
assert plans(rows(147,'damhusaen'))=={'OPLAND4','OPLAND5'}

# Herlev -> Damhusåen.
herlev_expected={'101','102','103A','103B','103C','104','105','106','107','108','200','201','202','203A','203B','204'}
herlev=rows(163)
assert len(herlev)==16,len(herlev)
assert plans(herlev)==herlev_expected
assert {f['properties']['plantKey'] for f in herlev}=={'damhusaen'}
assert '103D' not in plans(herlev)

# Rødovre Hovedopland D -> Damhusåen.
roedovre_expected={'DAF01','DAF18','DAS','DB','DB1','DBS','DC','DD','DE','DF','DG','DH','DK','DL','DM','DMF17','DN','DP','DQS','DR','DR1','DS','DT'}
roedovre=rows(175)
assert len(roedovre)==23,len(roedovre)
assert plans(roedovre)==roedovre_expected
assert {f['properties']['plantKey'] for f in roedovre}=={'damhusaen'}

# Lyngby-Taarbæk documented LR catchments -> Lynetten.
ltk_expected={'ER01','ER02','ER03','ER04','NY02','TA01','TA02','TA03','TA04','TA05','TA06','TA07','TA08','TA09','TA10','TA11','TA12','TA13','TA14','TA15','TA16','TA17','TA18','TA19','TA20','TA21','TA23','TA24','TA26'}
ltk=rows(173)
assert len(ltk)==29,len(ltk)
assert plans(ltk)==ltk_expected
assert {f['properties']['plantKey'] for f in ltk}=={'lynetten'}
assert not {'TA22','TA25'}.intersection(plans(ltk))

# Gladsaxe: all 18 current Plandata catchments have source-backed receiving plants.
glx_lyn={'UTTERSLEVMOSE-DELOMRÅDEBUDDINGE','UTTERSLEVMOSE-DELOMRÅDEBUDDINGEHOVEDGADE','UTTERSLEVMOSE-DELOMRÅDESØBORG','UTTERSLEVMOSE-DELOMRÅDEUTTERSLEV'}
glx_dam={'GYNGEMOSEN-DELOMRÅDEGLADSAXEERHVERV','GYNGEMOSEN-DELOMRÅDEGYNGEMOSEN','GYNGEMOSEN-DELOMRÅDEHØJEGLADSAXE','KAGSÅEN-DELOMRÅDEKAGSÅ','KAGSÅEN-DELOMRÅDEMØRKHØJ'}
glx_mol={'BAGSVÆRDSØ-DELOMRÅDEBAGSVÆRD','BAGSVÆRDSØ-DELOMRÅDEBAGSVÆRDERHVERV','BAGSVÆRDSØ-DELOMRÅDEBAGSVÆRDSØ','BAGSVÆRDSØ-DELOMRÅDEGLADSAXE','BAGSVÆRDSØ-DELOMRÅDEVIBEVÆNGET','BAGSVÆRDRENDEN-DELOMRÅDEKONGSHVILE','BAGSVÆRDRENDEN-DELOMRÅDESTENGÅRD','HOLLANDSRENDEN','VÆREBROÅ'}
gladsaxe=rows(159)
assert len(gladsaxe)==18,len(gladsaxe)
assert plans(rows(159,'lynetten'))==glx_lyn
assert plans(rows(159,'damhusaen'))==glx_dam
assert plans(rows(159,'moelleaavaerket'))==glx_mol
missing_glx=[r for info in meta['plants'].values() for r in info['missingRelations'] if r.get('municipalityCode')==159]
assert missing_glx==[],missing_glx

for mcode in (147,157,159,163,173,175):
    missing=[r for info in meta['plants'].values() for r in info['missingRelations'] if r.get('municipalityCode')==mcode]
    assert missing==[],(mcode,missing)

assert meta.get('excludedUnseweredMatches',0)>=2
print('WWTP_PILOT_STATIC_QA_OK',len(features),'GLADSAXE',len(gladsaxe),'PLANTS',sorted(meta['plants']))
