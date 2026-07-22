/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CLIENT_INPUT_TYPE,
  ISSUE_ENTITY_TYPE,
  IssueCategory,
  IssueSeverity,
  type Issue,
  type ValidationIssue,
} from '@arc/core';
import {
  toApiIssueItem,
  toApiIssueItems,
} from '../../../../../../../src/presentation/rest/common/dto/api-response/api-issue-item.mapper.js';
import {ApiImpactedEntityDto} from '../../../../../../../src/presentation/rest/common/dto/api-response/api-issue-item.dto.js';

describe('api-issue-item.mapper', () => {
  describe('toApiIssueItem', () => {
    it('projects an operational Issue with only code/message/severity', () => {
      const issue: Issue = {
        code: 'ENTITY_NOT_FOUND',
        message: 'SpfModule not found (systemId: 42)',
        severity: IssueSeverity.Error,
      };

      const dto = toApiIssueItem(issue);

      expect(dto.code).toBe('ENTITY_NOT_FOUND');
      expect(dto.message).toBe('SpfModule not found (systemId: 42)');
      expect(dto.severity).toBe(IssueSeverity.Error);
      expect(dto.category).toBeUndefined();
      expect(dto.impactedEntity).toBeUndefined();
      expect(dto.impactedUsecases).toBeUndefined();
      expect(dto.fixOptions).toBeUndefined();
    });

    it('projects a full ValidationIssue and drops name/defaultSeverity', () => {
      const rule: ValidationIssue = {
        code: 'ARC-MOD-001',
        name: 'Missing Module Definition',
        message:
          "Module 'PCM Decoder' references missing definition 0x07010105",
        severity: IssueSeverity.Error,
        defaultSeverity: IssueSeverity.Error,
        category: IssueCategory.Blocking,
        impactedEntity: {
          entityType: ISSUE_ENTITY_TYPE.SpfModule,
          systemId: 1001,
          displayName: 'PCM Decoder',
        },
        impactedUsecases: [101, 102],
        fixOptions: [],
      };

      const dto = toApiIssueItem(rule);

      // Base fields project through
      expect(dto.code).toBe('ARC-MOD-001');
      expect(dto.severity).toBe(IssueSeverity.Error);
      expect(dto.category).toBe(IssueCategory.Blocking);
      expect(dto.impactedUsecases).toEqual([101, 102]);
      // ValidationIssue-only fields are absent
      expect((dto as unknown as {name?: unknown}).name).toBeUndefined();
      expect(
        (dto as unknown as {defaultSeverity?: unknown}).defaultSeverity,
      ).toBeUndefined();
      // Empty fixOptions collapses — mapper omits when length === 0
      expect(dto.fixOptions).toBeUndefined();
    });

    it('projects impactedEntity as a nested ApiImpactedEntityDto instance', () => {
      const issue: Issue = {
        code: 'DB_QUERY_FAILED',
        message: 'boom',
        severity: IssueSeverity.Error,
        impactedEntity: {
          entityType: ISSUE_ENTITY_TYPE.Container,
          systemId: 601,
        },
      };

      const dto = toApiIssueItem(issue);

      expect(dto.impactedEntity).toBeInstanceOf(ApiImpactedEntityDto);
      expect(dto.impactedEntity?.entityType).toBe(ISSUE_ENTITY_TYPE.Container);
      expect(dto.impactedEntity?.systemId).toBe('601');
      expect(dto.impactedEntity?.displayName).toBeUndefined();
    });

    it('projects fixOptions with client-input specs', () => {
      const issue: Issue = {
        code: 'ARC-INSERT-LINK-001',
        message: 'Duplicate data link',
        severity: IssueSeverity.Warning,
        category: IssueCategory.DataLoss,
        impactedEntity: {
          entityType: ISSUE_ENTITY_TYPE.DataLink,
          systemId: 4001,
        },
        fixOptions: [
          {
            id: 'delete-duplicate-link',
            description: 'Delete the duplicate link',
            commandType: 'DELETE_LINK',
            commandPayload: {linkId: 4001},
            requiredClientInputs: [
              {
                field: 'confirm',
                label: 'Confirm deletion',
                type: CLIENT_INPUT_TYPE.Boolean,
              },
            ],
          },
        ],
      };

      const dto = toApiIssueItem(issue);

      expect(dto.fixOptions).toHaveLength(1);
      expect(dto.fixOptions?.[0].id).toBe('delete-duplicate-link');
      expect(dto.fixOptions?.[0].commandPayload).toEqual({linkId: 4001});
      expect(dto.fixOptions?.[0].requiredClientInputs).toEqual([
        {
          field: 'confirm',
          label: 'Confirm deletion',
          type: CLIENT_INPUT_TYPE.Boolean,
        },
      ]);
    });
  });

  describe('toApiIssueItems', () => {
    it('returns undefined for undefined input', () => {
      expect(toApiIssueItems(undefined)).toBeUndefined();
    });

    it('returns undefined for empty array input', () => {
      expect(toApiIssueItems([])).toBeUndefined();
    });

    it('maps a non-empty readonly array element-wise', () => {
      const issues: readonly Issue[] = [
        {code: 'A', message: 'a', severity: IssueSeverity.Warning},
        {code: 'B', message: 'b', severity: IssueSeverity.Error},
      ];

      const dtos = toApiIssueItems(issues);

      expect(dtos).toHaveLength(2);
      expect(dtos?.[0].code).toBe('A');
      expect(dtos?.[1].severity).toBe(IssueSeverity.Error);
    });
  });
});
