import { describe, expect, it } from 'vitest';
import { decodeSaveCode, encodeSaveCode } from '../src/core/saveCode';
import { newGame, serialize } from '../src/core/state';

describe('save codes (Settings → Dev)', () => {
  it('a code holds the exact save, and comes back from it; anything else is not a code', async () => {
    const s = newGame(1000);
    s.gold = 123456789;
    s.settings.name = '8675309';
    s.main.trains = 77;
    const code = await encodeSaveCode(s);
    expect(code.startsWith('PH1.')).toBe(true);
    expect(code).toMatch(/^PH1\.[A-Za-z0-9_-]+$/);
    // Smaller than the save itself.
    expect(code.length).toBeLessThan(serialize(s).length);
    const back = await decodeSaveCode(`  ${code.slice(0, 40)}\n${code.slice(40)}  `, s.lastSeen);
    expect(back && JSON.parse(serialize(back))).toEqual(JSON.parse(serialize(s)));
    expect(await decodeSaveCode('hello')).toBeNull();
    expect(await decodeSaveCode('PH1.notacode')).toBeNull();
    expect(await decodeSaveCode(code.slice(0, code.length - 30))).toBeNull();
  });
});
