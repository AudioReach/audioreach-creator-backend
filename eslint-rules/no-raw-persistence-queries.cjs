/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * ESLint rule to prevent raw SQL queries in the persistence layer.
 *
 * @fileoverview Prevent raw manager.query() calls in the persistence layer
 * @author AudioReach Team
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent raw SQL queries in the persistence layer; use BatchInserter or manager.insert() instead',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noRawPersistenceQuery:
        'Avoid raw SQL queries in the persistence layer. Use BatchInserter or manager.insert() instead. ' +
        'If raw SQL is genuinely needed (e.g. INSERT OR IGNORE), suppress with eslint-disable-next-line.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          persistencePattern: {
            type: 'string',
            default: 'persistence',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const persistenceSegment = options.persistencePattern || 'persistence';

    const filename = context.getFilename();
    if (!filename.includes(persistenceSegment)) {
      return {};
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'query'
        ) {
          context.report({
            node: node.callee.property,
            messageId: 'noRawPersistenceQuery',
          });
        }
      },
    };
  },
};
