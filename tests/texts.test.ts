import { describe, expect, it } from 'vitest';
import { editableData, fromHtml, registerText, TEXT_REGISTRY, tx, txp, txt } from '../src/core/textRegistry';
import { AREAS, EVENTS } from '../src/core/balance';

describe('Text table', () => {
  it('fills placeholders, plurals and markup', () => {
    registerText({ key: 't.one', group: 'T', section: 'T', label: 'L', base: 'Salvaged **{n}** piece{s} in {area}' });
    expect(tx('t.one', { n: 1, area: 'the Woods' })).toBe('Salvaged <b>1</b> piece in the Woods');
    expect(txt('t.one', { n: 3, area: 'X' })).toBe('Salvaged 3 pieces in X');
    registerText({ key: 't.two', group: 'T', section: 'T', label: 'L', base: 'First\nline\n\nSecond {missing}' });
    expect(txp('t.two')).toBe('<p>First<br>line</p><p>Second {missing}</p>');
  });

  it('turns old HTML into the editor markup', () => {
    expect(fromHtml('<p>Tap <b>fast</b>.</p><p>Two<br>lines</p>')).toBe('Tap **fast**.\n\nTwo\nlines');
  });

  it("registers the data's names in place and writes edits onto the objects", () => {
    expect(TEXT_REGISTRY.get('area.forest.name')?.base).toBe(AREAS[0].name);
    expect(TEXT_REGISTRY.get(`event.${EVENTS[0].id}.blurb`)?.text).toBe(EVENTS[0].blurb);
    const obj = { name: 'Old', deep: { names: ['a', 'b'] } };
    editableData('T', 'x', [['o', obj, 'S']], { name: 'Name', 'deep.names.1': 'Second', missing: 'None' });
    expect(TEXT_REGISTRY.has('x.o.name') && TEXT_REGISTRY.has('x.o.deep.names.1') && !TEXT_REGISTRY.has('x.o.missing')).toBe(true);
  });
});
