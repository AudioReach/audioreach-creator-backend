/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * ESLint rule: enforce that API DTO classes wrapping Core Zod schemas via
 * createZodDto() are named exactly XxxResponseDto where Xxx matches the Core
 * schema name (XxxDtoSchema → XxxDto → XxxResponseDto).
 *
 * Pattern:
 *   Core layer  → XxxDto          (Zod-inferred TypeScript type)
 *   API layer   → XxxResponseDto  (NestJS class, createZodDto wrapper)
 *
 * For derived schemas (e.g. XxxDtoSchema.omit({...}), XxxDtoSchema.pick({...})),
 * only the ResponseDto suffix is enforced since the exact name can't be inferred.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'API DTO classes wrapping Core Zod schemas via createZodDto must be named XxxResponseDto ' +
        'where Xxx matches the Core schema name',
      category: 'Best Practices',
      recommended: true,
    },
    messages: {
      wrongName:
        '"{{name}}" wraps {{schema}} via createZodDto but should be named "{{expected}}". ' +
        'Core types use XxxDto; API wrappers must use the matching XxxResponseDto.',
      wrongSuffix:
        '"{{name}}" wraps a Core Zod schema via createZodDto but does not end with ResponseDto. ' +
        'Rename it to "{{expected}}".',
    },
    schema: [],
  },

  create(context) {
    return {
      ClassDeclaration(node) {
        if (!node.superClass) return;
        const sc = node.superClass;

        const isDirectCreateZodDto =
          sc.type === 'CallExpression' && sc.callee.name === 'createZodDto';

        const isDerivedCreateZodDto =
          sc.type === 'CallExpression' &&
          sc.callee.type === 'MemberExpression' &&
          sc.callee.property.name === 'createZodDto';

        if (!isDirectCreateZodDto && !isDerivedCreateZodDto) return;

        const name = node.id && node.id.name;
        if (!name) return;

        // Determine the createZodDto argument
        const args = sc.arguments;
        const firstArg = args && args[0];

        if (firstArg && firstArg.type === 'Identifier') {
          // Plain schema reference: createZodDto(XxxDtoSchema)
          const schemaName = firstArg.name;

          // Derive expected class name: XxxDtoSchema → XxxDto → XxxResponseDto
          let expected = schemaName;
          if (expected.endsWith('Schema')) {
            expected = expected.slice(0, -6); // strip 'Schema'
          }
          if (expected.endsWith('Dto')) {
            expected = expected.slice(0, -3) + 'ResponseDto'; // replace 'Dto' with 'ResponseDto'
          } else {
            expected = expected + 'ResponseDto';
          }

          if (name.toLowerCase() !== expected.toLowerCase()) {
            context.report({
              node: node.id,
              messageId: 'wrongName',
              data: {name, schema: schemaName, expected},
            });
          }
        } else if (firstArg) {
          // Derived schema: createZodDto(XxxDtoSchema.omit({...})) etc.
          // Only enforce the ResponseDto suffix — can't infer exact name
          if (!name.endsWith('ResponseDto')) {
            const expected = name.endsWith('Dto')
              ? name.slice(0, -3) + 'ResponseDto'
              : name + 'ResponseDto';
            context.report({
              node: node.id,
              messageId: 'wrongSuffix',
              data: {name, expected},
            });
          }
        }
      },
    };
  },
};
