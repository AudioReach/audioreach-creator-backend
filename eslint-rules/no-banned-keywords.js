import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load banned keywords from configuration file
let bannedKeywords = [];
try {
  const configPath = path.join(__dirname, 'banned-keywords.json');
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configContent);
  bannedKeywords = config.bannedKeywords || [];
} catch (error) {
  console.warn('Warning: Could not load banned-keywords.json:', error.message);
}

/**
 * Check if text contains any banned keywords (case-insensitive substring match)
 */
function containsBannedKeyword(text) {
  if (!text || typeof text !== 'string') return null;

  const lowerText = text.toLowerCase();

  for (const keyword of bannedKeywords) {
    const lowerKeyword = keyword.toLowerCase();
    if (lowerText.includes(lowerKeyword)) {
      return {
        keyword,
        found: text,
        index: lowerText.indexOf(lowerKeyword),
      };
    }
  }

  return null;
}

/**
 * ESLint rule to detect banned keywords in code
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow banned keywords in code, comments, and strings',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      bannedKeywordFound:
        'Banned keyword "{{keyword}}" found in {{type}}: "{{found}}". Remove or rename to avoid company-specific terms.',
    },
  },

  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * Report banned keyword violation
     */
    function reportViolation(node, type, text, keyword) {
      context.report({
        node,
        messageId: 'bannedKeywordFound',
        data: {
          keyword,
          type,
          found: text,
        },
      });
    }

    /**
     * Check identifier names (variables, functions, classes, properties)
     */
    function checkIdentifier(node) {
      const result = containsBannedKeyword(node.name);
      if (result) {
        reportViolation(node, 'identifier', result.found, result.keyword);
      }
    }

    /**
     * Check string literals and template literals
     */
    function checkStringContent(node, content) {
      const result = containsBannedKeyword(content);
      if (result) {
        const type =
          node.type === 'TemplateLiteral'
            ? 'template literal'
            : 'string literal';
        reportViolation(node, type, result.found, result.keyword);
      }
    }

    /**
     * Check comments
     */
    function checkComments() {
      const comments = sourceCode.getAllComments();

      for (const comment of comments) {
        const result = containsBannedKeyword(comment.value);
        if (result) {
          context.report({
            loc: comment.loc,
            messageId: 'bannedKeywordFound',
            data: {
              keyword: result.keyword,
              type: 'comment',
              found: comment.value.trim(),
            },
          });
        }
      }
    }

    return {
      // Check all identifiers (variables, functions, classes, properties, etc.)
      Identifier: checkIdentifier,

      // Check string literals
      Literal(node) {
        if (typeof node.value === 'string') {
          checkStringContent(node, node.value);
        }
      },

      // Check template literals
      TemplateLiteral(node) {
        // Check template literal content
        for (const quasi of node.quasis) {
          checkStringContent(node, quasi.value.raw);
        }
      },

      // Check JSX attribute values and text
      JSXText(node) {
        checkStringContent(node, node.value);
      },

      JSXExpressionContainer(node) {
        if (
          node.expression.type === 'Literal' &&
          typeof node.expression.value === 'string'
        ) {
          checkStringContent(node, node.expression.value);
        }
      },

      // Check comments at the end of processing
      'Program:exit': checkComments,
    };
  },
};
