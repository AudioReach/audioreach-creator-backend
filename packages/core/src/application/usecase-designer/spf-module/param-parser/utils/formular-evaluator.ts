/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
/**
 * Evaluates an `arrayLenFormulaStr` expression and returns the numeric result.
 *
 * Supported syntax:
 * - Arithmetic operators: `+`, `-`, `*`, `/`
 * - Parentheses for grouping: `(expr)` or `[expr]`
 * - Unary minus: `-expr`
 * - Integer and decimal literals: `42`, `3.14`
 * - Variables: any identifier resolved from the provided `variables` map
 * - Constants: `e` (Euler's number ≈ 2.718), `pi`
 * - Functions: `log(x)` (base-10 logarithm), `ln(x)` (natural log), `sqrt(x)`
 *
 * Throws on any parse or evaluation error (unknown variable, division by zero, etc.).
 */
export function evaluateFormula(
  formula: string,
  variables: Map<string, number>,
): number {
  // eslint-disable-next-line unicorn/prefer-string-replace-all, sonarjs/slow-regex
  formula = formula.replace(/\w+::/g, '');
  let pos = 0;

  function skipWhitespace(): void {
    while (pos < formula.length && /\s/.test(formula[pos])) pos++;
  }

  /** expression = term (('+' | '-') term)* */
  function parseExpression(): number {
    let left = parseTerm();
    skipWhitespace();
    while (
      pos < formula.length &&
      (formula[pos] === '+' || formula[pos] === '-')
    ) {
      const op = formula[pos++];
      skipWhitespace();
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
      skipWhitespace();
    }
    return left;
  }

  /** term = factor (('*' | '/') factor)* */
  function parseTerm(): number {
    let left = parseFactor();
    skipWhitespace();
    while (
      pos < formula.length &&
      (formula[pos] === '*' || formula[pos] === '/')
    ) {
      const op = formula[pos++];
      skipWhitespace();
      const right = parseFactor();
      if (op === '/' && right === 0) throw new Error('Division by zero');
      left = op === '*' ? left * right : left / right;
      skipWhitespace();
    }
    return left;
  }

  /** factor = number | identifier | '(' expression ')' | '-' factor */
  function parseFactor(): number {
    skipWhitespace();

    if (pos < formula.length && formula[pos] === '-') {
      pos++;
      return -parseFactor();
    }

    if (
      pos < formula.length &&
      (formula[pos] === '(' || formula[pos] === '[')
    ) {
      const open = formula[pos];
      const close = open === '(' ? ')' : ']';
      pos++;
      const result = parseExpression();
      skipWhitespace();
      if (pos >= formula.length || formula[pos] !== close) {
        throw new Error(`Expected '${close}' to close '${open}'`);
      }
      pos++;
      return result;
    }

    if (pos < formula.length && /[0-9.]/.test(formula[pos])) {
      return parseNumber();
    }

    if (pos < formula.length && /[a-zA-Z_]/.test(formula[pos])) {
      return parseIdentifier();
    }

    throw new Error(
      `Unexpected token at position ${pos}: '${formula[pos] ?? 'EOF'}'`,
    );
  }

  function parseNumber(): number {
    let numStr = '';
    while (pos < formula.length && /[0-9.]/.test(formula[pos])) {
      numStr += formula[pos++];
    }
    const num = Number.parseFloat(numStr);
    if (Number.isNaN(num)) throw new Error(`Invalid number: ${numStr}`);
    return num;
  }

  function parseIdentifier(): number {
    let name = '';
    while (pos < formula.length && /\w/.test(formula[pos])) {
      name += formula[pos++];
    }
    skipWhitespace();

    if (pos < formula.length && formula[pos] === '(') {
      pos++;
      const arg = parseExpression();
      skipWhitespace();
      if (pos >= formula.length || formula[pos] !== ')') {
        throw new Error(`Expected ')' after argument of function '${name}'`);
      }
      pos++;
      switch (name) {
        case 'log':
          return Math.log10(arg);
        case 'ln':
          return Math.log(arg);
        case 'sqrt':
          return Math.sqrt(arg);
        default:
          throw new Error(`Unknown function: ${name}`);
      }
    }

    if (name === 'e') return Math.E;
    if (name === 'pi') return Math.PI;

    const value = variables.get(name);
    if (value === undefined) throw new Error(`Unknown variable: ${name}`);
    return value;
  }

  const result = parseExpression();
  skipWhitespace();
  if (pos < formula.length) {
    throw new Error(
      `Unexpected character at position ${pos}: '${formula[pos]}'`,
    );
  }
  return result;
}
