/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const minimatch = require('minimatch');

/**
 * ESLint rule to enforce that every exported handler class in a *.handler.ts
 * file explicitly declares `implements CommandHandler` or `implements QueryHandler`.
 *
 * Structural typing alone silently satisfies the interface — this rule makes
 * the contract visible in the AST so that companion rules (e.g.
 * no-query-services-in-command-handler) can reliably detect violations.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require handler classes to explicitly declare implements CommandHandler or QueryHandler',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      missingImplements:
        "'{{className}}' must explicitly declare `implements CommandHandler` or `implements QueryHandler`.",
    },
    schema: [
      {
        type: 'object',
        properties: {
          handlerPattern: {
            type: 'string',
            default: '**/packages/core/src/application/**/*.handler.ts',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const handlerPattern =
      options.handlerPattern ||
      '**/packages/core/src/application/**/*.handler.ts';

    const filename = context.getFilename();
    if (!minimatch(filename, handlerPattern)) {
      return {};
    }

    return {
      ClassDeclaration(node) {
        if (!node.id) return;

        const hasHandleMethod = node.body.body.some(
          member =>
            member.type === 'MethodDefinition' &&
            member.key.type === 'Identifier' &&
            member.key.name === 'handle',
        );
        if (!hasHandleMethod) return;

        const implementsHandler =
          node.implements &&
          node.implements.some(impl => {
            const name =
              impl.expression.type === 'Identifier'
                ? impl.expression.name
                : null;
            return name === 'CommandHandler' || name === 'QueryHandler';
          });

        if (!implementsHandler) {
          context.report({
            node: node.id,
            messageId: 'missingImplements',
            data: {className: node.id.name},
          });
        }
      },
    };
  },
};
