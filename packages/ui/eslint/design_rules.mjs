// Design-system lint rules shared by packages/ui and apps/web/src/client
// (FR-DS-04, FR-UX-05). ESLint 9 flat config.
//
// Why custom rules and not `no-restricted-syntax` selectors: a class list is
// one string, and the violations are substrings inside it (`bg-[#fff]`,
// `lg:dark:bg-x`, `-ml-2`). An esquery regex per pattern would need escaping
// for `[`, `/` and `\`, and could not report which class tripped. These rules
// scan every string literal and template chunk instead, so a violation is found
// wherever the class string is built (className, a cva map, a template).
//
// Allowlist: `// eslint-disable-next-line sineva-design/<rule> -- <reason>`.
// Use it for media and artwork whose geometry is physical (Sino art, scene
// blobs, chart axes). A disable without a reason is a review finding.

// Tailwind palette names. `bg-white`, `text-emerald-500` and friends skip the
// theme and so do not follow `data-theme`.
const PALETTE =
  'white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOR_UTILITY =
  'bg|text|border|ring|outline|fill|stroke|from|to|via|shadow|decoration|divide|accent|caret|placeholder';

const RAW_COLOR_CHECKS = [
  {
    // `href="#add"` is the one false positive; use the allowlist comment.
    pattern: /(?<![\w&/])#[0-9a-fA-F]{3,8}\b/,
    describe: (m) => `hex color "${m}"`,
  },
  {
    // Not `\b`: Tailwind arbitrary values join words with `_` (`shadow-[0_1px_rgba(...)]`),
    // and `_` is a word character, so there is no boundary in front of `rgba`.
    pattern: /(?<![A-Za-z])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/i,
    describe: (m) => `functional color "${m.trim()}"`,
  },
  {
    pattern: new RegExp(`(?<![\\w-])(?:${COLOR_UTILITY})-(?:${PALETTE})(?:-\\d{2,3})?(?![\\w-])`),
    describe: (m) => `Tailwind palette color "${m}"`,
  },
  {
    // Components read semantic tokens. A primitive (`--teal-700`) does not
    // swap with the theme, and an accent ramp step is read only through
    // `--accent-surface|tile|text|glow`.
    pattern: /var\(\s*--(?:teal|ink|aqua|mint|sun|red|green|amber)-\d+|var\(\s*--white\b|--accent-(?:50|100|300|500|700)\b/,
    describe: (m) => `primitive or accent ramp step "${m}"`,
  },
];

const DARK_CHECKS = [
  { pattern: /(?<![\w-])dark:/, describe: () => 'the dark: variant' },
];

const Z_CHECKS = [
  // Positive numeric and arbitrary z-index. `-z-10` (local stacking behind
  // content inside an isolated scene) is allowed.
  { pattern: /(?<![\w-])z-(?:\[|\d)/, describe: (m) => `z-index "${m}"` },
];

const PHYSICAL_CHECKS = [
  {
    pattern: /(?<![\w-])-?(?:ml|mr|pl|pr|left|right)-/,
    describe: (m) => `physical direction "${m}"`,
  },
  {
    pattern: /(?<![\w-])(?:text-(?:left|right)|float-(?:left|right)|clear-(?:left|right))(?![\w-])/,
    describe: (m) => `physical direction "${m}"`,
  },
  {
    pattern: /(?<![\w-])(?:rounded|border)-(?:l|r|tl|tr|bl|br)(?![a-z])/,
    describe: (m) => `physical direction "${m}"`,
  },
];

function isImportSource(node) {
  const parent = node.parent;
  return (
    parent &&
    (parent.type === 'ImportDeclaration' ||
      parent.type === 'ExportNamedDeclaration' ||
      parent.type === 'ExportAllDeclaration' ||
      parent.type === 'ImportExpression')
  );
}

function stringScanRule({ description, checks, hint }) {
  return {
    meta: {
      type: 'problem',
      docs: { description },
      schema: [],
      messages: { violation: '{{what}} is not allowed here. {{hint}}' },
    },
    create(context) {
      const scan = (node, text) => {
        for (const check of checks) {
          const match = check.pattern.exec(text);
          if (match) {
            context.report({
              node,
              messageId: 'violation',
              data: { what: check.describe(match[0]), hint },
            });
          }
        }
      };
      return {
        Literal(node) {
          if (typeof node.value === 'string' && !isImportSource(node)) scan(node, node.value);
        },
        TemplateElement(node) {
          scan(node, node.value.cooked ?? node.value.raw);
        },
      };
    },
  };
}

function importBanRule({ description, test, message }) {
  return {
    meta: {
      type: 'problem',
      docs: { description },
      schema: [],
      messages: { banned: message },
    },
    create(context) {
      const check = (node, source) => {
        if (typeof source === 'string' && test(source)) context.report({ node, messageId: 'banned' });
      };
      return {
        ImportDeclaration: (node) => check(node.source, node.source.value),
        ImportExpression: (node) => check(node.source, node.source.value),
      };
    },
  };
}

export const designPlugin = {
  meta: { name: 'sineva-design' },
  rules: {
    'no-raw-color': stringScanRule({
      description: 'Components use semantic tokens, never a raw color.',
      checks: RAW_COLOR_CHECKS,
      hint: 'Use a semantic token (bg-surface, text-text-secondary, bg-action-primary, bg-(--state-hover)). Raw values belong in packages/ui/src/styles/*.css.',
    }),
    'no-dark-variant': stringScanRule({
      description: 'No Tailwind dark: variant. Semantic tokens swap under data-theme.',
      checks: DARK_CHECKS,
      hint: 'Dark mode swaps semantic variables under [data-theme=dark]; a token-only class is already correct in both themes.',
    }),
    'no-arbitrary-z': stringScanRule({
      description: 'z-index comes from the --z-* tokens.',
      checks: Z_CHECKS,
      hint: 'Write z-(--z-dropdown), z-(--z-modal) and so on (packages/ui/src/styles/app-density.css).',
    }),
    'no-physical-direction': stringScanRule({
      description: 'Use logical properties (ms-, me-, ps-, pe-, start-, end-, text-start).',
      checks: PHYSICAL_CHECKS,
      hint: 'Use ms-/me-/ps-/pe-/start-/end-/text-start/border-s/rounded-s so a locale never needs a layout rewrite. For artwork with physical geometry, add an eslint-disable comment with a reason.',
    }),
    'no-motion-import': importBanRule({
      description: 'GSAP is the one motion library; CSS covers state feedback.',
      test: (source) => /^(?:motion(?:\/.*)?|framer-motion(?:\/.*)?)$/.test(source),
      message:
        'The motion and framer-motion packages are not used. State feedback is CSS; GSAP is loaded lazily where CSS cannot do the job.',
    }),
    'no-native-select': {
      meta: {
        type: 'problem',
        docs: { description: 'Dropdown fields use SNSelect or SNCombobox, never a native select.' },
        schema: [],
        messages: {
          banned:
            'A native <select> cannot follow the design or search. Use SNSelect (short lists) or SNCombobox (long lists, searchable) from @sineva/ui.',
        },
      },
      create(context) {
        return {
          JSXOpeningElement(node) {
            if (node.name.type === 'JSXIdentifier' && node.name.name === 'select') {
              context.report({ node, messageId: 'banned' });
            }
          },
        };
      },
    },
    'no-dangerous-html': {
      meta: {
        type: 'problem',
        docs: { description: 'No dangerouslySetInnerHTML.' },
        schema: [],
        messages: {
          banned:
            'dangerouslySetInnerHTML is banned. Model-written markdown goes through a sanitizer component; constant scripts go in as element text.',
        },
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name.type === 'JSXIdentifier' && node.name.name === 'dangerouslySetInnerHTML') {
              context.report({ node, messageId: 'banned' });
            }
          },
        };
      },
    },
  },
};

/**
 * Flat config block for a set of files. `files` and `ignores` are glob arrays
 * relative to the config file that calls this.
 */
export function designRulesConfig({ files, ignores = [] }) {
  return {
    files,
    ignores,
    plugins: { 'sineva-design': designPlugin },
    rules: {
      'sineva-design/no-raw-color': 'error',
      'sineva-design/no-dark-variant': 'error',
      'sineva-design/no-arbitrary-z': 'error',
      'sineva-design/no-physical-direction': 'error',
      'sineva-design/no-motion-import': 'error',
      'sineva-design/no-dangerous-html': 'error',
      'sineva-design/no-native-select': 'error',
    },
  };
}
