/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, jest} from '@jest/globals';
import {
  IssueRenderer,
  type IdentityRead,
} from '../../../../src/application/issues/issue-renderer.js';
import {FAILED_ENTITY_REASON} from '../../../../src/application/ports/persistence/batch-read.js';
import type {UnitOfWork} from '../../../../src/application/ports/persistence/unit-of-work.js';
import type {QueryServices} from '../../../../src/application/ports/persistence/query-services/query-services.js';
import type {EntityRef} from '../../../../src/domain/identity/entity-identity.js';
import type {IssueFact} from '../../../../src/domain/issues/issue-fact.js';
import type {EntityType} from '../../../../src/shared/entity-type.js';
import {ISSUE_CODE} from '../../../../src/shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../src/shared/issues/severity.js';
import {notFoundBatch} from '../../../helpers/batch-read.js';

const FILE_ID = 42;

function subgraph(systemId: number, name?: string): EntityRef<'Subgraph'> {
  return name === undefined
    ? {entityType: 'Subgraph', systemId}
    : {entityType: 'Subgraph', systemId, identity: {name, naturalId: systemId}};
}

/** A subgraph read that finds the given subgraphs by systemId. */
function subgraphRead(names: Record<number, string>) {
  return jest.fn<IdentityRead<'Subgraph'>>(async (_fileId, systemIds) => ({
    entityType: 'Subgraph',
    items: systemIds
      .filter(id => names[id] !== undefined)
      .map(id => ({
        entityType: 'Subgraph',
        systemId: id,
        identity: {name: names[id], naturalId: id},
      })),
    failed: systemIds
      .filter(id => names[id] === undefined)
      .map(id => ({systemId: id, reason: FAILED_ENTITY_REASON.NotFound})),
  }));
}

function dataLinkIntegrity(
  source: EntityRef<'Subgraph'>,
  destination: EntityRef<'Subgraph'>,
): IssueFact {
  return {
    code: ISSUE_CODE.ROUTING_PREVAL_DATALINK_INTEGRITY,
    severity: IssueSeverity.Error,
    impactedEntity: {entityType: 'DataLink', systemId: 0x9},
    relatedEntities: {source, destination},
  };
}

