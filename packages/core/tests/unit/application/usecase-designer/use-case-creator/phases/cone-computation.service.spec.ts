/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
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
import {ConeComputationService} from '../../../../../../src/application/usecase-designer/use-case-creator/phases/cone-computation.service.js';

const FILE_ID = 1;

function makeSubgraph(
  systemId: number,
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
    isMdf: false,
  };
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

function makeContext(
  mode: typeof ROUTING_MODE.Auto | typeof ROUTING_MODE.Manual,
  subgraphSystemIds: readonly number[],
  links: readonly DataLink[],
): RoutingContext {
  const init = {
    fileSystemId: FILE_ID,
    selection: {
      selectedUsecaseSystemIds: [],
      activeSubgraphs: subgraphSystemIds.map(systemId => ({
        systemId,
        sgkvs: [],
      })),
      excludedSubgraphSystemIds: [],
      excludedDataLinkSystemIds: [],
      excludedControlLinkSystemIds: [],
    },
    selectedUsecases: [],
    graphSnapshot: {
      subgraphs: subgraphSystemIds.map(makeSubgraph),
      routableDataLinks: links,
      routableControlLinks: [],
      overlayDataLinks: links,
      overlayControlLinks: [],
      committedUsecases: [],
      sessionEdits: emptyGraphEdits(),
    },
    activeManualUsecaseEdits: [],
  } satisfies Parameters<typeof createAutoRoutingInput>[0];
  const input =
    mode === ROUTING_MODE.Auto
      ? createAutoRoutingInput(init)
      : createManualRoutingInput({...init, manualTopology: {pairs: []}});
  const context = new RoutingContext(input);
  return context;
}

function setSeeds(
  context: RoutingContext,
  seedSystemIds: readonly number[],
): void {
  context.seeds = {
    sgSystemIds: new Set(seedSystemIds),
    reasons: new Map(),
  };
}

describe('ConeComputationService', () => {
  it('rejects automatic execution without Phase 5 seeds', async () => {
    const context = makeContext(ROUTING_MODE.Auto, [10], []);

    await expect(new ConeComputationService().run(context)).rejects.toThrow(
      'ConeComputationService requires Phase 5 seeds in automatic mode',
    );
  });

  it('expands forward and reverse through a directed chain and identifies roots', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20, 30],
      [makeDataLink(1, 10, 20), makeDataLink(2, 20, 30)],
    );
    setSeeds(context, [20]);

    const result = await new ConeComputationService().run(context);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(context.cones).toEqual({
      sgSystemIds: new Set([10, 20, 30]),
      rootSgs: new Set([10]),
    });
  });

  it('unions overlapping seeds and terminates on cycles', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20, 30],
      [
        makeDataLink(1, 10, 20),
        makeDataLink(2, 20, 30),
        makeDataLink(3, 30, 10),
      ],
    );
    setSeeds(context, [30, 10]);

    await new ConeComputationService().run(context);

    expect(context.cones).toEqual({
      sgSystemIds: new Set([10, 20, 30]),
      rootSgs: new Set(),
    });
  });

  it('does not enter or bridge through out-of-scope neighbors', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 20],
      [makeDataLink(1, 10, 30), makeDataLink(2, 30, 20)],
    );
    setSeeds(context, [10]);

    await new ConeComputationService().run(context);

    expect(context.cones).toEqual({
      sgSystemIds: new Set([10]),
      rootSgs: new Set([10]),
    });
  });

  it('uses the post-overlay routable graph for surviving fragments', async () => {
    const context = makeContext(
      ROUTING_MODE.Auto,
      [10, 30],
      [makeDataLink(1, 10, 30)],
    );
    setSeeds(context, [10]);

    await new ConeComputationService().run(context);

    expect(context.cones?.sgSystemIds).toEqual(new Set([10, 30]));
  });

  it('publishes an empty cone for empty seeds and no cone in manual mode', async () => {
    const automatic = makeContext(ROUTING_MODE.Auto, [10], []);
    setSeeds(automatic, []);
    await new ConeComputationService().run(automatic);
    expect(automatic.cones).toEqual({
      sgSystemIds: new Set(),
      rootSgs: new Set(),
    });

    const manual = makeContext(ROUTING_MODE.Manual, [10], []);
    setSeeds(manual, [10]);
    const result = await new ConeComputationService().run(manual);
    expect(result.kind).toBe(RESULT_KIND.Ok);
    expect(manual.cones).toBeNull();
  });
});
