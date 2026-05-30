/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const minimatch = require('minimatch');

/**
 * ESLint rule to prevent try-catch blocks in controllers.
 * Exceptions should bubble up to the global exception handler.
 *
 * @fileoverview Prevent try-catch blocks in controllers
 * @author AudioReach Team
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent try-catch blocks in controllers',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      controllerTryCatch:
        'Avoid try-catch in controllers. Let exceptions bubble to global handler. ' +
        'Controllers should not catch exceptions - they should let them propagate ' +
        'to the global exception handler middleware.',
    },
    schema: [
      {
        type: 'object',
        properties: {
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
    const controllerPattern =
      options.controllerPattern || '**/packages/api/src/presentation/**/*.ts';

    // Check if current file is a controller
    const filename = context.getFilename();
    if (!minimatch(filename, controllerPattern)) {
      return {}; // Skip non-controller files
    }

    // Track if we're inside a controller class
    let insideControllerClass = false;

    return {
      ClassDeclaration(node) {
        // Check if class has @Controller decorator
        if (node.decorators) {
          insideControllerClass = node.decorators.some(
            decorator =>
              decorator.expression.type === 'CallExpression' &&
              decorator.expression.callee.name === 'Controller',
          );
        }
      },
      'ClassDeclaration:exit'() {
        insideControllerClass = false;
      },
      TryStatement(node) {
        // Only report if we're inside a controller class
        if (insideControllerClass) {
          context.report({
            node,
            messageId: 'controllerTryCatch',
          });
        }
      },
    };
  },
};
