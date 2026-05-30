/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const minimatch = require('minimatch');

/**
 * ESLint rule to ensure only HTTP exceptions are thrown in controllers.
 *
 * @fileoverview Ensure only HTTP exceptions are thrown in controllers
 * @author AudioReach Team
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ensure only HTTP exceptions are thrown in controllers',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      genericError:
        'Use HTTP exceptions in controllers instead of generic Error. ' +
        'Throw BadRequestException, NotFoundException, etc. instead of Error.',
      httpException:
        'Do not throw HttpException directly. Use typed exceptions instead: ' +
        'BadRequestException, NotFoundException, NotImplementedException, ' +
        'UnprocessableEntityException, InternalServerErrorException, etc. ' +
        '(from @nestjs/common)',
    },
    schema: [
      {
        type: 'object',
        properties: {
          controllerPattern: {
            type: 'string',
            default: '**/packages/api/src/presentation/**/*.ts',
          },
          allowedExceptions: {
            type: 'array',
            items: {type: 'string'},
            default: [
              'BadRequestException',
              'NotFoundException',
              'UnauthorizedException',
              'ForbiddenException',
              'ConflictException',
              'InternalServerErrorException',
              'NotImplementedException',
              'UnprocessableEntityException',
            ],
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
    const allowedExceptions = options.allowedExceptions || [
      'BadRequestException',
      'NotFoundException',
      'UnauthorizedException',
      'ForbiddenException',
      'ConflictException',
      'InternalServerErrorException',
      'NotImplementedException',
      'UnprocessableEntityException',
    ];

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
      ThrowStatement(node) {
        // Only check throw statements inside controller classes
        if (!insideControllerClass) {
          return;
        }
        if (node.argument && node.argument.type === 'NewExpression') {
          const exceptionName = node.argument.callee.name;

          // Ban throwing HttpException directly — use typed subclasses instead
          if (exceptionName === 'HttpException') {
            context.report({
              node: node.argument,
              messageId: 'httpException',
            });
            return;
          }

          // Check if it's a generic Error or not in allowed list
          if (
            exceptionName === 'Error' ||
            exceptionName === 'TypeError' ||
            exceptionName === 'RangeError' ||
            (!allowedExceptions.includes(exceptionName) &&
              exceptionName.endsWith('Error'))
          ) {
            context.report({
              node: node.argument,
              messageId: 'genericError',
            });
          }
        }
      },
    };
  },
};
