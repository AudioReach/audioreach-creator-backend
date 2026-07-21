/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {FilterParser} from '../../../../src/shared/filter/filter-parser.js';
import {validateFilterFields} from '../../../../src/shared/filter/filter-validator.js';
import type {FilterExpression} from '../../../../src/shared/filter/filter-expression.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Shorthand for a condition leaf node. */
function cond(
  field: string,
  value: FilterExpression extends {value: infer V} ? V : never,
): FilterExpression {
  return {type: 'condition', field, value} as FilterExpression;
}

function and(
  left: FilterExpression,
  right: FilterExpression,
): FilterExpression {
  return {type: 'AND', left, right};
}

function or(left: FilterExpression, right: FilterExpression): FilterExpression {
  return {type: 'OR', left, right};
}

// ---------------------------------------------------------------------------
// FilterParser.tryParse
// ---------------------------------------------------------------------------

describe('FilterParser.tryParse', () => {
  // ─── Absent / empty input ─────────────────────────────────────────────────
  // Contract: absent or empty input returns {} with no expression and no issue.
  // These are the valid "no filter" cases — callers should proceed without filtering.

  describe('absent or empty input — no expression, no issue', () => {
    it('returns {} for undefined', () => {
      const result = FilterParser.tryParse(undefined);
      expect(result.expression).toBeUndefined();
      expect(result.issue).toBeUndefined();
    });

    it('returns {} for null', () => {
      const result = FilterParser.tryParse(null);
      expect(result.expression).toBeUndefined();
      expect(result.issue).toBeUndefined();
    });

    it('returns {} for empty string', () => {
      const result = FilterParser.tryParse('');
      expect(result.expression).toBeUndefined();
      expect(result.issue).toBeUndefined();
    });

    it('returns {} for whitespace-only string', () => {
      const result = FilterParser.tryParse('   ');
      expect(result.expression).toBeUndefined();
      expect(result.issue).toBeUndefined();
    });
  });

  // ─── Value type resolution ─────────────────────────────────────────────────
  // The parser resolves the value part of "field:value" to the narrowest type:
  //   0x[hex] → number, all-digits → number, true/false → boolean, else → string

  describe('value type resolution', () => {
    it('resolves an all-digit value to a decimal number', () => {
      const {expression} = FilterParser.tryParse('subgraphId:42');
      expect(expression).toEqual(cond('subgraphId', 42));
    });

    it('resolves a 0x-prefixed value to a hex number', () => {
      // 0x1a2b = 6699
      const {expression} = FilterParser.tryParse('subgraphId:0x1a2b');
      expect(expression).toEqual(cond('subgraphId', 0x1a2b));
    });

    it('resolves a 0X-prefixed (uppercase X) value to a hex number', () => {
      const {expression} = FilterParser.tryParse('subgraphId:0XFF');
      expect(expression).toEqual(cond('subgraphId', 255));
    });

    it('resolves mixed-case hex digits correctly', () => {
      const {expression} = FilterParser.tryParse('id:0xAbCd');
      expect(expression).toEqual(cond('id', 0xabcd));
    });

    it('resolves "true" to boolean true', () => {
      const {expression} = FilterParser.tryParse('isActive:true');
      expect(expression).toEqual(cond('isActive', true));
    });

    it('resolves "false" to boolean false', () => {
      const {expression} = FilterParser.tryParse('isActive:false');
      expect(expression).toEqual(cond('isActive', false));
    });

    it('resolves "True" (capitalised) to a string — boolean is case-sensitive', () => {
      const {expression} = FilterParser.tryParse('isActive:True');
      expect(expression).toEqual(cond('isActive', 'True'));
    });

    it('resolves an arbitrary string value to a string', () => {
      const {expression} = FilterParser.tryParse('name:hello');
      expect(expression).toEqual(cond('name', 'hello'));
    });

    it('resolves a string with hyphens and dots to a string', () => {
      const {expression} = FilterParser.tryParse('tag:some-value.123');
      expect(expression).toEqual(cond('tag', 'some-value.123'));
    });
  });

  // ─── Simple conditions ─────────────────────────────────────────────────────

  describe('simple single condition', () => {
    it('parses a single field:value pair into a condition node', () => {
      const {expression, issue} = FilterParser.tryParse('myField:myValue');
      expect(issue).toBeUndefined();
      expect(expression).toEqual(cond('myField', 'myValue'));
    });

    it('trims leading and trailing whitespace from the input', () => {
      const {expression} = FilterParser.tryParse('  field:42  ');
      expect(expression).toEqual(cond('field', 42));
    });
  });

  // ─── AND expressions ──────────────────────────────────────────────────────
  // AND is left-associative: a:1 AND b:2 AND c:3 → AND(AND(a:1, b:2), c:3)

  describe('AND expressions', () => {
    it('parses a simple AND into an AND node', () => {
      const {expression} = FilterParser.tryParse('a:1 AND b:2');
      expect(expression).toEqual(and(cond('a', 1), cond('b', 2)));
    });

    it('chains AND left-associatively: a:1 AND b:2 AND c:3', () => {
      const {expression} = FilterParser.tryParse('a:1 AND b:2 AND c:3');
      // AND(AND(a:1, b:2), c:3)
      expect(expression).toEqual(
        and(and(cond('a', 1), cond('b', 2)), cond('c', 3)),
      );
    });
  });

  // ─── OR expressions ───────────────────────────────────────────────────────

  describe('OR expressions', () => {
    it('parses a simple OR into an OR node', () => {
      const {expression} = FilterParser.tryParse('a:1 OR b:2');
      expect(expression).toEqual(or(cond('a', 1), cond('b', 2)));
    });

    it('chains OR left-associatively: a:1 OR b:2 OR c:3', () => {
      const {expression} = FilterParser.tryParse('a:1 OR b:2 OR c:3');
      expect(expression).toEqual(
        or(or(cond('a', 1), cond('b', 2)), cond('c', 3)),
      );
    });
  });

  // ─── Operator precedence (AND binds tighter than OR) ─────────────────────
  // Grammar: or_expr := and_expr (OR and_expr)*
  //          and_expr := primary (AND primary)*
  // So "a:1 OR b:2 AND c:3" = OR(a:1, AND(b:2, c:3)), NOT AND(OR(a:1, b:2), c:3)

  describe('operator precedence — AND binds tighter than OR', () => {
    it('a:1 OR b:2 AND c:3 → OR( a:1, AND(b:2, c:3) )', () => {
      const {expression} = FilterParser.tryParse('a:1 OR b:2 AND c:3');
      expect(expression).toEqual(
        or(cond('a', 1), and(cond('b', 2), cond('c', 3))),
      );
    });

    it('a:1 AND b:2 OR c:3 → OR( AND(a:1, b:2), c:3 )', () => {
      const {expression} = FilterParser.tryParse('a:1 AND b:2 OR c:3');
      expect(expression).toEqual(
        or(and(cond('a', 1), cond('b', 2)), cond('c', 3)),
      );
    });
  });

  // ─── Parentheses ──────────────────────────────────────────────────────────
  // Parentheses override default precedence.

  describe('parentheses override precedence', () => {
    it('(a:1 OR b:2) AND c:3 → AND( OR(a:1, b:2), c:3 )', () => {
      const {expression} = FilterParser.tryParse('(a:1 OR b:2) AND c:3');
      expect(expression).toEqual(
        and(or(cond('a', 1), cond('b', 2)), cond('c', 3)),
      );
    });

    it('a:1 AND (b:2 OR c:3) → AND( a:1, OR(b:2, c:3) )', () => {
      const {expression} = FilterParser.tryParse('a:1 AND (b:2 OR c:3)');
      expect(expression).toEqual(
        and(cond('a', 1), or(cond('b', 2), cond('c', 3))),
      );
    });

    it('redundant parentheses around a single condition are ignored', () => {
      const {expression} = FilterParser.tryParse('(field:42)');
      expect(expression).toEqual(cond('field', 42));
    });

    it('nested parens: (a:1 AND (b:2 OR c:3))', () => {
      const {expression} = FilterParser.tryParse('(a:1 AND (b:2 OR c:3))');
      expect(expression).toEqual(
        and(cond('a', 1), or(cond('b', 2), cond('c', 3))),
      );
    });
  });

  // ─── Practical multi-field examples ───────────────────────────────────────

  describe('practical filter examples', () => {
    it('subgraphId hex AND containerId decimal', () => {
      const {expression} = FilterParser.tryParse(
        'subgraphId:0x7656 AND containerId:12',
      );
      expect(expression).toEqual(
        and(cond('subgraphId', 0x7656), cond('containerId', 12)),
      );
    });

    it('spfModuleInstanceId hex OR subgraphId hex', () => {
      const {expression} = FilterParser.tryParse(
        'spfModuleInstanceId:0x8978 OR subgraphId:0x7656',
      );
      expect(expression).toEqual(
        or(cond('spfModuleInstanceId', 0x8978), cond('subgraphId', 0x7656)),
      );
    });
  });

  // ─── Error cases — returns issue, no expression ───────────────────────────
  // Any parse failure returns {issue: Warning-severity issue}, never throws.

  describe('error cases — returns issue, no expression', () => {
    it('returns an issue for "AND AND" (operator without operand)', () => {
      const {expression, issue} = FilterParser.tryParse('AND AND');
      expect(expression).toBeUndefined();
      expect(issue).toBeDefined();
      expect(issue?.code).toBe('FILTER_PARSE_ERROR');
    });

    it('returns an issue for a bare word with no colon (no field:value)', () => {
      const {expression, issue} = FilterParser.tryParse('justAWord');
      expect(expression).toBeUndefined();
      expect(issue).toBeDefined();
    });

    it('returns an issue when the value is missing after the colon (field:)', () => {
      const {expression, issue} = FilterParser.tryParse('field:');
      expect(expression).toBeUndefined();
      expect(issue).toBeDefined();
    });

    it('returns an issue when the field name is missing before the colon (:value)', () => {
      const {expression, issue} = FilterParser.tryParse(':value');
      expect(expression).toBeUndefined();
      expect(issue).toBeDefined();
    });

    it('returns an issue for an unclosed parenthesis', () => {
      const {expression, issue} = FilterParser.tryParse('(a:1 AND b:2');
      expect(expression).toBeUndefined();
      expect(issue).toBeDefined();
    });

    it('returns an issue for an extra closing parenthesis', () => {
      const {expression, issue} = FilterParser.tryParse('a:1)');
      expect(expression).toBeUndefined();
      expect(issue).toBeDefined();
    });

    it('returns an issue for an empty parentheses group', () => {
      const {expression, issue} = FilterParser.tryParse('()');
      expect(expression).toBeUndefined();
      expect(issue).toBeDefined();
    });

    it('issue has Warning severity (caller decides whether to reject)', () => {
      const {issue} = FilterParser.tryParse('bad expression');
      expect(issue?.severity).toBe('WARNING');
    });
  });
});

