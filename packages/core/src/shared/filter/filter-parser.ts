/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {FilterExpression, FilterValue} from './filter-expression.js';
import type {Issue} from '../issues/issue.js';
import {IssueSeverity} from '../issues/severity.js';

export interface FilterParseResult {
  expression?: FilterExpression;
  issue?: Issue;
}

/**
 * Parses an optional filter query string into a FilterExpression tree.
 *
 * Grammar:
 *   expression := or_expr
 *   or_expr    := and_expr (OR and_expr)*
 *   and_expr   := primary (AND primary)*
 *   primary    := '(' expression ')' | condition
 *   condition  := field ':' value
 *
 * Value resolution:
 *   0x[hex]    → number (hex)
 *   [digits]   → number (decimal)
 *   true/false → boolean
 *   anything else → string
 *
 * Contract:
 *   - Absent or empty input → {expression: undefined}   no error, no warning
 *   - Valid expression      → {expression: parsed}      no warning
 *   - Invalid expression    → {expression: undefined, issue: Warning}
 *     Caller decides whether to reject (400) or proceed without the filter.
 */
export class FilterParser {
  static tryParse(input: string | undefined | null): FilterParseResult {
    if (!input || input.trim().length === 0) return {};

    try {
      const parser = new FilterParser(input.trim());
      const expression = parser.parseOr();
      if (parser.pos < parser.tokens.length) {
        throw new Error(`Unexpected token: ${parser.tokens[parser.pos]}`);
      }
      return {expression};
    } catch (error) {
      return {
        issue: {
          code: 'FILTER_PARSE_ERROR',
          message:
            error instanceof Error
              ? error.message
              : 'Invalid filter expression',
          severity: IssueSeverity.Warning,
        },
      };
    }
  }

  private tokens: string[];
  private pos = 0;

  private constructor(input: string) {
    this.tokens = FilterParser.tokenize(input);
  }

  private static tokenize(input: string): string[] {
    const tokens: string[] = [];
    let i = 0;
    while (i < input.length) {
      if (/\s/.test(input[i])) {
        i++;
        continue;
      }
      if (input[i] === '(' || input[i] === ')') {
        tokens.push(input[i++]);
        continue;
      }
      let j = i;
      while (
        j < input.length &&
        !/\s/.test(input[j]) &&
        input[j] !== '(' &&
        input[j] !== ')'
      ) {
        j++;
      }
      tokens.push(input.slice(i, j));
      i = j;
    }
    return tokens;
  }

  private parseOr(): FilterExpression {
    let left = this.parseAnd();
    while (this.pos < this.tokens.length && this.tokens[this.pos] === 'OR') {
      this.pos++;
      const right = this.parseAnd();
      left = {type: 'OR', left, right};
    }
    return left;
  }

  private parseAnd(): FilterExpression {
    let left = this.parsePrimary();
    while (this.pos < this.tokens.length && this.tokens[this.pos] === 'AND') {
      this.pos++;
      const right = this.parsePrimary();
      left = {type: 'AND', left, right};
    }
    return left;
  }

  private parsePrimary(): FilterExpression {
    const token = this.tokens[this.pos];
    if (!token) throw new Error('Unexpected end of filter expression');

    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (token === '(') {
      this.pos++;
      const expr = this.parseOr();
      if (this.tokens[this.pos] !== ')')
        throw new Error('Expected closing parenthesis');
      this.pos++;
      return expr;
    }

    return this.parseCondition();
  }

  private parseCondition(): FilterExpression {
    const token = this.tokens[this.pos];
    if (!token) throw new Error('Expected field:value condition');

    const colonIdx = token.indexOf(':');
    if (colonIdx === -1)
      throw new Error(`Expected field:value condition, got: ${token}`);

    const field = token.slice(0, Math.max(0, colonIdx));
    const rawValue = token.slice(Math.max(0, colonIdx + 1));

    if (!field) throw new Error(`Missing field name in: ${token}`);
    if (!rawValue) throw new Error(`Missing value in: ${token}`);

    this.pos++;
    return {
      type: 'condition',
      field,
      value: FilterParser.resolveValue(rawValue),
    };
  }

  // eslint-disable-next-line sonarjs/function-return-type -- FilterValue is an intentional union
  private static resolveValue(raw: string): FilterValue {
    let result: FilterValue;
    if (/^0x[\da-f]+$/i.test(raw)) {
      result = Number.parseInt(raw, 16);
    } else if (/^\d+$/.test(raw)) {
      result = Number.parseInt(raw, 10);
    } else if (raw === 'true') {
      result = true;
    } else if (raw === 'false') {
      result = false;
    } else {
      result = raw;
    }
    return result;
  }
}
