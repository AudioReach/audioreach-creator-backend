/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import {emptyGraphEdits} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import {buildTopologyImpactInventory} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/topology-impact-inventory.js';

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  linkType = DATA_LINK_TYPE.Normal,
) {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    linkType,
  } as never;
}

function usecase(
  systemId: number,
  subgraphSystemIds: number[],
  pairs: {src: number; dst: number}[] = [],
) {
  return {
    systemId,
    subgraphSystemIds,
    subgraphPairs: pairs.map(pair => ({
      sourceSubgraphSystemId: pair.src,
      destSubgraphSystemId: pair.dst,
    })),
  } as never;
}

function buildSnapshot(
  overrides: Partial<Parameters<typeof buildTopologyImpactInventory>[0]> = {},
) {
  return {
    subgraphs: [],
    mdf: {effective: new Set<number>(), deleted: new Set<number>()},
    routableDataLinks: [],
    routableControlLinks: [],
    overlayDataLinks: [],
    overlayControlLinks: [],
    committedUsecases: [],
    sessionEdits: emptyGraphEdits(),
    committedDataLinks: [] as never[],
    ...overrides,
  } as never;
}

describe('buildTopologyImpactInventory — committed data link indexes', () => {
  it('indexes a committed link by its directed pair', () => {
    const link = dataLink(1, 10, 20);
    const inventory = buildTopologyImpactInventory(
      buildSnapshot({committedDataLinks: [link]}),
    );

    expect(inventory.committedDataLinksByDirectedPair.get('10>20')).toEqual([
      link,
    ]);
    expect(
      inventory.committedDataLinksByDirectedPair.get('20>10'),
    ).toBeUndefined();
  });
});

describe('buildTopologyImpactInventory — effective added link index', () => {
  it('excludes an added link that was subsequently deleted in the same session', () => {
    const addedThenDeleted = dataLink(5, 10, 20);
    const inventory = buildTopologyImpactInventory(
      buildSnapshot({
        sessionEdits: {
          ...emptyGraphEdits(),
          addedDataLinks: [addedThenDeleted],
          deletedDataLinks: [addedThenDeleted],
        },
      }),
    );

    expect(inventory.effectiveAddedDataLinksByDirectedPair.size).toBe(0);
  });

  it('includes an added link that was not subsequently deleted', () => {
    const added = dataLink(6, 10, 20);
    const inventory = buildTopologyImpactInventory(
      buildSnapshot({
        overlayDataLinks: [added],
        sessionEdits: {
          ...emptyGraphEdits(),
          addedDataLinks: [added],
        },
      }),
    );

    expect(
      inventory.effectiveAddedDataLinksByDirectedPair.get('10>20'),
    ).toEqual([added]);
  });
});

describe('buildTopologyImpactInventory — committed evidence is independent of session deletions', () => {
  it('committed link remains in committedDataLinksByDirectedPair even when deleted in this session', () => {
    const committedLink = dataLink(7, 30, 40);
    const inventory = buildTopologyImpactInventory(
      buildSnapshot({
        committedDataLinks: [committedLink],
        sessionEdits: {
          ...emptyGraphEdits(),
          deletedDataLinks: [committedLink],
        },
      }),
    );

    expect(inventory.committedDataLinksByDirectedPair.get('30>40')).toEqual([
      committedLink,
    ]);
  });
});

describe('buildTopologyImpactInventory — deleted MDF SG IDs and committed UCs by MDF SG', () => {
  it('exposes deletedMdfSubgraphSystemIds from the snapshot', () => {
    const inventory = buildTopologyImpactInventory(
      buildSnapshot({
        mdf: {effective: new Set(), deleted: new Set([10, 20])},
      }),
    );

    expect(inventory.deletedMdfSubgraphSystemIds).toEqual(new Set([10, 20]));
  });

  it('indexes only committed UCs that contain a deleted MDF SG', () => {
    const ucWithMdf = usecase(901, [10, 30], [{src: 10, dst: 30}]);
    const ucWithoutMdf = usecase(902, [30, 40], [{src: 30, dst: 40}]);
    const inventory = buildTopologyImpactInventory(
      buildSnapshot({
        committedUsecases: [ucWithMdf, ucWithoutMdf],
        mdf: {effective: new Set(), deleted: new Set([10])},
      }),
    );

    expect(inventory.committedUsecasesByMdfSubgraph.get(10)).toEqual([
      ucWithMdf,
    ]);
    expect(inventory.committedUsecasesByMdfSubgraph.get(30)).toBeUndefined();
    expect(inventory.committedUsecasesByMdfSubgraph.get(40)).toBeUndefined();
  });
});

describe('buildTopologyImpactInventory — committed UCs by unordered pair', () => {
  it('indexes committed UseCases by unordered pair endpoints', () => {
    const committedUsecase = usecase(100, [20, 40], [{src: 20, dst: 40}]);

    const inventory = buildTopologyImpactInventory(
      buildSnapshot({committedUsecases: [committedUsecase]}),
    );

    expect(inventory.committedUsecasesByUnorderedPair.get('20>40')).toEqual([
      committedUsecase,
    ]);
  });
});
