import sys, json, glob, os, re
import xml.etree.ElementTree as ET
res, out = sys.argv[1], sys.argv[2]
def load(d):
    m = {}
    for f in sorted(glob.glob(os.path.join(res, d, 'ui*.xml'))):
        for e in ET.parse(f).getroot().iter('string'):
            v = ''.join(e.itertext())
            if len(v) >= 2 and v[0] == '"' and v[-1] == '"': v = v[1:-1]
            v = v.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').replace('\\@', '@').replace('\\?', '?')
            m[e.get('name')] = v
    return m
en, hi = load('values'), load('values-hi')
pairs = {en[k]: hi[k] for k in en if k in hi and hi[k] and hi[k] != en[k]}
json.dump(dict(sorted(pairs.items())), open(out, 'w'), ensure_ascii=False, indent=0)
print(len(en), 'english,', len(hi), 'hindi,', len(pairs), 'pairs')
