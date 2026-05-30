/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const minimatch = require('minimatch');

/**
 * ESLint rule to prevent domain layer from depending on infrastructure.
 *
 * @fileoverview Prevent domain layer from depending on infrastructure
 * @author AudioReach Team
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent domain layer from depending on infrastructure',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      domainInfrastructureDep:
        'Domain layer should not import from infrastructure layer. ' +
        'Keep domain entities pure and free from infrastructure dependencies.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          domainPattern: {
            type: 'string',
            default: '**/packages/core/src/domain/**/*.ts',
          },
          bannedImports: {
            type: 'array',
            items: {type: 'string'},
            default: [
              '**/infrastructure/**',
              '**/api/**',
              'typeorm',
              'express',
            ],
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const domainPattern =
      options.domainPattern || '**/packages/core/src/domain/**/*.ts';
    const bannedImports = options.bannedImports || [
      '**/infrastructure/**',
      '**/api/**',
      'typeorm',
      'express',
    ];

    // Check if current file is in domain layer
    const filename = context.getFilename();
    if (!minimatch(filename, domainPattern)) {
      return {}; // Skip non-domain files
    }

    return {
      ImportDeclaration(node) {
        const importPath = node.source.value;

        // Check if import matches any banned pattern
        for (const bannedPattern of bannedImports) {
          // Check for exact match (for npm packages like 'express', 'typeorm')
          if (importPath === bannedPattern) {
            context.report({
              node: node.source,
              messageId: 'domainInfrastructureDep',
            });
            break;
          }

          // Check for pattern match (for paths like '**/infrastructure/**')
          if (bannedPattern.includes('*')) {
            if (minimatch(importPath, bannedPattern)) {
              context.report({
                node: node.source,
                messageId: 'domainInfrastructureDep',
              });
              break;
            }
          }

          // Check if import path contains the banned pattern (for relative paths)
          if (
            importPath.includes('infrastructure') ||
            importPath.includes('/api/')
          ) {
            context.report({
              node: node.source,
              messageId: 'domainInfrastructureDep',
            });
            break;
          }
        }
      },
    };
  },
};
