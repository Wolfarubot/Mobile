// Puts the Text editor's saved edits into the game: rewrites src/core/textOverrides.ts from the editor's drafts
// (a folder of <key>.json documents, as the ArtifactData tool saves them with out_dir) and the dump of the game's
// own text (tools/text/dump.mjs). An edit back to the game's own text drops the override.
//   node tools/text/apply.mjs <drafts folder> <texts.json>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, textsFile] = process.argv.slice(2);
const FILE = new URL('../../src/core/textOverrides.ts', import.meta.url);
const base = new Map(JSON.parse(readFileSync(textsFile, 'utf8')).entries.map((e) => [e.key, e.base]));
const src = readFileSync(FILE, 'utf8');
const current = JSON.parse(src.match(/TEXT_OVERRIDES: Record<string, string> = (\{[\s\S]*\});/)[1].replace(/,(\s*})/, '$1') || '{}');
let changed = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const key = f.replace(/\.json$/, '');
  if (!base.has(key)) {
    console.warn(`skipped ${key}: no such line in the game`);
    continue;
  }
  const doc = JSON.parse(readFileSync(join(dir, f), 'utf8'));
  const text = doc.data?.text ?? doc.text;
  if (typeof text !== 'string') continue;
  if (text === base.get(key)) delete current[key];
  else current[key] = text;
  changed++;
}
const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
const body = Object.keys(sorted).length ? `{\n${Object.entries(sorted).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n}` : '{}';
writeFileSync(FILE, src.replace(/TEXT_OVERRIDES: Record<string, string> = \{[\s\S]*\};/, `TEXT_OVERRIDES: Record<string, string> = ${body};`));
console.log(`${changed} edit(s) applied, ${Object.keys(sorted).length} line(s) overridden`);
