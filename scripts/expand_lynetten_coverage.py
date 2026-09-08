import json, re
from collections import defaultdict
from pathlib import Path

ROOT=Path('labs/spildevandskort/data')
REL=ROOT/'wwtp-catchment-relations.json'
AUDIT=ROOT/'lynetten-coverage-audit.json'

def norm(v): return re.sub(r'\s+','',str(v or '')).upper()

def main():
    data=json.loads(REL.read_text(encoding='utf-8'))
    audit=json.loads(AUDIT.read_text(encoding='utf-8'))
    by={p['plantKey']:p for p in data['plants']}

    def add(key, mc, plans, url, label):
        plans=[str(x) for x in plans]
        plant=by[key]
        default=plant.get('municipalityCode')
        # Merge into an identical source relation if possible.
        for r in plant['relations']:
            rmc=int(r.get('municipalityCode',default))
            if rmc==mc and r.get('sourceUrl')==url and r.get('sourceLabel')==label:
                existing={norm(x) for x in r.get('planNumbers',[])}
                for pn in plans:
                    if norm(pn) not in existing:
                        r['planNumbers'].append(pn); existing.add(norm(pn))
                return
        plant['relations'].append({'municipalityCode':mc,'planNumbers':plans,'sourceUrl':url,'sourceLabel':label})

    # New direct Copenhagen relations found in official KK project pages.
    add('lynetten',101,['411','417'],
        'https://planer.kk.dk/spildevandsplan-2018/projekter/afloebssystem/a49-reduktion-af-overloeb-fra-pumpestation-strandvaenget-reguleringsbygvaerker/',
        'Københavns Kommune – A4.9 Strandvænget; opland 411, 415 og 417 til Lynetten')
    add('lynetten',101,['243'],
        'https://planer.kk.dk/spildevandsplan-2018/projekter/byudvikling/sundevedsgade-karreen/',
        'Københavns Kommune – Sundevedsgade-karreen; opland 243 til Lynetten')
    add('lynetten',101,['258'],
        'https://planer.kk.dk/spildevandsplan-2018/projekter/byudvikling/tillaeg-1-til-nuuks-plads/',
        'Københavns Kommune – Nuuks Plads; opland 258 til Lynetten')
    add('lynetten',101,['232','271'],
        'https://planer.kk.dk/spildevandsplan-2018/projekter/byudvikling/kornblomstvej-ii/',
        'Københavns Kommune – Kornblomstvej II; opland 232 og 271 til Lynetten')

    # Gentofte: close current Hellerup catchments from current official plan structure.
    add('lynetten',157,['ETAPE3','HELLERUPSYD'],
        'https://spildevandsplan.gentofte.dk/tillaeg/tillaeg-1/11-oplandsplan-for-separering-i-hellerup-3-opland/',
        'Gentofte Kommune – Hellerup 3: Etape 3/Hellerup Syd; spildevand til Lynetten')
    add('lynetten',157,['HELLERUP1','HELLERUP2'],
        'https://spildevandsplan.gentofte.dk/media/za2ntrde/bilag-1-oplandsoversigt-tlg.pdf',
        'Gentofte Kommune – Bilag 1: Hellerups hovedopland til Lynetten; aktuelle Hellerup 1/2 deloplande')
    # Hospital membership + receiving plant are deliberately represented by two source records.
    add('lynetten',157,['GENTOFTEHOSPITAL'],
        'https://spildevandsplan.gentofte.dk/status/industri-og-hospitalsspildevand/',
        'Gentofte Kommune – Gentofte Hospital er beliggende i Hellerups opland')
    add('lynetten',157,['GENTOFTEHOSPITAL'],
        'https://spildevandsplan.gentofte.dk/media/za2ntrde/bilag-1-oplandsoversigt-tlg.pdf',
        'Gentofte Kommune – Bilag 1: Hellerups opland til Lynetten')

    # Rebuild classification after direct additions.
    classified=defaultdict(dict); src=defaultdict(dict)
    for plant in data['plants']:
        default=plant.get('municipalityCode')
        for r in plant['relations']:
            mc=int(r.get('municipalityCode',default))
            for pn in r.get('planNumbers',[]):
                n=norm(pn); classified[mc][n]=plant['plantKey']; src[mc][n]=(r['sourceUrl'],r['sourceLabel'])

    inherited=defaultdict(lambda:defaultdict(list))
    for mc_s,muni in audit['municipalities'].items():
        mc=int(mc_s)
        for row in muni.get('catchments',[]):
            pn=norm(row['planNumber'])
            if pn in classified[mc]: continue
            codes=set(row.get('sewerTypes') or [])
            # Never infer type 6; only current wastewater codes 1/2/3 may inherit a documented parent.
            if not codes or not codes.issubset({1,2,3}): continue
            candidates=[]
            for parent,plant in classified[mc].items():
                if pn==parent or not pn.startswith(parent): continue
                tail=pn[len(parent):]
                if not parent or not parent[0].isdigit() or not tail or tail[0].isdigit(): continue
                candidates.append((len(parent),parent,plant))
            if not candidates: continue
            longest=max(x[0] for x in candidates)
            best=[x for x in candidates if x[0]==longest]
            if len({x[2] for x in best})!=1: continue
            _,parent,plant=best[0]
            url,label=src[mc][parent]
            inherited[(plant,mc,parent,url,label)]['plans'].append(row['planNumber'])

    inherited_count=0
    byplant=defaultdict(int)
    for (plant,mc,parent,url,label), obj in inherited.items():
        plans=sorted(set(obj['plans']),key=lambda x:(len(str(x)),str(x)))
        if not plans: continue
        add(plant,mc,plans,url,f'{label} · aktuelle Plandata-deloplande af dokumenteret hovedopland {parent}')
        inherited_count+=len(plans); byplant[plant]+=len(plans)

    data['version']=max(int(data.get('version',0)),11)
    data['notes']=data.get('notes','') + ' Current letter/dot subdivisions may inherit a documented numeric parent only when the current Plandata sewer code is 1, 2 or 3; type 6 is never inherited automatically.'
    REL.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('LYNETTEN_EXPANSION_OK',{'inherited':inherited_count,'byPlant':dict(byplant)})

if __name__=='__main__': main()
