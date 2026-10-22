import { parseMessage, type MessageNode } from './format_message';

const ACCENTS: Record<string, string> = {
  a: 'à', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ğ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ľ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Â', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ĺ', M: 'Ṁ',
  N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

const accent = (text: string) => text.replace(/[A-Za-z]/g, (c) => ACCENTS[c] ?? c);

// Serialises back to message syntax so `{name}` and plural structure survive:
// only literal text is accented, argument names and selectors are untouched.
function render(nodes: MessageNode[]): string {
  return nodes
    .map((node) => {
      if (typeof node === 'string') return accent(node);
      if (node.type === 'hash') return '#';
      if (node.type === 'arg') return `{${node.name}}`;
      const branches = Object.entries(node.cases)
        .map(([selector, branch]) => `${selector} {${render(branch)}}`)
        .join(' ');
      return `{${node.name}, plural, ${branches}}`;
    })
    .join('');
}

/**
 * Pseudo-locale text: accented letters, about 40 percent longer, wrapped in
 * brackets. Used by the layout and screenshot matrix to expose clipped text,
 * and to expose hardcoded strings (they stay unaccented). Not a shipped
 * locale: it is never in the registry.
 */
export function pseudoLocalize(source: string): string {
  const body = render(parseMessage(source));
  const target = Math.ceil(source.length * 1.4);
  const base = body.length + 2;
  const pad = base < target ? ` ${'~'.repeat(Math.max(target - base - 1, 0))}` : '';
  return `[${body}${pad}]`;
}
