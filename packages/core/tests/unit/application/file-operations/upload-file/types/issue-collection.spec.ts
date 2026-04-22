/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  IssueCollector,
  ISSUE_SEVERITY,
  ENTITY_TYPES,
  type EntityBuildIssue,
} from '../../../../../../src/application/file-operations/upload-file/types/issue-collection.js';
import {ERROR_CODES} from '../../../../../../src/shared/errors/error-codes.js';

describe('IssueCollector', () => {
  let collector: IssueCollector;

  beforeEach(() => {
    collector = new IssueCollector();
  });

  describe('addIssue', () => {
    it('should add a single issue', () => {
      const issue: EntityBuildIssue = {
        severity: ISSUE_SEVERITY.ERROR,
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Test error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      };

      collector.addIssue(issue);

      expect(collector.getIssueCount()).toBe(1);
      expect(collector.getIssues()).toEqual([issue]);
    });
  });

  describe('addIssues', () => {
    it('should add multiple issues', () => {
      const issues: EntityBuildIssue[] = [
        {
          severity: ISSUE_SEVERITY.ERROR,
          code: ERROR_CODES.INVALID_ENTITY_DATA,
          message: 'Error 1',
          entityType: ENTITY_TYPES.KEY_DEFINITION,
        },
        {
          severity: ISSUE_SEVERITY.WARNING,
          code: ERROR_CODES.MISSING_REQUIRED_FIELD,
          message: 'Warning 1',
          entityType: ENTITY_TYPES.SPF_MODULE,
        },
      ];

      collector.addIssues(issues);

      expect(collector.getIssueCount()).toBe(2);
      expect(collector.getIssues()).toEqual(issues);
    });
  });

  describe('addError', () => {
    it('should add an error with automatic severity', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Test error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });

      expect(collector.getErrorCount()).toBe(1);
      expect(collector.getErrors()[0].severity).toBe(ISSUE_SEVERITY.ERROR);
    });
  });

  describe('addWarning', () => {
    it('should add a warning with automatic severity', () => {
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Test warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });

      expect(collector.getWarningCount()).toBe(1);
      expect(collector.getWarnings()[0].severity).toBe(ISSUE_SEVERITY.WARNING);
    });
  });

  describe('getErrors', () => {
    it('should return only errors', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });

      const errors = collector.getErrors();

      expect(errors).toHaveLength(1);
      expect(errors[0].severity).toBe(ISSUE_SEVERITY.ERROR);
    });
  });

  describe('getWarnings', () => {
    it('should return only warnings', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });

      const warnings = collector.getWarnings();

      expect(warnings).toHaveLength(1);
      expect(warnings[0].severity).toBe(ISSUE_SEVERITY.WARNING);
    });
  });

  describe('hasIssues', () => {
    it('should return false when no issues', () => {
      expect(collector.hasIssues()).toBe(false);
    });

    it('should return true when issues exist', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });

      expect(collector.hasIssues()).toBe(true);
    });
  });

  describe('hasErrors', () => {
    it('should return false when no errors', () => {
      expect(collector.hasErrors()).toBe(false);
    });

    it('should return true when errors exist', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });

      expect(collector.hasErrors()).toBe(true);
    });

    it('should return false when only warnings exist', () => {
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });

      expect(collector.hasErrors()).toBe(false);
    });
  });

  describe('hasWarnings', () => {
    it('should return false when no warnings', () => {
      expect(collector.hasWarnings()).toBe(false);
    });

    it('should return true when warnings exist', () => {
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });

      expect(collector.hasWarnings()).toBe(true);
    });

    it('should return false when only errors exist', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });

      expect(collector.hasWarnings()).toBe(false);
    });
  });

  describe('getIssueCount', () => {
    it('should return 0 when no issues', () => {
      expect(collector.getIssueCount()).toBe(0);
    });

    it('should return correct count', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });

      expect(collector.getIssueCount()).toBe(2);
    });
  });

  describe('getErrorCount', () => {
    it('should return correct error count', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error 1',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });
      collector.addError({
        code: ERROR_CODES.DUPLICATE_ENTITY,
        message: 'Error 2',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });

      expect(collector.getErrorCount()).toBe(2);
    });
  });

  describe('getWarningCount', () => {
    it('should return correct warning count', () => {
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning 1',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });
      collector.addWarning({
        code: ERROR_CODES.INVALID_DATA_TYPE,
        message: 'Warning 2',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });

      expect(collector.getWarningCount()).toBe(2);
    });
  });

  describe('clear', () => {
    it('should clear all issues', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });

      collector.clear();

      expect(collector.getIssueCount()).toBe(0);
      expect(collector.hasIssues()).toBe(false);
    });
  });

  describe('formatForApi', () => {
    it('should format issues for API response', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Invalid data',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Missing field',
        entityType: ENTITY_TYPES.SPF_MODULE,
      });

      const formatted = collector.formatForApi();

      expect(formatted.errors).toBeDefined();
      expect(formatted.warnings).toBeDefined();
      expect(formatted.errors).toHaveLength(1);
      expect(formatted.warnings).toHaveLength(1);
      expect(formatted.errors![0]).toBe(
        '[ERR_2004] KeyDefinition: Invalid data',
      );
      expect(formatted.warnings![0]).toBe(
        '[ERR_1002] SpfModule: Missing field',
      );
    });

    it('should return empty object when no issues', () => {
      const formatted = collector.formatForApi();

      expect(formatted.errors).toBeUndefined();
      expect(formatted.warnings).toBeUndefined();
    });
  });

  describe('getIssues immutability', () => {
    it('should return a copy of issues array', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });

      const issues1 = collector.getIssues();
      const issues2 = collector.getIssues();

      expect(issues1).not.toBe(issues2);
      expect(issues1).toEqual(issues2);
    });
  });
});
