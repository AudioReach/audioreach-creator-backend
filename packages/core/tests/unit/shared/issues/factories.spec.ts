/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {IssueFactory} from '../../../../src/shared/issues/factories.js';
import {
  IssueSeverity,
  IssueCategory,
} from '../../../../src/shared/issues/severity.js';
import {ISSUE_ENTITY_TYPE} from '../../../../src/shared/issues/impacted-entity.js';
import type {FixOption} from '../../../../src/shared/issues/fix-option.js';

describe('IssueFactory', () => {
  describe('notFound', () => {
    it('should produce an ENTITY_NOT_FOUND issue with severity Error', () => {
      const issue = IssueFactory.notFound(ISSUE_ENTITY_TYPE.SpfModule, 42);

      expect(issue.code).toBe('ENTITY_NOT_FOUND');
      expect(issue.message).toBe('SpfModule not found (systemId: 42)');
      expect(issue.severity).toBe(IssueSeverity.Error);
      expect(issue.impactedEntity).toEqual({
        entityType: ISSUE_ENTITY_TYPE.SpfModule,
        systemId: 42,
      });
    });

    it('should include displayName in impactedEntity when provided', () => {
      const issue = IssueFactory.notFound(
        ISSUE_ENTITY_TYPE.DataLink,
        7,
        'MicToSpeaker',
      );

      expect(issue.impactedEntity).toEqual({
        entityType: ISSUE_ENTITY_TYPE.DataLink,
        systemId: 7,
        displayName: 'MicToSpeaker',
      });
    });

    it('should omit displayName when not provided', () => {
      const issue = IssueFactory.notFound(ISSUE_ENTITY_TYPE.Container, 3);

      expect(issue.impactedEntity).not.toHaveProperty('displayName');
    });
  });

  describe('dbError', () => {
    it('should produce a DB_QUERY_FAILED issue with severity Error', () => {
      const issue = IssueFactory.dbError('connection timeout');

      expect(issue.code).toBe('DB_QUERY_FAILED');
      expect(issue.message).toBe('connection timeout');
      expect(issue.severity).toBe(IssueSeverity.Error);
      expect(issue.impactedEntity).toBeUndefined();
    });

    it('should attach impactedEntity when provided', () => {
      const issue = IssueFactory.dbError('row missing', {
        entityType: ISSUE_ENTITY_TYPE.Subgraph,
        systemId: 11,
      });

      expect(issue.impactedEntity).toEqual({
        entityType: ISSUE_ENTITY_TYPE.Subgraph,
        systemId: 11,
      });
    });
  });

  describe('parseError', () => {
    it('should produce an issue with the caller-supplied code and message', () => {
      const issue = IssueFactory.parseError(
        'ACDB_CHUNK_MALFORMED',
        'chunk size mismatch',
      );

      expect(issue.code).toBe('ACDB_CHUNK_MALFORMED');
      expect(issue.message).toBe('chunk size mismatch');
      expect(issue.severity).toBe(IssueSeverity.Error);
      expect(issue.impactedEntity).toBeUndefined();
      expect(issue.category).toBeUndefined();
    });
  });

  describe('dataLoss', () => {
    it('should produce a Warning + DATA_LOSS issue with impactedEntity', () => {
      const issue = IssueFactory.dataLoss(
        'ARC-INSERT-MOD-001',
        'duplicate instance id',
        {
          entityType: ISSUE_ENTITY_TYPE.SpfModule,
          systemId: 99,
          displayName: 'AudioMixer',
        },
      );

      expect(issue.code).toBe('ARC-INSERT-MOD-001');
      expect(issue.message).toBe('duplicate instance id');
      expect(issue.severity).toBe(IssueSeverity.Warning);
      expect(issue.category).toBe(IssueCategory.DataLoss);
      expect(issue.impactedEntity).toEqual({
        entityType: ISSUE_ENTITY_TYPE.SpfModule,
        systemId: 99,
        displayName: 'AudioMixer',
      });
      expect(issue.fixOptions).toBeUndefined();
    });

    it('should attach non-empty fixOptions when provided', () => {
      const fixOptions: FixOption[] = [
        {
          id: 'delete-duplicate',
          description: 'Delete the duplicate',
          commandType: 'DELETE_MODULE',
          commandPayload: {systemId: 99},
          requiredClientInputs: [],
        },
      ];

      const issue = IssueFactory.dataLoss(
        'ARC-INSERT-MOD-001',
        'duplicate instance id',
        {entityType: ISSUE_ENTITY_TYPE.SpfModule, systemId: 99},
        fixOptions,
      );

      expect(issue.fixOptions).toEqual(fixOptions);
    });

    it('should omit fixOptions when an empty array is provided', () => {
      const issue = IssueFactory.dataLoss(
        'ARC-INSERT-MOD-002',
        'missing definition',
        {entityType: ISSUE_ENTITY_TYPE.SpfModule, systemId: 12},
        [],
      );

      expect(issue.fixOptions).toBeUndefined();
    });
  });
});
