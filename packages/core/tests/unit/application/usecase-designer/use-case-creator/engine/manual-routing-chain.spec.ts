/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {
  CHANGE_OPERATION,
  SOURCE,
  type Source,
} from '../../../../../../src/application/shared/change-vocabulary.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import type {
  ActiveManualUsecaseEdit,
  ReferencedComponents,
  StructuralDelta,
  UsecaseSgkvAssignment,
} from '../../../../../../src/application/ports/persistence/repositories/usecase/usecase.repository.js';
import {CreateManualUsecasesCommand} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/create-manual-usecases.command.js';
import {CreateManualUsecasesHandler} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/create-manual-usecases.handler.js';
import {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {CONTROL_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/control-link-type.js';
import {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {
  USECASE_TYPE,
  type UsecaseType,
} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase-type.js';

const FILE_ID = 1;

interface RecordedWrite {
  readonly changeId: number;
  readonly operation:
    | typeof CHANGE_OPERATION.Create
    | typeof CHANGE_OPERATION.Update
    | typeof CHANGE_OPERATION.Delete;
  readonly usecaseSystemId: number;
  readonly usecase: UseCase | null;
  readonly options: {readonly source: Source} | undefined;
  readonly referencedComponents: ReferencedComponents | undefined;
  readonly assignments: readonly UsecaseSgkvAssignment[] | undefined;
  readonly delta?: StructuralDelta;
}

interface FixtureSeed {
  readonly subgraphs: readonly Subgraph[];
  readonly dataLinks?: readonly DataLink[];
  readonly controlLinks?: readonly ControlLink[];
  readonly committedUsecases?: readonly UseCase[];
  readonly selectedOverlayUsecases?: readonly UseCase[];
  readonly activeManualUsecaseEdits?: readonly ActiveManualUsecaseEdit[];
  readonly valueKeyDefinitions?: Readonly<Record<number, number>>;
}

interface CommandSubgraph {
  readonly systemId: number;
  readonly sgkvs?: readonly (readonly number[])[];
}

function subgraph(systemId: number): Subgraph {
  return new Subgraph({
    systemId,
    naturalId: systemId,
    name: `sg-${systemId}`,
    isImported: false,
    fileSystemId: FILE_ID,
  });
}

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  linkType = DATA_LINK_TYPE.Normal,
): DataLink {
  return new DataLink({
    systemId,
    sourceNodeSystemId: systemId * 10 + 1,
    destinationNodeSystemId: systemId * 10 + 2,
    sourcePortSystemId: systemId * 10 + 3,
    destinationPortSystemId: systemId * 10 + 4,
    linkType,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    fileSystemId: FILE_ID,
  });
}

function controlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): ControlLink {
  return new ControlLink(
    systemId,
    FILE_ID,
    systemId * 10 + 1,
    systemId * 10 + 2,
    systemId * 10 + 3,
    systemId * 10 + 4,
    0,
    CONTROL_LINK_TYPE.Normal,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  );
}

function usecase(input: {
  readonly systemId: number;
  readonly gkv: readonly number[];
  readonly members: readonly number[];
  readonly pairs: readonly (readonly [number, number])[];
  readonly type?: UsecaseType;
}): UseCase {
  return new UseCase({
    systemId: input.systemId,
    fileSystemId: FILE_ID,
    keyVector: {valueSystemIds: [...input.gkv]},
    subgraphSystemIds: [...input.members],
    subgraphPairs: input.pairs.map(
      ([sourceSubgraphSystemId, destSubgraphSystemId]) => ({
        sourceSubgraphSystemId,
        destSubgraphSystemId,
      }),
    ),
    type: input.type ?? USECASE_TYPE.Linked,
  });
}

function manualUpdate(
  changeId: number,
  value: UseCase,
  referencedComponents: ReferencedComponents,
): ActiveManualUsecaseEdit {
  return {
    changeId,
    operation: CHANGE_OPERATION.Update,
    usecase: value,
    referencedComponents,
  };
}

function command(
  activeSubgraphs: readonly CommandSubgraph[],
  options: {
    readonly selectedUsecaseSystemIds?: readonly number[];
    readonly excludedDataLinkSystemIds?: readonly number[];
    readonly excludedControlLinkSystemIds?: readonly number[];
  } = {},
): CreateManualUsecasesCommand {
  return new CreateManualUsecasesCommand(FILE_ID, {
    selectedUsecaseSystemIds: (options.selectedUsecaseSystemIds ?? []).map(
      String,
    ),
    activeSubgraphs: activeSubgraphs.map(item => ({
      systemId: String(item.systemId),
      valueSystemIds: (item.sgkvs ?? []).map(values => values.map(String)),
    })),
    excludedDataLinkSystemIds: (options.excludedDataLinkSystemIds ?? []).map(
      String,
    ),
    excludedControlLinkSystemIds: (
      options.excludedControlLinkSystemIds ?? []
    ).map(String),
  });
}

function createManualRoutingFixture(seed: FixtureSeed) {
  const committedUsecases = [...(seed.committedUsecases ?? [])];
  const selectedOverlayUsecases = new Map(
    (seed.selectedOverlayUsecases ?? committedUsecases).map(item => [
      item.systemId,
      item,
    ]),
  );
  const seededActiveEdits = [...(seed.activeManualUsecaseEdits ?? [])];
  const committedWrites: RecordedWrite[] = [];
  let pendingWrites: RecordedWrite[] = [];
  let inTransaction = false;
  let nextUsecaseSystemId = 1_000;
  let nextChangeId = 5_000;
  let commits = 0;
  let rollbacks = 0;
  const activeManualReadSizes: number[] = [];

  const activeManualEdits = (): ActiveManualUsecaseEdit[] => {
    const edits = [...seededActiveEdits];
    for (const write of committedWrites) {
      if (
        write.usecase !== null &&
        (write.operation === CHANGE_OPERATION.Create ||
          write.operation === CHANGE_OPERATION.Update)
      ) {
        edits.push({
          changeId: write.changeId,
          operation: write.operation,
          usecase: write.usecase,
          referencedComponents: write.referencedComponents ?? null,
        });
      }
    }
    return edits;
  };

  const effectiveUsecase = (systemId: number): UseCase | undefined => {
    const active = [...activeManualEdits()]
      .reverse()
      .find(edit => edit.usecase?.systemId === systemId);
    return (
      active?.usecase ??
      selectedOverlayUsecases.get(systemId) ??
      committedUsecases.find(item => item.systemId === systemId)
    );
  };

  const usecaseRepository = {
    findWithActiveManualEdits: async () => {
      const edits = activeManualEdits();
      activeManualReadSizes.push(edits.length);
      return edits;
    },
    findBySystemIds: async (
      _fileSystemId: number,
      systemIds: readonly number[],
    ) =>
      systemIds
        .map(systemId => effectiveUsecase(systemId))
        .filter((item): item is UseCase => item !== undefined),
    findAll: async () => [...committedUsecases],
    create: async (
      created: UseCase,
      options?: {readonly source: Source},
      referencedComponents?: ReferencedComponents,
      assignments?: readonly UsecaseSgkvAssignment[],
    ) => {
      const write: RecordedWrite = {
        changeId: nextChangeId++,
        operation: CHANGE_OPERATION.Create,
        usecaseSystemId: created.systemId,
        usecase: created,
        options,
        referencedComponents,
        assignments,
      };
      pendingWrites.push(write);
      return {systemId: created.systemId, changeId: write.changeId};
    },
    applyStructuralChange: async (
      usecaseSystemId: number,
      delta: StructuralDelta,
      options?: {readonly source: Source},
      referencedComponents?: ReferencedComponents,
      assignments?: readonly UsecaseSgkvAssignment[],
    ) => {
      const write: RecordedWrite = {
        changeId: nextChangeId++,
        operation: CHANGE_OPERATION.Update,
        usecaseSystemId,
        usecase: effectiveUsecase(usecaseSystemId) ?? null,
        options,
        referencedComponents,
        assignments,
        delta,
      };
      pendingWrites.push(write);
      return {systemId: usecaseSystemId, changeId: write.changeId};
    },
    delete: async (
      usecaseSystemId: number,
      options?: {readonly source: Source},
    ) => {
      const write: RecordedWrite = {
        changeId: nextChangeId++,
        operation: CHANGE_OPERATION.Delete,
        usecaseSystemId,
        usecase: null,
        options,
        referencedComponents: undefined,
        assignments: undefined,
      };
      pendingWrites.push(write);
      return {systemId: usecaseSystemId, changeId: write.changeId};
    },
  };

  const subgraphRepository = {
    findChangedInSession: async () => ({added: [], deleted: []}),
    getAggregates: async (
      systemIds: readonly number[],
      _fileSystemId: number,
    ) =>
      new Map(
        seed.subgraphs
          .filter(item => systemIds.includes(item.systemId))
          .map(subgraph => [subgraph.systemId, subgraph] as const),
      ),
    getSgkvs: async () => [],
    resolveKeyValues: async (
      _fileSystemId: number,
      valueDefinitionSystemIds: readonly number[],
    ) =>
      valueDefinitionSystemIds.map(valueDefSystemId => ({
        keyDefSystemId:
          seed.valueKeyDefinitions?.[valueDefSystemId] ?? valueDefSystemId,
        valueDefSystemId,
      })),
  };
  const dataLinkRepository = {
    findChangedInSession: async () => ({added: [], deleted: []}),
    findIntraUcLinksByFile: async () => [...(seed.dataLinks ?? [])],
  };
  const controlLinkRepository = {
    findChangedInSession: async () => ({added: [], deleted: []}),
    findIntraUcLinksByFile: async () => [...(seed.controlLinks ?? [])],
  };
  const uow = {
    startTransaction: async () => {
      inTransaction = true;
      pendingWrites = [];
    },
    commit: async () => {
      committedWrites.push(...pendingWrites);
      pendingWrites = [];
      inTransaction = false;
      commits += 1;
    },
    rollback: async () => {
      pendingWrites = [];
      inTransaction = false;
      rollbacks += 1;
    },
    isInTransaction: () => inTransaction,
    getWriteContext: () => ({groupId: 'manual-routing-group'}),
    getSubgraphRepository: () => subgraphRepository,
    getDataLinkRepository: () => dataLinkRepository,
    getControlLinkRepository: () => controlLinkRepository,
    getUsecaseRepository: () => usecaseRepository,
    getModuleRepository: () => ({findModulesBySubgraphIds: async () => []}),
    getModuleDefinitionRepository: () => ({findBySystemIds: async () => []}),
    getSubsystemRepository: () => ({
      findOrphanSubsystemSystemIds: async () => [],
    }),
  };
  const idGeneration = {
    getNextId: async () => nextUsecaseSystemId++,
  };
  const handler = new CreateManualUsecasesHandler(
    uow as never,
    idGeneration as never,
  );

  const recordedWrites = () => {
    const writes = [...committedWrites];
    return {
      creates: writes.filter(
        write => write.operation === CHANGE_OPERATION.Create,
      ),
      updates: writes.filter(
        write => write.operation === CHANGE_OPERATION.Update,
      ),
      deletes: writes.filter(
        write => write.operation === CHANGE_OPERATION.Delete,
      ),
    };
  };

  return {
    handler,
    recordedWrites,
    activeManualReadSizes,
    transactionCounts: () => ({commits, rollbacks}),
  };
}

describe('manual routing chain', () => {
  it('stages once and no-ops when the identical manual command is repeated', async () => {
    const fixture = createManualRoutingFixture({
      subgraphs: [subgraph(10), subgraph(20)],
      dataLinks: [dataLink(100, 10, 20)],
    });
    const request = command([{systemId: 10, sgkvs: [[101]]}, {systemId: 20}]);

    const first = await fixture.handler.handle(request);
    const writesAfterFirst = fixture.recordedWrites();
    const second = await fixture.handler.handle(request);

    expect(first.kind).toBe(RESULT_KIND.Ok);
    expect(writesAfterFirst.creates).toHaveLength(1);
    expect(writesAfterFirst.creates[0]).toEqual(
      expect.objectContaining({
        options: {source: SOURCE.Manual},
        referencedComponents: {
          sgSystemIds: [10, 20],
          dataLinkSystemIds: [100],
          controlLinkSystemIds: [],
        },
      }),
    );
    expect(second.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.recordedWrites()).toEqual(writesAfterFirst);
    if (second.kind === RESULT_KIND.Ok)
      expect(second.data.emittedChanges).toEqual([]);
    expect(fixture.activeManualReadSizes).toEqual([0, 1]);
    expect(fixture.transactionCounts()).toEqual({commits: 2, rollbacks: 0});
  });

  it('creates distinct GKV usecases that share the one discovered topology', async () => {
    const fixture = createManualRoutingFixture({
      subgraphs: [subgraph(10), subgraph(20)],
      dataLinks: [dataLink(100, 10, 20)],
      valueKeyDefinitions: {101: 1, 102: 1},
    });

    const result = await fixture.handler.handle(
      command([{systemId: 10, sgkvs: [[101], [102]]}, {systemId: 20}]),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    const {creates} = fixture.recordedWrites();
    expect(creates).toHaveLength(2);
    expect(
      creates.map(write => write.usecase?.keyVector.valueSystemIds),
    ).toEqual([[101], [102]]);
    expect(creates.map(write => write.usecase?.subgraphPairs)).toEqual([
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
      [{sourceSubgraphSystemId: 10, destSubgraphSystemId: 20}],
    ]);
    expect(creates.map(write => write.assignments)).toEqual([
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [101]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
      ],
      [
        {subgraphSystemId: 10, valueDefinitionSystemIds: [102]},
        {subgraphSystemId: 20, valueDefinitionSystemIds: []},
      ],
    ]);
  });

  it('uses current reverse data direction authorized by a selected UseCase pair without mutating it', async () => {
    const selected = usecase({
      systemId: 700,
      gkv: [101],
      members: [10, 20],
      pairs: [[10, 20]],
    });
    const fixture = createManualRoutingFixture({
      subgraphs: [subgraph(10), subgraph(20)],
      dataLinks: [dataLink(100, 20, 10)],
      committedUsecases: [selected],
    });

    await fixture.handler.handle(
      command([{systemId: 10, sgkvs: [[101]]}, {systemId: 20}], {
        selectedUsecaseSystemIds: [700],
      }),
    );

    const writes = fixture.recordedWrites();
    expect(writes.creates).toHaveLength(1);
    expect(writes.creates[0]?.usecase?.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 10},
    ]);
    expect(writes.updates).toEqual([]);
    expect(writes.deletes).toEqual([]);
  });

  it('omits unauthorized selected-selected relationships but keeps selected-to-out relationships', async () => {
    const selected = usecase({
      systemId: 700,
      gkv: [999],
      members: [10, 20],
      pairs: [],
    });
    const fixture = createManualRoutingFixture({
      subgraphs: [subgraph(10), subgraph(20), subgraph(30)],
      dataLinks: [
        dataLink(100, 10, 20),
        dataLink(101, 10, 30),
        dataLink(102, 20, 30),
      ],
      committedUsecases: [selected],
    });

    await fixture.handler.handle(
      command(
        [{systemId: 10, sgkvs: [[101]]}, {systemId: 20}, {systemId: 30}],
        {selectedUsecaseSystemIds: [700]},
      ),
    );

    const [created] = fixture.recordedWrites().creates;
    expect(created?.usecase?.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
    ]);
    expect(created?.referencedComponents?.dataLinkSystemIds).toEqual([
      101, 102,
    ]);
  });

  it('applies control fallback per relationship and suppresses it where data was excluded', async () => {
    const fixture = createManualRoutingFixture({
      subgraphs: [subgraph(10), subgraph(20), subgraph(30)],
      dataLinks: [dataLink(100, 10, 20), dataLink(102, 10, 30)],
      controlLinks: [controlLink(200, 10, 20), controlLink(201, 20, 30)],
    });

    await fixture.handler.handle(
      command(
        [{systemId: 10, sgkvs: [[101]]}, {systemId: 20}, {systemId: 30}],
        {excludedDataLinkSystemIds: [100]},
      ),
    );

    const [created] = fixture.recordedWrites().creates;
    expect(created?.usecase?.subgraphPairs).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 30},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
    ]);
    expect(created?.referencedComponents).toEqual({
      sgSystemIds: [10, 20, 30],
      dataLinkSystemIds: [102],
      controlLinkSystemIds: [201],
    });
    expect(created?.usecase?.type).toBe(USECASE_TYPE.Island);
  });

  it('preserves a one-subgraph topology as an ISLAND and emits isolation warnings', async () => {
    const fixture = createManualRoutingFixture({subgraphs: [subgraph(10)]});

    const result = await fixture.handler.handle(
      command([{systemId: 10, sgkvs: [[101]]}]),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    const [created] = fixture.recordedWrites().creates;
    expect(created?.usecase).toEqual(
      expect.objectContaining({
        subgraphSystemIds: [10],
        subgraphPairs: [],
        type: USECASE_TYPE.Island,
      }),
    );
    if (result.kind === RESULT_KIND.Ok) {
      expect(result.data.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({code: 'ARC-ROUTING-ISLAND-DETECTED'}),
          expect.objectContaining({code: 'ARC-ROUTING-ORPHAN-SUBGRAPH'}),
        ]),
      );
    }
  });

  it('rejects a two-node data cycle, rolls back, and records no writes', async () => {
    const fixture = createManualRoutingFixture({
      subgraphs: [subgraph(10), subgraph(20)],
      dataLinks: [dataLink(100, 10, 20), dataLink(101, 20, 10)],
    });

    await expect(
      fixture.handler.handle(
        command([{systemId: 10, sgkvs: [[101]]}, {systemId: 20}]),
      ),
    ).rejects.toMatchObject({
      issues: [expect.objectContaining({code: 'ARC-ROUTING-MANUAL-CYCLE'})],
    });
    expect(fixture.recordedWrites()).toEqual({
      creates: [],
      updates: [],
      deletes: [],
    });
    expect(fixture.transactionCounts()).toEqual({commits: 0, rollbacks: 1});
  });

  it('uses an active manual UPDATE instead of stale committed topology for exact matching', async () => {
    const committed = usecase({
      systemId: 700,
      gkv: [101],
      members: [10, 20],
      pairs: [[10, 20]],
    });
    const updated = usecase({
      systemId: 700,
      gkv: [101],
      members: [10, 20],
      pairs: [[20, 10]],
    });
    const fixture = createManualRoutingFixture({
      subgraphs: [subgraph(10), subgraph(20)],
      dataLinks: [dataLink(100, 20, 10)],
      committedUsecases: [committed],
      activeManualUsecaseEdits: [
        manualUpdate(4_000, updated, {
          sgSystemIds: [10, 20],
          dataLinkSystemIds: [100],
          controlLinkSystemIds: [],
        }),
      ],
    });

    const result = await fixture.handler.handle(
      command([{systemId: 10, sgkvs: [[101]]}, {systemId: 20}]),
    );

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(fixture.recordedWrites()).toEqual({
      creates: [],
      updates: [],
      deletes: [],
    });
    if (result.kind === RESULT_KIND.Ok)
      expect(result.data.emittedChanges).toEqual([]);
  });
});
