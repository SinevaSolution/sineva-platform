// Minimal CSS reader for token files. It extracts only custom property
// declarations (`--name: value`), grouped by the full selector and at-rule
// path they sit in. A real CSS parser would be a new dependency for a file
// shape we control; the token CSS is plain declarations in nested blocks.
//
// Why the block path is part of the identity and not a flat `--name: value`
// scan: the same property is legitimately declared several times (`--gutter`
// per media query, `--accent-500` per product).

/** Strip block comments. Comments are stripped before parsing, never after. */
export function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * @param {string} css
 * @returns {Array<{ path: string, declarations: Record<string, string> }>}
 *   one entry per block that holds at least one custom property, in source order
 */
export function readCustomProperties(css) {
  const source = stripComments(css);
  const blocks = [];
  const frames = [{ path: '', text: '' }];
  let quote = null;
  let paren = 0;

  const flush = (frame) => {
    const text = frame.text.trim();
    frame.text = '';
    const match = /^(--[A-Za-z0-9_-]+)\s*:\s*([\s\S]+)$/.exec(text);
    if (!match) return;
    let block = blocks.find((b) => b.path === frame.path);
    if (!block) {
      block = { path: frame.path, declarations: {} };
      blocks.push(block);
    }
    // First declaration wins inside one block; a redeclaration that matters
    // lives in its own block (media query, theme selector).
    if (!(match[1] in block.declarations)) {
      block.declarations[match[1]] = match[2].replace(/\s+/g, ' ').trim();
    }
  };

  for (const char of source) {
    const frame = frames[frames.length - 1];
    if (quote) {
      frame.text += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      frame.text += char;
      continue;
    }
    if (char === '(') paren += 1;
    if (char === ')') paren -= 1;
    if (paren > 0 || (char === ')' && paren === 0)) {
      frame.text += char;
      continue;
    }
    if (char === ';') {
      flush(frame);
    } else if (char === '{') {
      const prelude = frame.text.replace(/\s+/g, ' ').trim();
      frame.text = '';
      const parent = frame.path;
      frames.push({ path: parent ? `${parent} > ${prelude}` : prelude, text: '' });
    } else if (char === '}') {
      flush(frame);
      frames.pop();
    } else {
      frame.text += char;
    }
  }
  return blocks;
}