describe('IssueRenderer', () => {
  it('names entities by their read identity and keeps identities the fact has', async () => {
    const read = subgraphRead({6: 'Speaker out'});
    const renderer = new IssueRenderer({Subgraph: read}, FILE_ID);

    const [issue] = await renderer.render([
      dataLinkIntegrity(subgraph(5, 'Mic in'), subgraph(6)),
    ]);

    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(FILE_ID, [6]);
    expect(issue.message).toBe(
      'DataLink with systemId: 0x00000009 connects ' +
        "Subgraph 'Mic in' (0x00000005) to " +
        "Subgraph 'Speaker out' (0x00000006), but one or both of these " +
        'subgraphs are missing from the use case.',
    );
    expect(issue.relatedEntities).toEqual({
      source: {
        entityType: 'Subgraph',
        systemId: 5,
        displayName: "Subgraph 'Mic in' (0x00000005)",
      },
      destination: {
        entityType: 'Subgraph',
        systemId: 6,
        displayName: "Subgraph 'Speaker out' (0x00000006)",
      },
    });
  });

  it('reads each entity type once for all facts, without repeating IDs', async () => {
    const read = subgraphRead({5: 'A', 6: 'B', 7: 'C'});
    const renderer = new IssueRenderer({Subgraph: read}, FILE_ID);

    await renderer.render([
      dataLinkIntegrity(subgraph(5), subgraph(6)),
      dataLinkIntegrity(subgraph(6), subgraph(7)),
    ]);

    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith(FILE_ID, [5, 6, 7]);
  });

  it('names a deleted entity by the identity its failed read returns', async () => {
    const read = jest.fn<IdentityRead<'Subgraph'>>(async () => ({
      entityType: 'Subgraph',
      items: [],
      failed: [
        {
          systemId: 6,
          reason: FAILED_ENTITY_REASON.NotFound,
          identity: {name: 'Removed', naturalId: 6},
        },
      ],
    }));
    const renderer = new IssueRenderer({Subgraph: read}, FILE_ID);

    const [issue] = await renderer.render([
      dataLinkIntegrity(subgraph(5, 'Mic in'), subgraph(6)),
    ]);

    expect(issue.relatedEntities).toMatchObject({
      destination: {displayName: "Subgraph 'Removed' (0x00000006)"},
    });
  });

  it('falls back to the systemId when an entity is not found', async () => {
    const renderer = new IssueRenderer({Subgraph: subgraphRead({})}, FILE_ID);

    const [issue] = await renderer.render([
      dataLinkIntegrity(subgraph(5), subgraph(6)),
    ]);

    expect(issue.relatedEntities).toMatchObject({
      source: {displayName: 'Subgraph with systemId: 0x00000005'},
      destination: {displayName: 'Subgraph with systemId: 0x00000006'},
    });
  });

  it('renders each entity in a list of groups', async () => {
    const renderer = new IssueRenderer(
      {Subgraph: subgraphRead({5: 'A', 6: 'B'})},
      FILE_ID,
    );

    const [issue] = await renderer.render([
      {
        code: ISSUE_CODE.ROUTING_DFS_NO_VALID_COMBINATION,
        severity: IssueSeverity.Error,
        impactedEntity: subgraph(5),
        relatedEntities: {
          path: [subgraph(5), subgraph(6)],
          conflicts: [
            {
              key: {entityType: 'KeyDefinition', systemId: 0x10},
              subgraphs: [subgraph(5), subgraph(6)],
            },
          ],
        },
      },
    ]);

    expect(issue.relatedEntities).toMatchObject({
      conflicts: [
        {
          key: {displayName: 'Key with systemId: 0x00000010'},
          subgraphs: [
            {displayName: "Subgraph 'A' (0x00000005)"},
            {displayName: "Subgraph 'B' (0x00000006)"},
          ],
        },
      ],
    });
    expect(issue.message).toBe(
      'No combination of subgraph key values works for the routing path ' +
        "starting at Subgraph 'A' (0x00000005), because subgraphs on it " +
        'have different values for the same keys.',
    );
  });

  it('describes fix options and passes their command payload through', async () => {
    const usecase: EntityRef<'UseCase'> = {
      entityType: 'UseCase',
      systemId: 3,
      identity: {alias: 'Playback', gkv: []},
    };
    const renderer = new IssueRenderer({}, FILE_ID);

    const [issue] = await renderer.render([
      {
        code: ISSUE_CODE.ROUTING_SAME_GKV_CHOICE_REQUIRED,
        severity: IssueSeverity.Error,
        relatedEntities: {gkvValues: []},
        params: {collisionId: 'c-1'},
        fixOptions: [
          {
            id: 'select-candidate-1',
            kind: 'SELECT_CANDIDATE',
            commandType: 'RESOLVE_SAME_GKV_COLLISION',
            commandPayload: {collisionId: 'c-1', candidateIndex: 0},
            requiredClientInputs: [],
            relatedEntities: {usecase, subgraphs: []},
            params: {candidateNumber: 1},
          },
          {
            id: 'keep-existing',
            kind: 'KEEP_EXISTING',
            commandType: 'RESOLVE_SAME_GKV_COLLISION',
            commandPayload: {collisionId: 'c-1'},
            requiredClientInputs: [],
            relatedEntities: {usecase, subgraphs: []},
          },
        ],
      },
    ]);

    expect(issue.fixOptions).toEqual([
      expect.objectContaining({
        kind: 'SELECT_CANDIDATE',
        description: "Replace UseCase 'Playback' [] with candidate 1.",
        commandPayload: {collisionId: 'c-1', candidateIndex: 0},
        params: {candidateNumber: 1},
      }),
      expect.objectContaining({
        kind: 'KEEP_EXISTING',
        description: "Keep UseCase 'Playback' [].",
        params: {},
      }),
    ]);
  });

  it('returns empty related entities and params when the fact has none', async () => {
    const renderer = new IssueRenderer({}, FILE_ID);

    const [issue] = await renderer.render([
      {
        code: ISSUE_CODE.ROUTING_ISLAND_DETECTED,
        severity: IssueSeverity.Warning,
        impactedEntity: subgraph(5, 'Mic in'),
      },
    ]);

    expect(issue).toEqual({
      code: ISSUE_CODE.ROUTING_ISLAND_DETECTED,
      severity: IssueSeverity.Warning,
      message:
        "Subgraph 'Mic in' (0x00000005) has no data links to other " +
        'subgraphs in its use case.',
      impactedEntity: {
        entityType: 'Subgraph',
        systemId: 5,
        displayName: "Subgraph 'Mic in' (0x00000005)",
      },
      relatedEntities: {},
      params: {},
    });
  });

  it('makes no reads when there are no facts', async () => {
    const read = subgraphRead({});
    const renderer = new IssueRenderer({Subgraph: read}, FILE_ID);

    expect(await renderer.render([])).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });
});

