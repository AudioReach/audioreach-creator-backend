/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {evaluateFormula} from '../../../../../../src/application/usecase-designer/spf-module/param-parser/utils/formular-evaluator.js';

function evaluate(formula: string, vars: Record<string, number> = {}): number {
  return evaluateFormula(formula, new Map(Object.entries(vars)));
}

describe('FormulaEvaluator', () => {
  describe('numeric literals', () => {
    it('evaluates an integer literal', () => {
      expect(evaluate('42')).toBe(42);
    });

    it('evaluates a decimal literal', () => {
      expect(evaluate('3.14')).toBeCloseTo(3.14);
    });
  });

  describe('arithmetic operators', () => {
    it('adds two numbers', () => {
      expect(evaluate('2 + 3')).toBe(5);
    });

    it('subtracts two numbers', () => {
      expect(evaluate('10 - 4')).toBe(6);
    });

    it('multiplies two numbers', () => {
      expect(evaluate('3 * 4')).toBe(12);
    });

    it('divides two numbers', () => {
      expect(evaluate('10 / 4')).toBe(2.5);
    });

    it('respects operator precedence (* before +)', () => {
      expect(evaluate('2 + 3 * 4')).toBe(14);
    });

    it('evaluates left-to-right for same-precedence operators', () => {
      expect(evaluate('10 - 3 - 2')).toBe(5);
    });
  });

  describe('unary minus', () => {
    it('negates a literal', () => {
      expect(evaluate('-5')).toBe(-5);
    });

    it('negates a variable', () => {
      expect(evaluate('-x', {x: 3})).toBe(-3);
    });

    it('double negation', () => {
      expect(evaluate('--5')).toBe(5);
    });
  });

  describe('grouping', () => {
    it('overrides precedence with parentheses', () => {
      expect(evaluate('(2 + 3) * 4')).toBe(20);
    });

    it('supports square-bracket grouping', () => {
      expect(evaluate('[2 + 3] * 4')).toBe(20);
    });

    it('handles nested parentheses', () => {
      expect(evaluate('((2 + 3) * (1 + 1))')).toBe(10);
    });

    it('handles mixed bracket/parenthesis nesting', () => {
      expect(evaluate('[(1*2+2*3)+2]*5')).toBe(50);
    });
  });

  describe('variables', () => {
    it('resolves a single variable', () => {
      expect(evaluate('count', {count: 7})).toBe(7);
    });

    it('uses a variable in an expression', () => {
      expect(evaluate('count * 2', {count: 3})).toBe(6);
    });

    it('uses multiple variables', () => {
      expect(evaluate('a + b', {a: 4, b: 5})).toBe(9);
    });

    it('throws on unknown variable', () => {
      expect(() => evaluate('unknown')).toThrow('Unknown variable: unknown');
    });
  });

  describe('built-in constants', () => {
    it("resolves e (Euler's number)", () => {
      expect(evaluate('e')).toBeCloseTo(Math.E);
    });

    it('resolves pi', () => {
      expect(evaluate('pi')).toBeCloseTo(Math.PI);
    });
  });

  describe('built-in functions', () => {
    it('evaluates log(100) ≈ 2', () => {
      expect(evaluate('log(100)')).toBeCloseTo(2);
    });

    it('evaluates ln(e) ≈ 1', () => {
      expect(evaluate('ln(e)')).toBeCloseTo(1);
    });

    it('evaluates sqrt(9) = 3', () => {
      expect(evaluate('sqrt(9)')).toBeCloseTo(3);
    });

    it('throws on unknown function', () => {
      expect(() => evaluate('abs(5)')).toThrow('Unknown function: abs');
    });
  });

  describe('error handling', () => {
    it('throws on division by zero', () => {
      expect(() => evaluate('1 / 0')).toThrow('Division by zero');
    });

    it('throws on unclosed parenthesis', () => {
      expect(() => evaluate('(2 + 3')).toThrow();
    });

    it('throws on unexpected character', () => {
      expect(() => evaluate('2 + @3')).toThrow();
    });

    it('throws on trailing unexpected character', () => {
      expect(() => evaluate('2 + 3 !')).toThrow();
    });
  });

  describe('whitespace handling', () => {
    it('ignores leading and trailing whitespace', () => {
      expect(evaluate('  42  ')).toBe(42);
    });

    it('ignores whitespace around operators', () => {
      expect(evaluate('  2  +  3  ')).toBe(5);
    });
  });
});
