import { TEXT_OVERRIDES } from './textOverrides';

/**
 * Every line of text the Text editor can change that no other editor covers: the popups, toasts, tutorials and
 * tooltips (registered by src/ui/texts.ts), and the names and descriptions in the game's data (areas, monsters,
 * Hunters, materials, events...). Each has a key; an edit from the editor (TEXT_OVERRIDES) replaces its text.
 *
 * Written text (popups, toasts, tutorials) is marked up lightly: **bold**, a blank line starts a new paragraph, and
 * {name} is filled in by the game (each line lists the ones it gets; {s} makes a plural: "piece{s}"). Names and descriptions in the data are plain.
 */
export interface TextEntry {
  key: string;
  /** The editor's sidebar group ("Popups", "Monsters"), the page it's on, and the field's label there. */
  group: string;
  section: string;
  label: string;
  /** The game's own text, and the text in use (the edit, if there is one). */
  base: string;
  text: string;
  /** Placeholders it's given: name → what it is. */
  vars?: Record<string, string>;
  /** A note on where it shows. */
  note?: string;
  /** Plain: shown as is (names, data); otherwise marked up. */
  plain?: boolean;
}

export const TEXT_REGISTRY = new Map<string, TextEntry>();

const live = (key: string, base: string): string => TEXT_OVERRIDES[key] ?? base;

/** Registers a line and returns the text in use. */
export function registerText(e: Omit<TextEntry, 'text'>): string {
  const text = live(e.key, e.base);
  TEXT_REGISTRY.set(e.key, { ...e, text });
  return text;
}

/**
 * Makes some string fields of a list of data objects editable: each `prefix.id.field` key is registered and its
 * edit, if any, written onto the object. `fields` maps a field name to its label; a field may be a path into an
 * array ("names.0"). Objects with a field missing (or not a string) skip it.
 */
export function editableData<T extends object>(group: string, prefix: string, entries: Array<[string, T, string]>, fields: Record<string, string>): void {
  for (const [id, obj, section] of entries) {
    for (const [path, label] of Object.entries(fields)) {
      const parts = path.split('.');
      let holder: Record<string, unknown> = obj as Record<string, unknown>;
      for (const p of parts.slice(0, -1)) holder = (holder?.[p] ?? null) as Record<string, unknown>;
      const last = parts[parts.length - 1];
      const base = holder?.[last];
      if (typeof base !== 'string') continue;
      holder[last] = registerText({ key: `${prefix}.${id}.${path}`, group, section, label, base, plain: true });
    }
  }
}

/** A registered line with its placeholders filled in and its markup turned to HTML (inline: no paragraphs). */
export function tx(key: string, vars: Record<string, string | number> = {}): string {
  const e = TEXT_REGISTRY.get(key);
  const text = e ? e.text : key;
  return markup(fill(text, vars), false);
}

/** As tx, as paragraphs: a blank line starts a new <p>. */
export function txp(key: string, vars: Record<string, string | number> = {}): string {
  const e = TEXT_REGISTRY.get(key);
  const text = e ? e.text : key;
  return markup(fill(text, vars), true);
}

/** As tx, with no markup at all, for plain text (toasts, tooltips, labels): only the placeholders filled in. */
export function txt(key: string, vars: Record<string, string | number> = {}): string {
  const e = TEXT_REGISTRY.get(key);
  return fill(e ? e.text : key, vars).replace(/\*\*(.+?)\*\*/g, '$1');
}

/** Fills in {placeholders}. {s} is "s" unless {n} is 1 (for "piece{s}"), when the game doesn't give its own. */
function fill(text: string, vars: Record<string, string | number>): string {
  if ('n' in vars && !('s' in vars)) vars = { ...vars, s: Number(String(vars.n).replace(/,/g, '')) === 1 ? '' : 's' };
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

function markup(text: string, paras: boolean): string {
  const inline = (s: string) => s.replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>').replace(/\n/g, '<br>');
  if (!paras) return inline(text.trim());
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${inline(p)}</p>`)
    .join('');
}

/** Old HTML text (<p>, <b>, <br>) as the editor's markup, for text written before the editor. */
export function fromHtml(html: string): string {
  return html
    .replace(/<\/p>\s*<p[^>]*>/g, '\n\n')
    .replace(/<\/?p[^>]*>/g, '')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<\/?b>/g, '**')
    .trim();
}