// ---------------------------------------------------------------------------
// validateFilterFields
// ---------------------------------------------------------------------------

describe('validateFilterFields', () => {
  const allowed = new Set(['subgraphId', 'containerId', 'spfModuleInstanceId']);

  it('returns null when all condition fields are in the allowed set', () => {
    const {expression} = FilterParser.tryParse(
      'subgraphId:1 AND containerId:2',
    );
    const result = validateFilterFields(expression!, allowed);
    expect(result).toBeNull();
  });

  it('returns the unknown field name when a condition uses an unregistered field', () => {
    const {expression} = FilterParser.tryParse(
      'subgraphId:1 AND unknownField:2',
    );
    const result = validateFilterFields(expression!, allowed);
    expect(result).toBe('unknownField');
  });

  it('returns the unknown field in an OR branch', () => {
    const {expression} = FilterParser.tryParse('subgraphId:1 OR badField:2');
    const result = validateFilterFields(expression!, allowed);
    expect(result).toBe('badField');
  });

  it('returns null for a deeply nested expression where all fields are valid', () => {
    const {expression} = FilterParser.tryParse(
      '(subgraphId:1 OR containerId:2) AND spfModuleInstanceId:0xff',
    );
    const result = validateFilterFields(expression!, allowed);
    expect(result).toBeNull();
  });

  it('finds an invalid field nested deep in the expression tree', () => {
    const {expression} = FilterParser.tryParse(
      '(subgraphId:1 OR containerId:2) AND notAField:3',
    );
    const result = validateFilterFields(expression!, allowed);
    expect(result).toBe('notAField');
  });
});
