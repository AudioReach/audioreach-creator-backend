/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * ESLint rule to disallow ambiguous identifier field names in production source.
 *
 * Fields referencing identifiers must use either `xxxSystemId` (auto-generated
 * primary key) or `xxxNaturalId` (domain/ACDB identifier). Bare `xxxId` or
 * bare `id` is ambiguous and must be renamed or explicitly exempted.
 */
export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow ambiguous xxxId or bare id fields in production source; use xxxSystemId or xxxNaturalId',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      ambiguousId:
        "Property '{{name}}' uses ambiguous 'Id' suffix. " +
        "Rename to '{{name}}SystemId' or '{{name}}NaturalId', or add to exemptFields if intentional.",
      bareId:
        "Property 'id' is ambiguous — use a descriptive name like 'naturalId', 'systemId', or 'xxxNaturalId'.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          exemptFields: {
            type: 'array',
            items: {type: 'string'},
            default: [],
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const opts = context.options[0] || {};
    const exempt = new Set(opts.exemptFields || []);

    function isInsideZodMeta(keyNode) {
      // keyNode → Property.key → Property → ObjectExpression → CallExpression(.meta)
      const prop = keyNode.parent; // Property node
      const obj = prop?.parent; // ObjectExpression
      const call = obj?.parent; // CallExpression
      return (
        call?.type === 'CallExpression' &&
        call.callee?.type === 'MemberExpression' &&
        call.callee.property?.name === 'meta'
      );
    }

    function checkName(name, node) {
      if (!name) return;
      // Flag bare 'id'
      if (name === 'id') {
        if (exempt.has('id')) return;
        // Skip 'id' inside Zod .meta({id: '...'}) calls — these are schema registry names
        if (isInsideZodMeta(node)) return;
        context.report({node, messageId: 'bareId'});
        return;
      }
      if (!name.endsWith('Id')) return;
      // Allow established suffix patterns
      if (name.endsWith('SystemId') || name.endsWith('NaturalId')) return;
      // Allow bare 'systemId' and 'naturalId' (refer to the current entity's own ID)
      if (name === 'systemId' || name === 'naturalId') return;
      if (exempt.has(name)) return;
      context.report({node, messageId: 'ambiguousId', data: {name}});
    }

    function getKeyName(key, computed) {
      if (computed) return null;
      if (key.type === 'Identifier') return key.name;
      if (key.type === 'Literal') return String(key.value);
      return null;
    }

    function getParameterPropertyName(parameter) {
      const key =
        parameter.type === 'AssignmentPattern' ? parameter.left : parameter;
      return getKeyName(key, false);
    }

    return {
      Property(node) {
        checkName(getKeyName(node.key, node.computed), node.key);
      },
      PropertyDefinition(node) {
        checkName(getKeyName(node.key, node.computed), node.key);
      },
      TSPropertySignature(node) {
        checkName(getKeyName(node.key, node.computed), node.key);
      },
      TSParameterProperty(node) {
        const parameter = node.parameter;
        checkName(getParameterPropertyName(parameter), parameter);
      },
    };
  },
};