describe('IssueRenderer.forUnitOfWork', () => {
  it.each([
    ['UseCase', 'getUsecaseRepository', 'findUseCaseIdentities'],
    ['Subgraph', 'getSubgraphRepository', 'findSubgraphIdentities'],
    ['SpfModule', 'getModuleRepository', 'findSpfModuleIdentities'],
    ['Container', 'getContainerRepository', 'findContainerIdentities'],
    ['Subsystem', 'getSubsystemRepository', 'findSubsystemIdentities'],
    ['DataPort', 'getModuleRepository', 'findDataPortIdentities'],
    ['ControlPort', 'getModuleRepository', 'findControlPortIdentities'],
    ['DataLink', 'getDataLinkRepository', 'findDataLinkIdentities'],
    ['ControlLink', 'getControlLinkRepository', 'findControlLinkIdentities'],
    ['Ckv', 'getModuleRepository', 'findCkvIdentities'],
    ['Tag', 'getModuleRepository', 'findTagIdentities'],
    ['Tkv', 'getModuleRepository', 'findTkvIdentities'],
    [
      'KeyDefinition',
      'getKeyValueDefinitionRepository',
      'findKeyDefinitionIdentities',
    ],
    [
      'ValueDefinition',
      'getKeyValueDefinitionRepository',
      'findValueDefinitionIdentities',
    ],
    [
      'TagDefinition',
      'getTagDefinitionRepository',
      'findTagDefinitionIdentities',
    ],
    [
      'SpfModuleDefinition',
      'getModuleDefinitionRepository',
      'findSpfModuleDefinitionIdentities',
    ],
    [
      'SpfModuleParameterDefinition',
      'getModuleDefinitionRepository',
      'findSpfModuleParameterDefinitionIdentities',
    ],
  ] as const)(
    'reads a %s through %s().%s',
    async (entityType: EntityType, getter, method) => {
      const read = jest.fn(async () => notFoundBatch(entityType, 7));
      const uow = {
        getWriteContext: () => ({
          session: {sessionId: 1, fileSystemId: FILE_ID},
        }),
        [getter]: () => ({[method]: read}),
      } as unknown as UnitOfWork;

      await IssueRenderer.forUnitOfWork(uow).render([
        {
          code: ISSUE_CODE.ENTITY_NOT_FOUND,
          severity: IssueSeverity.Error,
          impactedEntity: {entityType, systemId: 7} as EntityRef,
        },
      ]);

      expect(read).toHaveBeenCalledWith(FILE_ID, [7]);
    },
  );
});

describe('IssueRenderer.forQueryServices', () => {
  it.each([
    ['UseCase', 'useCaseQueryService', 'findUseCaseIdentities'],
    ['Subgraph', 'subgraphQueryService', 'findSubgraphIdentities'],
    ['Container', 'containerQueryService', 'findContainerIdentities'],
    ['DataPort', 'nodeQueryService', 'findDataPortIdentities'],
    ['ControlPort', 'nodeQueryService', 'findControlPortIdentities'],
    ['DataLink', 'dataLinkQueryService', 'findDataLinkIdentities'],
    ['ControlLink', 'controlLinkQueryService', 'findControlLinkIdentities'],
    ['Ckv', 'spfModuleQueryService', 'findCkvIdentities'],
    ['Tag', 'spfModuleQueryService', 'findTagIdentities'],
    ['Tkv', 'spfModuleQueryService', 'findTkvIdentities'],
    ['KeyDefinition', 'keyValueDefQueryService', 'findKeyDefinitionIdentities'],
    [
      'ValueDefinition',
      'keyValueDefQueryService',
      'findValueDefinitionIdentities',
    ],
    [
      'TagDefinition',
      'tagDefinitionQueryService',
      'findTagDefinitionIdentities',
    ],
    [
      'SpfModuleDefinition',
      'spfModuleDefinitionQueryService',
      'findSpfModuleDefinitionIdentities',
    ],
    [
      'SpfModuleParameterDefinition',
      'spfModuleDefinitionQueryService',
      'findSpfModuleParameterDefinitionIdentities',
    ],
  ] as const)(
    'reads a %s through %s.%s',
    async (entityType: EntityType, service, method) => {
      const read = jest.fn(async () => notFoundBatch(entityType, 7));
      const qs = {[service]: {[method]: read}} as unknown as QueryServices;

      await IssueRenderer.forQueryServices(qs, FILE_ID).render([
        {
          code: ISSUE_CODE.ENTITY_NOT_FOUND,
          severity: IssueSeverity.Error,
          impactedEntity: {entityType, systemId: 7} as EntityRef,
        },
      ]);

      expect(read).toHaveBeenCalledWith(FILE_ID, [7]);
    },
  );

  it.each(['SpfModule', 'Subsystem'] as const)(
    'names a %s by the systemId fallback, without a read',
    async entityType => {
      const qs = {} as QueryServices;

      const [issue] = await IssueRenderer.forQueryServices(qs, FILE_ID).render([
        {
          code: ISSUE_CODE.ENTITY_NOT_FOUND,
          severity: IssueSeverity.Error,
          impactedEntity: {entityType, systemId: 0x2a},
        },
      ]);

      expect(issue.message).toMatch(
        / with systemId: 0x0000002A was not found in this project\.$/,
      );
    },
  );
});

describe('IssueRenderer.renderWithoutReads', () => {
  it('names each reference by its own identity, or by the systemId fallback', () => {
    const [issue] = IssueRenderer.renderWithoutReads([
      dataLinkIntegrity(subgraph(5, 'Mic in'), subgraph(6)),
    ]);

    expect(issue.message).toBe(
      'DataLink with systemId: 0x00000009 connects ' +
        "Subgraph 'Mic in' (0x00000005) to " +
        'Subgraph with systemId: 0x00000006, but one or both of these ' +
        'subgraphs are missing from the use case.',
    );
  });
});
