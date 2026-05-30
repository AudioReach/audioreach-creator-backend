/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const minimatch = require('minimatch');

/**
 * ESLint rule to prevent manual HTTP status code logic in controllers.
 * Only success codes (200, 201, 204, 207) are allowed.
 * Error responses should use HTTP exceptions instead.
 *
 * @fileoverview Prevent manual HTTP status code logic in controllers
 * @author AudioReach Team
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent manual HTTP status code logic in controllers',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      manualStatusCode:
        'Avoid manual status code logic in controllers. Use HTTP exceptions instead. ' +
        'For error responses, throw exceptions like NotFoundException, BadRequestException, etc. ' +
        'Only success codes (200, 201, 204, 207) are allowed.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          allowedSuccessCodes: {
            type: 'array',
            items: {type: 'number'},
            default: [200, 201, 204, 207],
          },
          controllerPattern: {
            type: 'string',
            default: '**/packages/api/src/presentation/**/*.ts',
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const allowedCodes = options.allowedSuccessCodes || [200, 201, 204, 207];
    const controllerPattern =
      options.controllerPattern || '**/packages/api/src/presentation/**/*.ts';

    // Check if current file is a controller
    const filename = context.getFilename();
    if (!minimatch(filename, controllerPattern)) {
      return {}; // Skip non-controller files
    }

    return {
      // Check res.status(code) calls
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.name === 'status' &&
          node.callee.object.name === 'res' &&
          node.arguments.length > 0
        ) {
          const statusArg = node.arguments[0];

          // Check if it's a literal number
          if (
            statusArg.type === 'Literal' &&
            typeof statusArg.value === 'number'
          ) {
            const statusCode = statusArg.value;

            // Report error if not in allowed success codes
            if (!allowedCodes.includes(statusCode)) {
              context.report({
                node: statusArg,
                messageId: 'manualStatusCode',
              });
            }
          }
        }
      },
    };
  },
};
