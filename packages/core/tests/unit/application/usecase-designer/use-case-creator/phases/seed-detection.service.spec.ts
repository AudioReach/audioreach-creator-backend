/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import type {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {
  createAutoRoutingInput,
  createManualRoutingInput,
  emptyGraphEdits,
  ROUTING_MODE,
  type RoutingGraphSnapshot,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {RoutingContext} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-context.js';
import {
  USECASE_TOPOLOGY_DECISION_KIND,
  type KvResolutions,
} from '../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {SeedDetectionService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/seed-detection.service.js';

const FILE_ID = 1;

function makeSubgraph(
  systemId: number,
  isMdf = false,
): RoutingGraphSnapshot['subgraphs'][number] {
  return {
    subgraph: new Subgraph({
      systemId,
      subgraphId: systemId + 1000,
      name: `sg-${systemId}`,
      isImported: false,
      fileSystemId: FILE_ID,
    }),
    requestedSgkvs: [],
    isMdf,
  };
}

function makeUsecase(
  systemId: number,
  subgraphSystemIds: readonly number[],
): UseCase {
  return new UseCase({
    systemId,
    fileSystemId: FILE_ID,
    keyVector: {valueSystemIds: []},
    subgraphSystemIds: [...subgraphSystemIds],
    subgraphPairs: [],
  });
}

function makeContext(
  mode: typeof ROUTING_MODE.Auto | typeof ROUTING_MODE.Manual,
  subgraphSystemIds: readonly number[],
  selectedUsecases: readonly UseCase[],
  committedUsecases: readonly UseCase[] = selectedUsecases,
  sessionEdits = emptyGraphEdits(),
  mdfSubgraphSystemIds: readonly number[] = [],
): RoutingContext {
  const mdfIds = new Set(mdfSubgraphSystemIds);
  const subgraphs = subgraphSystemIds.map(systemId =>
    makeSubgraph(systemId, mdfIds.has(systemId)),
  );
  const init = {
    fileSystemId: FILE_ID,
    selection: {
      selectedUsecaseSystemIds: selectedUsecases.map(
        usecase => usecase.systemId,
      ),
      activeSubgraphs: subgraphs.map(entry => ({
        systemId: entry.subgraph.systemId,
        sgkvs: entry.requestedSgkvs,
      })),
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    selectedUsecases,
    graphSnapshot: {
      subgraphs,
      routableDataLinks: [],
      routableControlLinks: [],
      overlayDataLinks: [],
      overlayControlLinks: [],
      committedUsecases,
      sessionEdits,
    },
    activeManualUsecaseEdits: [],
  } satisfies Parameters<typeof createAutoRoutingInput>[0];
  const input =
    mode === ROUTING_MODE.Auto
      ? createAutoRoutingInput(init)
      : createManualRoutingInput({...init, manualTopology: {pairs: []}});
  return new RoutingContext(input);
}

function setKvResolutions(
  context: RoutingContext,
  perSg: KvResolutions['perSg'],
  ucFilteredBaseline: KvResolutions['ucFilteredBaseline'],
): void {
  context.kvResolutions = {perSg, ucFilteredBaseline};
}

function makeDataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): DataLink {
  return {
    systemId,
    linkType: DATA_LINK_TYPE.Normal,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as DataLink;
}

function makeControlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): ControlLink {
  return {
    systemId,
    linkType: DATA_LINK_TYPE.Normal,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as ControlLink;
}

describe('SeedDetectionService', () => {
  it('rejects automatic execution without Phase 4 resolutions', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10],
      [makeUsecase(50, [10])],
    );

    await expect(new SeedDetectionService().run(context)).rejects.toThrow(
      'SeedDetectionService requires Phase 4 kvResolutions in automatic mode',
    );
  });

  it('compares SGKV sets independently of instance and pair ordering', async () => {
    const selected = makeUsecase(50, [10]);
    const context = makeContext(ROUTING_MODE.Auto, [10], [selected]);
    setKvResolutions(
      context,
      new Map([
        [
          10,
          [
            {
              keyValues: [
                {keyDefSystemId: 2, valueDefSystemId: 20},
                {keyDefSystemId: 1, valueDefSystemId: 10},
              ],
            },
          ],
        ],
      ]),
      new Map([
        [
          10,
          [
            {
              keyValues: [
                {keyDefSystemId: 1, valueDefSystemId: 10},
                {keyDefSystemId: 2, valueDefSystemId: 20},
              ],
            },
          ],
        ],
      ]),
    );

    const result = await new SeedDetectionService().run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.seeds).toEqual({
      sgSystemIds: new Set(),
      reasons: new Map(),
    });
  });

  it('seeds changed SGKV content and preserves the first reason', async () => {
    const selected = makeUsecase(50, [10]);
    const context = makeContext(ROUTING_MODE.Auto, [10], [selected]);
    setKvResolutions(
      context,
      new Map([
        [10, [{keyValues: [{keyDefSystemId: 1, valueDefSystemId: 11}]}]],
      ]),
      new Map([
        [10, [{keyValues: [{keyDefSystemId: 1, valueDefSystemId: 10}]}]],
      ]),
    );

    const result = await new SeedDetectionService().run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.seeds).toEqual({
      sgSystemIds: new Set([10]),
      reasons: new Map([[10, 'KV_CHANGED']]),
    });
  });

  it('does not create KV_CHANGED for a normalized empty MDF instance', async () => {
    const selected = makeUsecase(50, [20]);
    const context = makeContext(
      ROUTING_MODE.Auto,
      [20],
      [selected],
      [selected],
      emptyGraphEdits(),
      [20],
    );
    setKvResolutions(context, new Map([[20, [{keyValues: []}]]]), new Map());

    await new SeedDetectionService().run(context);

    expect(context.seeds?.sgSystemIds).toEqual(new Set());
    expect(context.seeds?.reasons.has(20)).toBe(false);
  });

  it('retains NEW_SUBGRAPH seeding for an MDF subgraph', async () => {
    const selected = makeUsecase(50, [10]);
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20],
      [selected],
      [selected],
      emptyGraphEdits(),
      [20],
    );
    setKvResolutions(
      context,
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
    );

    await new SeedDetectionService().run(context);

    expect(context.seeds).toEqual({
      sgSystemIds: new Set([20]),
      reasons: new Map([[20, 'NEW_SUBGRAPH']]),
    });
  });

  it('retains link seeding for an existing MDF endpoint', async () => {
    const selected = makeUsecase(50, [10, 20]);
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20],
      [selected],
      [selected],
      {...emptyGraphEdits(), addedDataLinks: [makeDataLink(701, 10, 20)]},
      [20],
    );
    setKvResolutions(
      context,
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
    );

    await new SeedDetectionService().run(context);

    expect(context.seeds).toEqual({
      sgSystemIds: new Set([10, 20]),
      reasons: new Map([
        [10, 'LINK_ADDED'],
        [20, 'LINK_ADDED'],
      ]),
    });
  });

  it('does not mislabel unchanged KVs from a deletion-marked UC and relies on deleted-link seeds', async () => {
    const selected = makeUsecase(50, [10, 20, 30]);
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20],
      [selected],
      [selected],
      {
        ...emptyGraphEdits(),
        deletedDataLinks: [makeDataLink(700, 20, 30)],
      },
    );
    setKvResolutions(
      context,
      new Map([
        [10, [{keyValues: [{keyDefSystemId: 1, valueDefSystemId: 10}]}]],
        [20, [{keyValues: []}]],
      ]),
      new Map([
        [10, [{keyValues: [{keyDefSystemId: 1, valueDefSystemId: 10}]}]],
        [20, [{keyValues: []}]],
      ]),
    );
    context.topologyChangeAnalysis = {
      affectedUsecaseSystemIds: new Set([selected.systemId]),
      decisions: [
        {
          kind: USECASE_TOPOLOGY_DECISION_KIND.DeleteOrReconstruct,
          usecase: selected,
          deletedComponent: {type: 'SUBGRAPH', systemId: 30},
          reconstructionPaths: [],
        },
      ],
    };

    await new SeedDetectionService().run(context);

    expect(context.seeds).toEqual({
      sgSystemIds: new Set([20]),
      reasons: new Map([[20, 'LINK_DELETED']]),
    });
  });

  it('seeds an SG absent from every committed usecase', async () => {
    const selected = makeUsecase(50, [10]);
    const context = makeContext(ROUTING_MODE.Auto, [10, 20], [selected]);
    setKvResolutions(
      context,
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
    );

    await new SeedDetectionService().run(context);

    expect(context.seeds).toEqual({
      sgSystemIds: new Set([20]),
      reasons: new Map([[20, 'NEW_SUBGRAPH']]),
    });
  });

  it('does not publish seeds in manual mode', async () => {
    const selected = makeUsecase(50, [10]);
    const context = makeContext(ROUTING_MODE.Manual, [10], [selected]);
    setKvResolutions(
      context,
      new Map([
        [10, [{keyValues: [{keyDefSystemId: 1, valueDefSystemId: 11}]}]],
      ]),
      new Map([
        [10, [{keyValues: [{keyDefSystemId: 1, valueDefSystemId: 10}]}]],
      ]),
    );

    const result = await new SeedDetectionService().run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.seeds).toBeNull();
  });

  it('seeds both endpoints of an added intra-usecase data link', async () => {
    const selected = makeUsecase(50, [10, 20]);
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20],
      [selected],
      [selected],
      {...emptyGraphEdits(), addedDataLinks: [makeDataLink(700, 10, 20)]},
    );
    setKvResolutions(
      context,
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
    );

    await new SeedDetectionService().run(context);

    expect(context.seeds).toEqual({
      sgSystemIds: new Set([10, 20]),
      reasons: new Map([
        [10, 'LINK_ADDED'],
        [20, 'LINK_ADDED'],
      ]),
    });
  });

  it('seeds only surviving endpoints of deleted intra-usecase data links', async () => {
    const selected = makeUsecase(50, [10, 20]);
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20],
      [selected],
      [selected],
      {...emptyGraphEdits(), deletedDataLinks: [makeDataLink(700, 10, 30)]},
    );
    setKvResolutions(
      context,
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
    );

    await new SeedDetectionService().run(context);

    expect(context.seeds).toEqual({
      sgSystemIds: new Set([10]),
      reasons: new Map([[10, 'LINK_DELETED']]),
    });
  });

  it('does not seed control-link edits or deleted endpoints outside the scope', async () => {
    const selected = makeUsecase(50, [10, 20]);
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20],
      [selected],
      [selected],
      {
        ...emptyGraphEdits(),
        addedControlLinks: [makeControlLink(701, 10, 20)],
        deletedDataLinks: [makeDataLink(702, 30, 40)],
      },
    );
    setKvResolutions(
      context,
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
    );

    await new SeedDetectionService().run(context);

    expect(context.seeds).toEqual({
      sgSystemIds: new Set(),
      reasons: new Map(),
    });
  });

  it('seeds every effective-scope SG with no UC context', async () => {
    const context = makeContext(ROUTING_MODE.Auto, [20, 10], []);
    setKvResolutions(
      context,
      new Map([
        [20, [{keyValues: []}]],
        [10, [{keyValues: []}]],
      ]),
      new Map([
        [20, [{keyValues: []}]],
        [10, [{keyValues: []}]],
      ]),
    );

    await new SeedDetectionService().run(context);

    expect(context.seeds).toEqual({
      sgSystemIds: new Set([20, 10]),
      reasons: new Map([
        [20, 'NO_USECASE_CONTEXT'],
        [10, 'NO_USECASE_CONTEXT'],
      ]),
    });
  });

  it('seeds out-of-selection SGs even when their KV content is unchanged', async () => {
    const selected = makeUsecase(50, [10]);
    const otherCommitted = makeUsecase(51, [20]);
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20],
      [selected],
      [selected, otherCommitted],
    );
    setKvResolutions(
      context,
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
      new Map([
        [10, [{keyValues: []}]],
        [20, [{keyValues: []}]],
      ]),
    );

    await new SeedDetectionService().run(context);

    expect(context.seeds).toEqual({
      sgSystemIds: new Set([20]),
      reasons: new Map([[20, 'OUT_OF_SELECTION']]),
    });
  });
});
