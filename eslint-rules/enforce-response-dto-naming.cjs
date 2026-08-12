/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const minimatch = require('minimatch');

/**
 * ESLint rule to enforce that controller methods returning ApiResult<T> use class names ending in
 * 'ResponseDto' for the unwrapped type T.
 *
 * Rule:
 *   - Applies only to *.controller.ts files in the API presentation layer.
 *   - For each HTTP method handler (@Get, @Post, @Patch, @Put, @Delete), the declared return
 *     type must unwrap to a TypeReference whose outermost name ends with 'ResponseDto'.
 *   - Generic type arguments inside T<U> are not checked — only the outermost type name.
 *   - void, never, and undefined return types are exempt.
 *
 * Unwrapping chain: Promise<T> → T, then ApiResult<T> or ApiResult<T[]> → T.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Controller HTTP methods must return ApiResult<XxxResponseDto> or void',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      missingResponseDtoSuffix:
        "Controller method '{{method}}' returns '{{type}}', which does not end with 'ResponseDto'. " +
        'Rename the class to end with ResponseDto, or if this is not a response class, ' +
        'it should not be used as a direct controller return type.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          controllerPattern: {
            type: 'string',
            default: '**/presentation/rest/**/*.controller.ts',
          },
          exemptTypes: {
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
    const options = context.options[0] || {};
    const controllerPattern =
      options.controllerPattern || '**/presentation/rest/**/*.controller.ts';
    const exemptTypes = new Set(options.exemptTypes || []);

    const filename = context.getFilename();
    if (!minimatch(filename, controllerPattern)) {
      return {};
    }

    const HTTP_DECORATORS = new Set(['Get', 'Post', 'Patch', 'Put', 'Delete']);
    const EXEMPT_TYPES = new Set([
      'void',
      'never',
      'undefined',
      'unknown',
      'any',
    ]);

    /**
     * Unwrap Promise<T> → T
     * Then unwrap ApiResult<T> or ApiResult<T[]> → T
     * Returns the innermost non-wrapper TypeReference node, or null if not recognizable.
     */
    function unwrapReturnType(typeNode) {
      if (!typeNode) return null;

      // Unwrap Promise<T>
      if (
        typeNode.type === 'TSTypeReference' &&
        typeNode.typeName &&
        getTypeName(typeNode.typeName) === 'Promise' &&
        typeNode.typeArguments &&
        typeNode.typeArguments.params.length === 1
      ) {
        return unwrapReturnType(typeNode.typeArguments.params[0]);
      }

      // Unwrap ApiResult<T> or ApiResult<T[]>
      if (
        typeNode.type === 'TSTypeReference' &&
        typeNode.typeName &&
        getTypeName(typeNode.typeName) === 'ApiResult' &&
        typeNode.typeArguments &&
        typeNode.typeArguments.params.length === 1
      ) {
        const inner = typeNode.typeArguments.params[0];
        // Unwrap array T[] → T
        if (inner.type === 'TSArrayType') {
          return inner.elementType;
        }
        return inner;
      }

      return typeNode;
    }

    function getTypeName(typeName) {
      if (!typeName) return null;
      if (typeName.type === 'Identifier') return typeName.name;
      if (typeName.type === 'TSQualifiedName')
        return getTypeName(typeName.right);
      return null;
    }

    function hasHttpDecorator(methodNode) {
      if (!methodNode.decorators) return false;
      return methodNode.decorators.some(decorator => {
        const expr = decorator.expression;
        if (expr.type === 'CallExpression') {
          return (
            expr.callee.type === 'Identifier' &&
            HTTP_DECORATORS.has(expr.callee.name)
          );
        }
        if (expr.type === 'Identifier') {
          return HTTP_DECORATORS.has(expr.name);
        }
        return false;
      });
    }

    return {
      MethodDefinition(node) {
        if (!hasHttpDecorator(node)) return;

        const returnTypeAnnotation =
          node.value &&
          node.value.returnType &&
          node.value.returnType.typeAnnotation;
        if (!returnTypeAnnotation) return;

        const unwrapped = unwrapReturnType(returnTypeAnnotation);
        if (!unwrapped) return;

        // Exempt primitive/special types
        if (unwrapped.type === 'TSVoidKeyword') return;
        if (unwrapped.type === 'TSNeverKeyword') return;
        if (unwrapped.type === 'TSUndefinedKeyword') return;
        if (unwrapped.type === 'TSUnknownKeyword') return;
        if (unwrapped.type === 'TSAnyKeyword') return;

        if (unwrapped.type !== 'TSTypeReference') return;

        const name = getTypeName(unwrapped.typeName);
        if (!name) return;

        if (EXEMPT_TYPES.has(name)) return;
        if (exemptTypes.has(name)) return;

        if (!name.endsWith('ResponseDto')) {
          const methodName =
            node.key.type === 'Identifier'
              ? node.key.name
              : String(node.key.value);
          context.report({
            node: node.value.returnType || node,
            messageId: 'missingResponseDtoSuffix',
            data: {
              method: methodName,
              type: name,
            },
          });
        }
      },
    };
  },
};
