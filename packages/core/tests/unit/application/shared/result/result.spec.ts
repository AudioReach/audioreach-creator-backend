/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  Result,
  RESULT_KIND,
} from '../../../../../src/application/shared/result/result.js';
import type {Issue} from '../../../../../src/shared/issues/issue.js';
import {IssueSeverity} from '../../../../../src/shared/issues/severity.js';

const errIssue: Issue = {
  code: 'TEST_ERROR',
  message: 'test error',
  severity: IssueSeverity.Error,
};

const warnIssue: Issue = {
  code: 'TEST_WARN',
  message: 'test warning',
  severity: IssueSeverity.Warning,
};

describe('Result<T>', () => {
  describe('Result.ok', () => {
    it('produces an ok variant with data and no issues field when called without issues', () => {
      const result = Result.ok(42);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind === RESULT_KIND.Ok) {
        expect(result.data).toBe(42);
      }
      expect('issues' in result).toBe(false);
    });

    it('produces an ok variant with data and issues when non-empty warnings are supplied', () => {
      const result = Result.ok(42, [warnIssue]);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      if (result.kind === RESULT_KIND.Ok) {
        expect(result.data).toBe(42);
        expect(result.issues).toEqual([warnIssue]);
      }
    });

    it('omits the issues field entirely when an empty array is passed', () => {
      const result = Result.ok('payload', []);

      expect(result.kind).toBe(RESULT_KIND.Ok);
      expect('issues' in result).toBe(false);
    });
  });

  describe('Result.partial', () => {
    it('produces a partial variant with data and non-empty issues', () => {
      const result = Result.partial([1, 2], [errIssue]);

      expect(result.kind).toBe(RESULT_KIND.Partial);
      if (result.kind === RESULT_KIND.Partial) {
        expect(result.data).toEqual([1, 2]);
        expect(result.issues).toEqual([errIssue]);
      }
    });

    it('throws when issues is empty', () => {
      expect(() => Result.partial([1, 2], [])).toThrow(
        /Result\.partial\(\) requires at least one issue/,
      );
    });
  });

  describe('Result.fail', () => {
    it('produces a fail variant carrying the supplied issues', () => {
      const result = Result.fail(errIssue, warnIssue);

      expect(result.kind).toBe(RESULT_KIND.Fail);
      if (result.kind === RESULT_KIND.Fail) {
        expect(result.issues).toEqual([errIssue, warnIssue]);
      }
    });

    it('throws when no issues are supplied', () => {
      expect(() => Result.fail()).toThrow(
        /Result\.fail\(\) requires at least one issue/,
      );
    });
  });

  describe('discriminated-union narrowing', () => {
    it('narrows the ok variant so data is accessible', () => {
      const result: Result<number> = Result.ok(7);

      if (result.kind === RESULT_KIND.Ok) {
        const value: number = result.data;
        expect(value).toBe(7);
      } else {
        throw new Error('expected ok variant');
      }
    });

    it('narrows the partial variant so both data and issues are accessible', () => {
      const result: Result<string> = Result.partial('hello', [errIssue]);

      if (result.kind === RESULT_KIND.Partial) {
        const value: string = result.data;
        const issues: readonly Issue[] = result.issues;
        expect(value).toBe('hello');
        expect(issues).toEqual([errIssue]);
      } else {
        throw new Error('expected partial variant');
      }
    });

    it('prevents data access on the fail variant at compile time', () => {
      const result: Result<number> = Result.fail<number>(errIssue);

      if (result.kind === RESULT_KIND.Fail) {
        // @ts-expect-error - 'data' does not exist on the 'fail' variant of Result<T>
        const forbidden = result.data;
        expect(forbidden).toBeUndefined();
      } else {
        throw new Error('expected fail variant');
      }
    });
  });
});
