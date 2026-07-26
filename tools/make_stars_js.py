#!/usr/bin/env python3
"""Emit src/stars.js — the Local Bubble as an ES module.

Same curation as the Pebble Solfarer catalog (100 ly, systems deduped),
plus per-star temperature for the relativistic flight shader. Reads the
HYG CSV already downloaded by the watchface tools, or fetches it.
"""
import csv, json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CSV_CANDIDATES = [
    os.path.join(HERE, 'hygdata_v41.csv'),
    os.path.abspath(os.path.join(ROOT, '..', 'Pebble', 'Solfarer', 'tools',
                                 'hygdata_v41.csv')),
]
URL = ('https://raw.githubusercontent.com/astronexus/HYG-Database/main/'
       'hyg/CURRENT/hygdata_v41.csv')

LY_PER_PC = 3.26156
MAX_LY = 100.0
NEAR_KEEP_LY = 50.0
DIM_CAP_ABSMAG = 8.0

R = [[-0.0548755604, -0.8734370902, -0.4838350155],
     [ 0.4941094279, -0.4448296300,  0.7469822445],
     [-0.8676661490, -0.1980763734,  0.4559837762]]

GREEK = {
 'Alp':'Alpha','Bet':'Beta','Gam':'Gamma','Del':'Delta','Eps':'Epsilon',
 'Zet':'Zeta','Eta':'Eta','The':'Theta','Iot':'Iota','Kap':'Kappa',
 'Lam':'Lambda','Mu':'Mu','Nu':'Nu','Xi':'Xi','Omi':'Omicron','Pi':'Pi',
 'Rho':'Rho','Sig':'Sigma','Tau':'Tau','Ups':'Upsilon','Phi':'Phi',
 'Chi':'Chi','Psi':'Psi','Ome':'Omega'}

CON_FULL = {
 'And':'Andromeda','Ant':'Antlia','Aps':'Apus','Aql':'Aquila','Aqr':'Aquarius',
 'Ara':'Ara','Ari':'Aries','Aur':'Auriga','Boo':'Bootes','CMa':'Canis Major',
 'CMi':'Canis Minor','CVn':'Canes Venatici','Cae':'Caelum',
 'Cam':'Camelopardalis','Cap':'Capricornus','Car':'Carina','Cas':'Cassiopeia',
 'Cen':'Centaurus','Cep':'Cepheus','Cet':'Cetus','Cha':'Chamaeleon',
 'Cir':'Circinus','Cnc':'Cancer','Col':'Columba','Com':'Coma Berenices',
 'CrA':'Corona Australis','CrB':'Corona Borealis','Crt':'Crater','Cru':'Crux',
 'Crv':'Corvus','Cyg':'Cygnus','Del':'Delphinus','Dor':'Dorado','Dra':'Draco',
 'Equ':'Equuleus','Eri':'Eridanus','For':'Fornax','Gem':'Gemini','Gru':'Grus',
 'Her':'Hercules','Hor':'Horologium','Hya':'Hydra','Hyi':'Hydrus',
 'Ind':'Indus','LMi':'Leo Minor','Lac':'Lacerta','Leo':'Leo','Lep':'Lepus',
 'Lib':'Libra','Lup':'Lupus','Lyn':'Lynx','Lyr':'Lyra','Men':'Mensa',
 'Mic':'Microscopium','Mon':'Monoceros','Mus':'Musca','Nor':'Norma',
 'Oct':'Octans','Oph':'Ophiuchus','Ori':'Orion','Pav':'Pavo','Peg':'Pegasus',
 'Per':'Perseus','Phe':'Phoenix','Pic':'Pictor','PsA':'Piscis Austrinus',
 'Psc':'Pisces','Pup':'Puppis','Pyx':'Pyxis','Ret':'Reticulum',
 'Scl':'Sculptor','Sco':'Scorpius','Sct':'Scutum','Ser':'Serpens',
 'Sex':'Sextans','Sge':'Sagitta','Sgr':'Sagittarius','Tau':'Taurus',
 'Tel':'Telescopium','TrA':'Triangulum Australe','Tri':'Triangulum',
 'Tuc':'Tucana','UMa':'Ursa Major','UMi':'Ursa Minor','Vel':'Vela',
 'Vir':'Virgo','Vol':'Volans','Vul':'Vulpecula'}

# spectral class -> temperature range (K), interpolated by subclass digit
TEMP = {'O': (35000, 30000), 'B': (25000, 11000), 'A': (9800, 7500),
        'F': (7200, 6100), 'G': (5900, 5300), 'K': (5100, 3900),
        'M': (3700, 2400), 'D': (14000, 8000)}


