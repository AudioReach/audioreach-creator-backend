/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * ESLint rule to prevent 'example' or 'examples' properties in @ApiProperty decorators
 * Examples should be defined separately in Swagger configuration if needed
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Disallow 'example' or 'examples' properties in @ApiProperty decorators",
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noExampleInApiProperty:
        "ApiProperty decorator should not contain '{{property}}' property. Define examples separately in Swagger configuration if needed.",
    },
  },

  create(context) {
    /**
     * Check if a node is an @ApiProperty decorator
     */
    function isApiPropertyDecorator(node) {
      if (node.type !== 'Decorator') return false;

      // Check if the decorator expression is a CallExpression with name 'ApiProperty'
      const expression = node.expression;
      if (expression.type === 'CallExpression') {
        const callee = expression.callee;
        return callee.type === 'Identifier' && callee.name === 'ApiProperty';
      }

      return false;
    }

    /**
     * Check if an object expression contains 'example' or 'examples' property
     */
    function checkObjectForExampleProperties(objectExpression, decoratorNode) {
      if (objectExpression.type !== 'ObjectExpression') return;

      for (const property of objectExpression.properties) {
        // Handle both Property and SpreadElement
        if (property.type === 'Property') {
          const keyName =
            property.key.type === 'Identifier'
              ? property.key.name
              : property.key.type === 'Literal'
                ? property.key.value
                : null;

          if (keyName === 'example' || keyName === 'examples') {
            context.report({
              node: property,
              messageId: 'noExampleInApiProperty',
              data: {
                property: keyName,
              },
            });
          }
        }
      }
    }

    return {
      Decorator(node) {
        // Only check @ApiProperty decorators
        if (!isApiPropertyDecorator(node)) return;

        const expression = node.expression;

        // Check if the decorator has arguments
        if (
          expression.type === 'CallExpression' &&
          expression.arguments.length > 0
        ) {
          const firstArg = expression.arguments[0];

          // Check if the first argument is an object expression
          if (firstArg.type === 'ObjectExpression') {
            checkObjectForExampleProperties(firstArg, node);
          }
        }
      },
    };
  },
};
