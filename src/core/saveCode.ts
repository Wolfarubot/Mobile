import { deserialize, serialize, type GameState } from './state';

/**
 * Save codes (Settings → Dev): a whole save as one line of text, to copy off one device and load on another (or
 * keep, to come back to the exact same game). "PH1." then the save's JSON deflated and base64url-encoded; where
 * the browser can't compress, "PH0." then the JSON itself, base64url-encoded.
 */
const COMPRESSED = 'PH1.';
const PLAIN = 'PH0.';

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64 = (text: string): Uint8Array => {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};

/** Runs bytes through a (de)compression stream. */
async function through(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** The save as a code. */
export async function encodeSaveCode(state: GameState): Promise<string> {
  const json = new TextEncoder().encode(serialize(state));
  if (typeof CompressionStream === 'undefined') return PLAIN + toB64(json);
  return COMPRESSED + toB64(await through(json, new CompressionStream('deflate-raw')));
}

/** The save a code holds, or null if it isn't one (mistyped, cut short, or not a save). */
export async function decodeSaveCode(code: string, now = Date.now()): Promise<GameState | null> {
  const text = code.replace(/\s+/g, '');
  try {
    let json: string;
    if (text.startsWith(COMPRESSED)) {
      if (typeof DecompressionStream === 'undefined') return null;
      json = new TextDecoder().decode(await through(fromB64(text.slice(COMPRESSED.length)), new DecompressionStream('deflate-raw')));
    } else if (text.startsWith(PLAIN)) json = new TextDecoder().decode(fromB64(text.slice(PLAIN.length)));
    else return null;
    return deserialize(json, now);
  } catch {
    return null;
  }
}
