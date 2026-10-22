// Static check that code and catalogs agree: every key the code asks for
// exists, and every key in the catalog is asked for somewhere. It is a regex
// pass, not a parser, so the supported shapes are deliberately narrow:
//
//   const t = useTranslations('ns');     client component
//   const t = await getTranslations('ns'); server component
//   t('key'), t.rich('key', ...), t.has('key')
//
// Dynamic keys (template literals) are rejected because nothing could follow
// them. Models that pick a message by id keep the key as a string literal
// (`labelKey: 'features.inbox.label'`); a literal with two or more segments
// counts as a use of every catalog key it matches. One-segment keys must be
// reached through a bound call, so a stray word cannot keep a key alive.

export interface SourceFile {
  path: string;
  source: string;
}

export interface KeyUsageReport {
  /** `namespace.key` strings the code requests that no catalog entry answers. */
  missing: string[];
  /** Catalog keys no code references. */
  unused: string[];
  /** Files that build a key from a template literal. */
  dynamic: string[];
}

// Only whole-line comments and ` // ` trailing comments are removed: a blanket
// `//` strip would cut string literals such as 'https://...'.
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/\s.*$/gm, '');
}

const BINDING =
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*['"]([\w.]+)['"]\s*\)/g;
const LITERAL_KEY = /(['"`])([a-z0-9_]+(?:\.[a-z0-9_]+)+)\1/g;

export function analyzeKeyUsage(catalog: Record<string, string>, files: SourceFile[]): KeyUsageReport {
  const used = new Set<string>();
  const requested = new Set<string>();
  const literals = new Set<string>();
  const dynamic: string[] = [];

  for (const file of files) {
    const source = stripComments(file.source);

    const bindings = new Map<string, string[]>();
    for (const match of source.matchAll(BINDING)) {
      const [, variable, namespace] = match as unknown as [string, string, string];
      bindings.set(variable, [...(bindings.get(variable) ?? []), namespace]);
    }

    for (const [variable, namespaces] of bindings) {
      const call = new RegExp(`\\b${variable}(?:\\.(?:rich|has|raw))?\\(\\s*(['"])([^'"]+)\\1`, 'g');
      for (const match of source.matchAll(call)) {
        const key = match[2]!;
        const paths = namespaces.map((ns) => `${ns}.${key}`);
        const hit = paths.find((p) => p in catalog);
        if (hit) used.add(hit);
        else requested.add(paths[0]!);
      }
      const template = new RegExp(`\\b${variable}(?:\\.\\w+)?\\(\\s*\`[^\`]*\\$\\{`);
      if (template.test(source)) dynamic.push(file.path);
    }

    for (const match of source.matchAll(LITERAL_KEY)) literals.add(match[2]!);
  }

  for (const key of Object.keys(catalog)) {
    if (used.has(key)) continue;
    // `ns.rest` literal, or a multi-segment `rest` literal held by a model file.
    const rest = key.slice(key.indexOf('.') + 1);
    if (literals.has(key) || (rest.includes('.') && literals.has(rest))) used.add(key);
  }

  return {
    missing: [...requested].sort(),
    unused: Object.keys(catalog)
      .filter((key) => !used.has(key))
      .sort(),
    dynamic: [...new Set(dynamic)].sort(),
  };
}
