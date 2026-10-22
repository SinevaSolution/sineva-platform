// Flags user-visible literal text in UI code (FR-UX-34). Every string a
// customer reads is a message key, so a letter-bearing literal in JSX text, a
// copy-bearing attribute, a toast call or exported page metadata is an error.
//
// Heuristic by design: it cannot see strings assembled elsewhere (a model file
// returning a label) or text passed through a custom prop it does not know.
// The key-usage test and review cover those; this rule stops the common leak.
// A line that really is not copy (a provider name, say) opts out with
// `eslint-disable-next-line sineva/no-hardcoded-strings -- reason`.

const COPY_ATTRIBUTES = new Set([
  'title',
  'subtitle',
  'label',
  'hint',
  'description',
  'blurb',
  'caption',
  'heading',
  'placeholder',
  'alt',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
]);

const TOAST_METHODS = new Set(['error', 'success', 'info', 'warning', 'message', 'loading']);

// The wordmark is a brand, not copy. `%s` is the Next.js title template slot.
function carriesCopy(text) {
  const stripped = text.replace(/%s/g, '').replace(/sineva/gi, '');
  return /\p{L}/u.test(stripped);
}

function staticString(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map((q) => q.value.cooked ?? '').join('');
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow hardcoded user-facing strings; use message keys.' },
    schema: [],
    messages: {
      jsxText: 'Hardcoded UI text. Use a message key from messages/en.json and messages/id.json.',
      jsxAttribute: 'Hardcoded text in a user-facing attribute. Use a message key.',
      toastLiteral: 'Hardcoded toast text. Use a message key.',
      metadataLiteral: 'Hardcoded page metadata text. Use generateMetadata with a message key.',
    },
  },
  create(context) {
    function checkMetadataObject(node) {
      for (const property of node.properties) {
        if (property.type !== 'Property') continue;
        const text = staticString(property.value);
        if (text !== null && carriesCopy(text)) {
          context.report({ node: property.value, messageId: 'metadataLiteral' });
        } else if (property.value.type === 'ObjectExpression') {
          checkMetadataObject(property.value);
        }
      }
    }

    return {
      JSXText(node) {
        if (carriesCopy(node.value)) context.report({ node, messageId: 'jsxText' });
      },
      JSXExpressionContainer(node) {
        const parent = node.parent;
        if (parent.type !== 'JSXElement' && parent.type !== 'JSXFragment') return;
        const text = staticString(node.expression);
        if (text !== null && carriesCopy(text)) context.report({ node, messageId: 'jsxText' });
      },
      JSXAttribute(node) {
        if (node.name.type !== 'JSXIdentifier' || !COPY_ATTRIBUTES.has(node.name.name)) return;
        const value = node.value;
        const text = value?.type === 'JSXExpressionContainer' ? staticString(value.expression) : staticString(value);
        if (text !== null && carriesCopy(text)) context.report({ node, messageId: 'jsxAttribute' });
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type === 'MemberExpression' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'toast' &&
          callee.property.type === 'Identifier' &&
          TOAST_METHODS.has(callee.property.name)
        ) {
          const text = staticString(node.arguments[0]);
          if (text !== null && carriesCopy(text)) context.report({ node: node.arguments[0], messageId: 'toastLiteral' });
        }
      },
      ExportNamedDeclaration(node) {
        const declaration = node.declaration;
        if (declaration?.type !== 'VariableDeclaration') return;
        for (const declarator of declaration.declarations) {
          if (declarator.id.type === 'Identifier' && declarator.id.name === 'metadata' && declarator.init) {
            const init = declarator.init.type === 'TSSatisfiesExpression' ? declarator.init.expression : declarator.init;
            if (init.type === 'ObjectExpression') checkMetadataObject(init);
          }
        }
      },
    };
  },
};

export default rule;
