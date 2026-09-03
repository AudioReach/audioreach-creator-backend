/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const minimatch = require('minimatch');

/**
 * ESLint rule to prevent command handlers from injecting QueryServices.
 * Command handlers should use repository read methods (e.g. projectExists())
 * for precondition checks. Post-fetch should be done in the controller via queryBus.
 *
 * @fileoverview Prevent command handlers from depending on QueryServices
 * @author AudioReach Team
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent command handlers from injecting QueryServices; use repository read methods instead',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      noQueryServicesInCommandHandler:
        'Command handlers must not inject QueryServices. ' +
        'Use repository read methods (e.g. projectExists()) for precondition checks, ' +
        'and move post-fetch to the controller via queryBus.',
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

    let insideCommandHandlerClass = false;

    return {
      ClassDeclaration(node) {
        if (!node.implements) {
          insideCommandHandlerClass = false;
          return;
        }
        insideCommandHandlerClass = node.implements.some(impl => {
          const expr = impl.expression;
          return expr.type === 'Identifier' && expr.name === 'CommandHandler';
        });
      },
      'ClassDeclaration:exit'() {
        insideCommandHandlerClass = false;
      },
      TSTypeReference(node) {
        if (!insideCommandHandlerClass) return;
        const name =
          node.typeName.type === 'Identifier' ? node.typeName.name : null;
        if (name === 'QueryServices') {
          context.report({
            node,
            messageId: 'noQueryServicesInCommandHandler',
          });
        }
      },
    };
  },
};
