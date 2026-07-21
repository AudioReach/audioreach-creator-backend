/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FilterExpression} from './filter-expression.js';

/**
 * Walks a FilterExpression tree and returns all field names referenced in condition nodes.
 */
function collectFields(node: FilterExpression, fields: Set<string>): void {
  if (node.type === 'condition') {
    fields.add(node.field);
    return;
  }
  collectFields(node.left, fields);
  collectFields(node.right, fields);
}

/**
 * Validates that every condition node in the expression uses an allowed field.
 * Returns the first unknown field name, or null if all fields are valid.
 */
export function validateFilterFields(
  expression: FilterExpression,
  allowedFields: ReadonlySet<string>,
): string | null {
  const used = new Set<string>();
  collectFields(expression, used);
  for (const field of used) {
    if (!allowedFields.has(field)) {
      return field;
    }
  }
  return null;
}