def pick_name(r):
    if r['proper']:
        return r['proper'], True
    bf = r['bf'].strip()
    if bf:
        parts = bf.split()
        if len(parts) >= 2:
            g = GREEK.get(parts[0].rstrip('-0123456789'))
            if g:
                return f"{g} {parts[-1]}", True
        return bf, True
    if r['gl']:
        gl = r['gl'].strip()
        return (gl if gl.startswith(('GJ', 'Gl', 'NN', 'Wo')) else 'GJ ' + gl), False
    if r['hip']:
        return 'HIP ' + r['hip'], False
    if r['hd']:
        return 'HD ' + r['hd'], False
    return 'Star ' + r['id'], False


def temp_of(spect):
    if not spect or spect[0].upper() not in TEMP:
        return 5500
    hi, lo = TEMP[spect[0].upper()]
    sub = 5
    for ch in spect[1:3]:
        if ch.isdigit():
            sub = int(ch)
            break
    return int(hi - sub * (hi - lo) / 10.0)


def main():
    path = next((p for p in CSV_CANDIDATES if os.path.exists(p)), None)
    if not path:
        path = CSV_CANDIDATES[0]
        print('downloading HYG v4.1 (34 MB)...')
        urllib.request.urlretrieve(URL, path)

    stars = []
    with open(path) as f:
        for r in csv.DictReader(f):
            if r['id'] == '0':
                continue
            try:
                dpc = float(r['dist'])
            except ValueError:
                continue
            if dpc <= 0 or dpc >= 90000:
                continue
            dly = dpc * LY_PER_PC
            if dly > MAX_LY:
                continue
            xe, ye, ze = float(r['x']), float(r['y']), float(r['z'])
            x = (R[0][0]*xe + R[0][1]*ye + R[0][2]*ze) * LY_PER_PC
            y = (R[1][0]*xe + R[1][1]*ye + R[1][2]*ze) * LY_PER_PC
            z = (R[2][0]*xe + R[2][1]*ye + R[2][2]*ze) * LY_PER_PC
            name, named = pick_name(r)
            absmag = float(r['absmag']) if r['absmag'] else 10.0
            spect = r['spect'].strip()
            cls = spect[0].upper() if spect and spect[0].upper() in 'OBAFGKMD' else '?'
            sub = 5
            for ch in spect[1:3]:
                if ch.isdigit():
                    sub = int(ch)
                    break
            stars.append({
                'name': name, 'named': named, 'x': x, 'y': y, 'z': z,
                'dly': dly, 'mag': float(r['mag']) if r['mag'] else 15.0,
                'absmag': absmag, 'cls': cls, 'sub': sub,
                'temp': temp_of(spect),
                'con': CON_FULL.get(r['con'].strip(), ''),
                'base': r['base'].strip() or r['id'],
                'lum': float(r['lum']) if r['lum'] else 0.0,
                'var': 1 if r['var'].strip() else 0,
            })

    by_base = {}
    for s in stars:
        k = s['base']
        if k not in by_base or s['mag'] < by_base[k]['mag']:
            by_base[k] = s
    merged = []
    for s in sorted(by_base.values(), key=lambda s: s['dly']):
        if any(abs(s['x']-t['x']) < 0.15 and abs(s['y']-t['y']) < 0.15 and
               abs(s['z']-t['z']) < 0.15 for t in merged):
            continue
        merged.append(s)

    cat = [s for s in merged if s['dly'] <= NEAR_KEEP_LY or
           s['absmag'] <= DIM_CAP_ABSMAG or s['named']]

    out = os.path.join(ROOT, 'src', 'stars.js')
    with open(out, 'w') as f:
        f.write('// Generated by tools/make_stars_js.py — do not edit.\n')
        f.write('// [name, x, y, z (ly, galactic), class, absmag, temp K, '
                'constellation, named, lum (Sol=1), apparent mag, variable]\n')
        f.write('export const STARS = [\n')
        for s in cat:
            cls = s['cls'] + (str(s['sub']) if s['cls'] != '?' else '')
            f.write('[%s,%.2f,%.2f,%.2f,%s,%.1f,%d,%s,%d,%s,%.1f,%d],\n' % (
                json.dumps(s['name']),
                s['x'], s['y'], s['z'],
                json.dumps(cls),
                s['absmag'], s['temp'],
                json.dumps(s['con']),
                1 if s['named'] else 0,
                '%.3g' % s['lum'], s['mag'], s['var']))
        f.write('];\n')
    print(f"wrote {out}: {len(cat)} systems, "
          f"{os.path.getsize(out)//1024} KB")


if __name__ == '__main__':
    main()
