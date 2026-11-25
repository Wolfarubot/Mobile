"""Copies the Journal editor's entries (the Artifact's "entries" collection, exported as one JSON file per document,
e.g. by ArtifactData's list with out_dir) into src/core/journal.ts's JOURNAL, in the editor's order. Entries with no
text are left out. python3 tools/journal/sync.py <export dir>/entries"""
import glob, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TS = os.path.join(HERE, '..', '..', 'src', 'core', 'journal.ts')


def lit(v):
    """A TS string: single quotes unless the text has one."""
    if "'" in v:
        return json.dumps(v, ensure_ascii=False)
    return "'" + json.dumps(v, ensure_ascii=False)[1:-1].replace('\\"', '"') + "'"


def unlock(u):
    parts = [f"kind: '{u['kind']}'"] + [f"{k}: {lit(v) if isinstance(v, str) else json.dumps(v)}" for k, v in u.items() if k != 'kind']
    return '{ ' + ', '.join(parts) + ' }'


docs = []
for f in glob.glob(os.path.join(sys.argv[1], '*.json')):
    d = json.load(open(f))
    d = d.get('data', d)
    if d.get('body', '').strip():
        docs.append((d.get('order', 999), os.path.basename(f)[:-5], d))
docs.sort(key=lambda x: x[0])
out = ['export const JOURNAL: JournalEntry[] = [']
for _, eid, d in docs:
    out += ['  {', f'    id: {lit(eid)},', f"    title: {lit(d['title'])},", f"    icon: {lit(d.get('icon') or '📜')},",
            f"    body: {lit(d['body'])},", f"    unlock: {unlock(d.get('unlock') or {'kind': 'start'})},", '  },']
out.append('];\n')
s = open(TS).read()
open(TS, 'w').write(s[:s.index('export const JOURNAL')] + '\n'.join(out))
print(len(docs), 'entries')
