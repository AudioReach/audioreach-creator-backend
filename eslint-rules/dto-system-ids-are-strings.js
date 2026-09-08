/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

const SYSTEM_ID = /^(?:systemIds?|.+SystemIds?)$/;

function getStaticKeyName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal') return String(node.value);
  return null;
}

function isMatchingName(node) {
  const name = getStaticKeyName(node);
  return name !== null && SYSTEM_ID.test(name);
}

function isAllowedTsType(node) {
  if (node.type === 'TSStringKeyword') return true;
  if (node.type === 'TSArrayType') return isAllowedTsType(node.elementType);
  if (node.type === 'TSUnionType') {
    return node.types.every(
      type =>
        isAllowedTsType(type) ||
        ['TSNullKeyword', 'TSUndefinedKeyword'].includes(type.type),
    );
  }
  return false;
}

function unwrapZod(node) {
  let current = node;
  while (
    current?.type === 'CallExpression' &&
    current.callee.type === 'MemberExpression' &&
    [
      'optional',
      'nullable',
      'nullish',
      'regex',
      'min',
      'max',
      'describe',
      'default',
      'refine',
    ].includes(current.callee.property.name)
  ) {
    current = current.callee.object;
  }
  return current;
}

function isZodString(node) {
  const current = unwrapZod(node);
  return (
    current?.type === 'CallExpression' &&
    current.callee.type === 'MemberExpression' &&
    current.callee.object.type === 'Identifier' &&
    current.callee.object.name === 'z' &&
    current.callee.property.name === 'string'
  );
}

function isAllowedZod(node) {
  const current = unwrapZod(node);
  if (isZodString(current)) return true;
  return (
    current?.type === 'CallExpression' &&
    current.callee.type === 'MemberExpression' &&
    current.callee.object.type === 'Identifier' &&
    current.callee.object.name === 'z' &&
    current.callee.property.name === 'array' &&
    isZodString(current.arguments[0])
  );
}

function isZodObjectProperty(node) {
  const object = node.parent;
  const call = object?.parent;
  return (
    object?.type === 'ObjectExpression' &&
    call?.type === 'CallExpression' &&
    call.callee.type === 'MemberExpression' &&
    call.callee.object.type === 'Identifier' &&
    call.callee.object.name === 'z' &&
    call.callee.property.name === 'object'
  );
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require DTO system IDs to use string types',
      recommended: true,
    },
    messages: {
      systemIdMustBeString:
        'System ID fields in DTOs must be declared as strings.',
    },
    schema: [],
  },

  create(context) {
    function reportIfInvalid(name, type) {
      if (isMatchingName(name) && !isAllowedTsType(type)) {
        context.report({node: name, messageId: 'systemIdMustBeString'});
      }
    }

    return {
      TSPropertySignature(node) {
        const type = node.typeAnnotation?.typeAnnotation;
        if (type) reportIfInvalid(node.key, type);
      },
      PropertyDefinition(node) {
        const type = node.typeAnnotation?.typeAnnotation;
        if (type) reportIfInvalid(node.key, type);
      },
      Property(node) {
        if (
          isZodObjectProperty(node) &&
          isMatchingName(node.key) &&
          !isAllowedZod(node.value)
        ) {
          context.report({node: node.key, messageId: 'systemIdMustBeString'});
        }
      },
    };
  },
};
