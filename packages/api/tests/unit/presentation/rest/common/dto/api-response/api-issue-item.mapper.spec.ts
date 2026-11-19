/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CLIENT_INPUT_TYPE,
  ENTITY_TYPE,
  ISSUE_CODE,
  IssueCategory,
  IssueSeverity,
  type Issue,
  type LegacyIssue,
  type ValidationIssue,
} from '@arc/core';
import {
  toApiIssueItem,
  toApiIssueItems,
} from '../../../../../../../src/presentation/rest/common/dto/api-response/api-issue-item.mapper.js';

describe('api-issue-item.mapper', () => {
  describe('toApiIssueItem', () => {
    it('projects an operational Issue with only code/message/severity', () => {
      const issue: LegacyIssue = {
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
          entityType: ENTITY_TYPE.SpfModule,
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
      expect(dto.impactedUsecases).toEqual([
        {entityType: ENTITY_TYPE.UseCase, systemId: '101'},
        {entityType: ENTITY_TYPE.UseCase, systemId: '102'},
      ]);
      // ValidationIssue-only fields are absent
      expect((dto as unknown as {name?: unknown}).name).toBeUndefined();
      expect(
        (dto as unknown as {defaultSeverity?: unknown}).defaultSeverity,
      ).toBeUndefined();
      // Empty fixOptions collapses — mapper omits when length === 0
      expect(dto.fixOptions).toBeUndefined();
    });

    it('projects impactedEntity with its systemId as a string', () => {
      const issue: LegacyIssue = {
        code: 'DB_QUERY_FAILED',
        message: 'boom',
        severity: IssueSeverity.Error,
        impactedEntity: {
          entityType: ENTITY_TYPE.Container,
          systemId: 601,
        },
      };

      const dto = toApiIssueItem(issue);

      expect(dto.impactedEntity?.entityType).toBe(ENTITY_TYPE.Container);
      expect(dto.impactedEntity?.systemId).toBe('601');
      expect(dto.impactedEntity?.displayName).toBeUndefined();
    });

    it('projects fixOptions with client-input specs', () => {
      const issue: LegacyIssue = {
        code: 'ARC-INSERT-LINK-001',
        message: 'Duplicate data link',
        severity: IssueSeverity.Warning,
        category: IssueCategory.DataLoss,
        impactedEntity: {
          entityType: ENTITY_TYPE.DataLink,
          systemId: 4001,
        },
        fixOptions: [
          {
            systemId: 'delete-duplicate-link',
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
      expect(dto.fixOptions?.[0].kind).toBeUndefined();
      expect(dto.fixOptions?.[0].commandPayload).toEqual({linkId: 4001});
      expect(dto.fixOptions?.[0].requiredClientInputs).toEqual([
        {
          field: 'confirm',
          label: 'Confirm deletion',
          type: CLIENT_INPUT_TYPE.Boolean,
        },
      ]);
    });

    it('projects a legacy issue without relatedEntities or params', () => {
      const issue: LegacyIssue = {
        code: 'A',
        message: 'a',
        severity: IssueSeverity.Warning,
      };

      const dto = toApiIssueItem(issue);

      expect('relatedEntities' in dto).toBe(false);
      expect('params' in dto).toBe(false);
    });
  });

  describe('toApiIssueItem with a rendered issue', () => {
    const subgraph = (systemId: number, alias: string) => ({
      entityType: ENTITY_TYPE.Subgraph,
      systemId,
      displayName: `Subgraph '${alias}' (0x${systemId.toString(16)})`,
    });

    it('projects related entities in each form with string systemIds', () => {
      const issue: Issue = {
        code: ISSUE_CODE.ROUTING_DFS_NO_VALID_COMBINATION,
        message: 'No valid combination',
        severity: IssueSeverity.Error,
        relatedEntities: {
          path: [subgraph(5, 'Mic'), subgraph(6, 'Speaker')],
          conflicts: [
            {
              key: {
                entityType: ENTITY_TYPE.KeyDefinition,
                systemId: 16,
                displayName: "Key 'Device'",
              },
              subgraphs: [subgraph(5, 'Mic'), subgraph(6, 'Speaker')],
            },
          ],
        },
        params: {},
      };

      const dto = toApiIssueItem(issue);

      expect(dto.relatedEntities).toEqual({
        path: [
          {
            entityType: ENTITY_TYPE.Subgraph,
            systemId: '5',
            displayName: "Subgraph 'Mic' (0x5)",
          },
          {
            entityType: ENTITY_TYPE.Subgraph,
            systemId: '6',
            displayName: "Subgraph 'Speaker' (0x6)",
          },
        ],
        conflicts: [
          {
            key: {
              entityType: ENTITY_TYPE.KeyDefinition,
              systemId: '16',
              displayName: "Key 'Device'",
            },
            subgraphs: [
              {
                entityType: ENTITY_TYPE.Subgraph,
                systemId: '5',
                displayName: "Subgraph 'Mic' (0x5)",
              },
              {
                entityType: ENTITY_TYPE.Subgraph,
                systemId: '6',
                displayName: "Subgraph 'Speaker' (0x6)",
              },
            ],
          },
        ],
      });
      expect('params' in dto).toBe(false);
    });

    it('projects a single related entity and params', () => {
      const issue: Issue = {
        code: ISSUE_CODE.ROUTING_EC_MULTIPLE_LINKS,
        message: 'Multiple EC links',
        severity: IssueSeverity.Error,
        impactedEntity: {
          entityType: ENTITY_TYPE.UseCase,
          systemId: 9,
          displayName: "Use case 'Call'",
        },
        relatedEntities: {
          ecDataLinks: [
            {
              entityType: ENTITY_TYPE.DataLink,
              systemId: 32,
              displayName: 'Data link 0x20',
            },
          ],
        },
        params: {pairCount: 2},
      };

      const dto = toApiIssueItem(issue);

      expect(dto.impactedEntity).toEqual({
        entityType: ENTITY_TYPE.UseCase,
        systemId: '9',
        displayName: "Use case 'Call'",
      });
      expect(dto.relatedEntities).toEqual({
        ecDataLinks: [
          {
            entityType: ENTITY_TYPE.DataLink,
            systemId: '32',
            displayName: 'Data link 0x20',
          },
        ],
      });
      expect(dto.params).toEqual({pairCount: 2});
    });

    it('omits empty relatedEntities and params', () => {
      const issue: Issue = {
        code: ISSUE_CODE.ROUTING_CYCLE_DETECTED,
        message: 'Cycle',
        severity: IssueSeverity.Error,
        relatedEntities: {},
        params: {},
      };

      const dto = toApiIssueItem(issue);

      expect('relatedEntities' in dto).toBe(false);
      expect('params' in dto).toBe(false);
    });

    it('projects impactedUsecases with their display names', () => {
      const issue: Issue = {
        code: ISSUE_CODE.ROUTING_CYCLE_DETECTED,
        message: 'Cycle',
        severity: IssueSeverity.Error,
        relatedEntities: {},
        params: {},
        impactedUsecases: [
          {
            entityType: ENTITY_TYPE.UseCase,
            systemId: 9,
            displayName: "Use case 'Call'",
          },
        ],
      };

      const dto = toApiIssueItem(issue);

      expect(dto.impactedUsecases).toEqual([
        {
          entityType: ENTITY_TYPE.UseCase,
          systemId: '9',
          displayName: "Use case 'Call'",
        },
      ]);
    });

    it('projects fix options with kind, related entities, and params', () => {
      const issue: Issue = {
        code: ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED,
        message: 'Choose',
        severity: IssueSeverity.Error,
        relatedEntities: {gkvValues: []},
        params: {collisionId: 'c-1'},
        fixOptions: [
          {
            id: 'select-candidate-1',
            kind: 'SELECT_CANDIDATE',
            description: 'Select candidate 1',
            relatedEntities: {subgraphs: [subgraph(5, 'Mic')]},
            params: {candidateNumber: 1},
            commandType: 'RESOLVE_COLLISION',
            commandPayload: {collisionId: 'c-1'},
            requiredClientInputs: [],
          },
        ],
      };

      const dto = toApiIssueItem(issue);

      expect(dto.relatedEntities).toEqual({gkvValues: []});
      expect(dto.params).toEqual({collisionId: 'c-1'});
      expect(dto.fixOptions).toEqual([
        {
          id: 'select-candidate-1',
          kind: 'SELECT_CANDIDATE',
          description: 'Select candidate 1',
          relatedEntities: {
            subgraphs: [
              {
                entityType: ENTITY_TYPE.Subgraph,
                systemId: '5',
                displayName: "Subgraph 'Mic' (0x5)",
              },
            ],
          },
          params: {candidateNumber: 1},
          commandType: 'RESOLVE_COLLISION',
          commandPayload: {collisionId: 'c-1'},
          requiredClientInputs: [],
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
      const issues: readonly LegacyIssue[] = [
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
