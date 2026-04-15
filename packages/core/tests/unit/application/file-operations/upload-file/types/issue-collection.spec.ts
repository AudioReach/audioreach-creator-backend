/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  IssueCollector,
  ISSUE_SEVERITY,
  ISSUE_PHASE,
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
        entityIdentifier: '123',
        phase: ISSUE_PHASE.BUILDING,
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
          entityIdentifier: '1',
          phase: ISSUE_PHASE.BUILDING,
        },
        {
          severity: ISSUE_SEVERITY.WARNING,
          code: ERROR_CODES.MISSING_REQUIRED_FIELD,
          message: 'Warning 1',
          entityType: ENTITY_TYPES.SPF_MODULE,
          entityIdentifier: '2',
          phase: ISSUE_PHASE.PARSING,
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
        entityIdentifier: '123',
        phase: ISSUE_PHASE.BUILDING,
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
        entityIdentifier: '456',
        phase: ISSUE_PHASE.PARSING,
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
        entityIdentifier: '1',
        phase: ISSUE_PHASE.BUILDING,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
        entityIdentifier: '2',
        phase: ISSUE_PHASE.PARSING,
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
        entityIdentifier: '1',
        phase: ISSUE_PHASE.BUILDING,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
        entityIdentifier: '2',
        phase: ISSUE_PHASE.PARSING,
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
        entityIdentifier: '1',
        phase: ISSUE_PHASE.BUILDING,
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
        entityIdentifier: '1',
        phase: ISSUE_PHASE.BUILDING,
      });

      expect(collector.hasErrors()).toBe(true);
    });

    it('should return false when only warnings exist', () => {
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
        entityIdentifier: '1',
        phase: ISSUE_PHASE.PARSING,
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
        entityIdentifier: '1',
        phase: ISSUE_PHASE.PARSING,
      });

      expect(collector.hasWarnings()).toBe(true);
    });

    it('should return false when only errors exist', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
        entityIdentifier: '1',
        phase: ISSUE_PHASE.BUILDING,
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
        entityIdentifier: '1',
        phase: ISSUE_PHASE.BUILDING,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
        entityIdentifier: '2',
        phase: ISSUE_PHASE.PARSING,
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
        entityIdentifier: '1',
        phase: ISSUE_PHASE.BUILDING,
      });
      collector.addError({
        code: ERROR_CODES.DUPLICATE_ENTITY,
        message: 'Error 2',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
        entityIdentifier: '2',
        phase: ISSUE_PHASE.BUILDING,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
        entityIdentifier: '3',
        phase: ISSUE_PHASE.PARSING,
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
        entityIdentifier: '1',
        phase: ISSUE_PHASE.PARSING,
      });
      collector.addWarning({
        code: ERROR_CODES.INVALID_DATA_TYPE,
        message: 'Warning 2',
        entityType: ENTITY_TYPES.SPF_MODULE,
        entityIdentifier: '2',
        phase: ISSUE_PHASE.PARSING,
      });
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
        entityIdentifier: '3',
        phase: ISSUE_PHASE.BUILDING,
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
        entityIdentifier: '1',
        phase: ISSUE_PHASE.BUILDING,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
        entityIdentifier: '2',
        phase: ISSUE_PHASE.PARSING,
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
        entityIdentifier: '123',
        phase: ISSUE_PHASE.BUILDING,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Missing field',
        entityType: ENTITY_TYPES.SPF_MODULE,
        entityIdentifier: '456',
        phase: ISSUE_PHASE.PARSING,
      });

      const formatted = collector.formatForApi();

      expect(formatted.errors).toHaveLength(1);
      expect(formatted.warnings).toHaveLength(1);
      expect(formatted.errors[0]).toBe(
        '[ERR_2004] KeyDefinition (123): Invalid data',
      );
      expect(formatted.warnings[0]).toBe(
        '[ERR_1002] SpfModule (456): Missing field',
      );
    });

    it('should return empty arrays when no issues', () => {
      const formatted = collector.formatForApi();

      expect(formatted.errors).toEqual([]);
      expect(formatted.warnings).toEqual([]);
    });
  });

  describe('getInsertionIssues', () => {
    it('should return only insertion phase issues', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Building error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
        entityIdentifier: '1',
        phase: ISSUE_PHASE.BUILDING,
      });
      collector.addError({
        code: ERROR_CODES.INSERTION_FAILED,
        message: 'Insertion error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
        entityIdentifier: '2',
        phase: ISSUE_PHASE.INSERTION,
      });
      collector.addWarning({
        code: ERROR_CODES.MISSING_REQUIRED_FIELD,
        message: 'Parsing warning',
        entityType: ENTITY_TYPES.SPF_MODULE,
        entityIdentifier: '3',
        phase: ISSUE_PHASE.PARSING,
      });

      const insertionIssues = collector.getInsertionIssues();

      expect(insertionIssues).toHaveLength(1);
      expect(insertionIssues[0].phase).toBe(ISSUE_PHASE.INSERTION);
    });
  });

  describe('getIssues immutability', () => {
    it('should return a copy of issues array', () => {
      collector.addError({
        code: ERROR_CODES.INVALID_ENTITY_DATA,
        message: 'Error',
        entityType: ENTITY_TYPES.KEY_DEFINITION,
        entityIdentifier: '1',
        phase: ISSUE_PHASE.BUILDING,
      });

      const issues1 = collector.getIssues();
      const issues2 = collector.getIssues();

      expect(issues1).not.toBe(issues2);
      expect(issues1).toEqual(issues2);
    });
  });
});
