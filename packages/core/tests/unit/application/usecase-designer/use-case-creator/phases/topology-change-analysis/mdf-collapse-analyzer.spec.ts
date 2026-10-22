/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {MdfCollapseAnalyzer} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/mdf-collapse-analyzer.js';
import {MDF_TOPOLOGY_REWRITE_KIND} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-state.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import type {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import type {UseCase} from '../../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import type {TopologyImpactInventory} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/topology-impact-inventory.js';

const FILE_ID = 1;
const A = 10;
const MDF1 = 20;
const B = 30;

function pair(sourceSubgraphSystemId: number, destSubgraphSystemId: number) {
  return {sourceSubgraphSystemId, destSubgraphSystemId};
}

function directedKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  return `${sourceSubgraphSystemId}>${destSubgraphSystemId}`;
}

function unorderedKey(
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): string {
  return [sourceSubgraphSystemId, destSubgraphSystemId]
    .sort((left, right) => left - right)
    .join('>');
}

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  isEc = false,
): DataLink {
  return {
    systemId,
    fileSystemId: FILE_ID,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    linkType: isEc ? DATA_LINK_TYPE.Ec : DATA_LINK_TYPE.Normal,
    sourceNodeSystemId: sourceSubgraphSystemId * 10,
    destinationNodeSystemId: destSubgraphSystemId * 10,
    sourcePortSystemId: sourceSubgraphSystemId * 100,
    destinationPortSystemId: destSubgraphSystemId * 100,
    subsystemDataLinks: [],
    addSubsystemDataLink: () => undefined,
  } as unknown as DataLink;
}

function usecase(
  systemId: number,
  members: readonly number[],
  pairs: ReadonlyArray<readonly [number, number]>,
  type: UseCase['type'] = 'LINKED',
): UseCase {
  return {
    systemId,
    subgraphSystemIds: members,
    subgraphPairs: pairs.map(([source, destination]) =>
      pair(source, destination),
    ),
    type,
    keyVector: {valueSystemIds: []},
  } as unknown as UseCase;
}

function inventory(
  overrides: Partial<TopologyImpactInventory> = {},
): TopologyImpactInventory {
  return {
    committedUsecasesByDirectedPair: new Map(),
    committedUsecasesBySubgraph: new Map(),
    committedUsecasesByMdfSubgraph: new Map(),
    committedDataLinksByDirectedPair: new Map(),
    effectiveAddedDataLinksByDirectedPair: new Map(),
    deletedDataLinks: [],
    deletedControlLinks: [],
    deletedSubgraphSystemIds: new Set(),
    deletedMdfSubgraphSystemIds: new Set(),
    survivingDataLinkPairKeys: new Set(),
    survivingControlLinkPairKeys: new Set(),
    routableAdjacency: new Map(),
    routingSubgraphsById: new Map(),
    ...overrides,
  } as unknown as TopologyImpactInventory;
}

function singleHopInventory(overrides: Partial<TopologyImpactInventory> = {}) {
  const chainAtoMdf = dataLink(101, A, MDF1);
  const chainMdfToB = dataLink(102, MDF1, B);
  const direct = dataLink(103, A, B);
  return inventory({
    deletedMdfSubgraphSystemIds: new Set([MDF1]),
    deletedSubgraphSystemIds: new Set([MDF1]),
    committedDataLinksByDirectedPair: new Map([
      [directedKey(A, MDF1), [chainAtoMdf]],
      [directedKey(MDF1, B), [chainMdfToB]],
    ]),
    effectiveAddedDataLinksByDirectedPair: new Map([
      [directedKey(A, B), [direct]],
    ]),
    ...overrides,
  });
}

describe('MdfCollapseAnalyzer', () => {
  const analyzer = new MdfCollapseAnalyzer();
  const singleHop = usecase(
    1,
    [A, MDF1, B],
    [
      [A, MDF1],
      [MDF1, B],
    ],
  );

  it('emits one MDF_TO_DIRECT rewrite for a single deleted MDF hop', () => {
    const rewrites = analyzer.analyze(singleHop, singleHopInventory());

    expect(rewrites).toEqual([
      {
        kind: MDF_TOPOLOGY_REWRITE_KIND.MdfToDirect,
        directPair: pair(A, B),
        mdfSubgraphSystemIds: [MDF1],
        committedPairs: [pair(A, MDF1), pair(MDF1, B)],
        normalizedPairs: [pair(A, B)],
      },
    ]);
  });

  it('collapses the complete ordered chain for multiple deleted MDF members', () => {
    const mdf2 = 25;
    const currentUsecase = usecase(
      2,
      [A, MDF1, mdf2, B],
      [
        [A, MDF1],
        [MDF1, mdf2],
        [mdf2, B],
      ],
    );
    const result = analyzer.analyze(
      currentUsecase,
      inventory({
        deletedMdfSubgraphSystemIds: new Set([MDF1, mdf2]),
        deletedSubgraphSystemIds: new Set([MDF1, mdf2]),
        committedDataLinksByDirectedPair: new Map([
          [directedKey(A, MDF1), [dataLink(101, A, MDF1)]],
          [directedKey(MDF1, mdf2), [dataLink(102, MDF1, mdf2)]],
          [directedKey(mdf2, B), [dataLink(103, mdf2, B)]],
        ]),
        effectiveAddedDataLinksByDirectedPair: new Map([
          [directedKey(A, B), [dataLink(104, A, B)]],
        ]),
      }),
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.mdfSubgraphSystemIds).toEqual([MDF1, mdf2]);
    expect(result[0]?.committedPairs).toEqual([
      pair(A, MDF1),
      pair(MDF1, mdf2),
      pair(mdf2, B),
    ]);
  });

  it('treats parallel physical direct links as one normalized pair', () => {
    const result = analyzer.analyze(
      singleHop,
      singleHopInventory({
        effectiveAddedDataLinksByDirectedPair: new Map([
          [directedKey(A, B), [dataLink(103, A, B), dataLink(104, A, B)]],
        ]),
      }),
    );

    expect(result[0]?.normalizedPairs).toEqual([pair(A, B)]);
  });

  it('remains eligible when a control link also supports the direct pair', () => {
    expect(
      analyzer.analyze(
        singleHop,
        singleHopInventory({
          survivingControlLinkPairKeys: new Set([unorderedKey(A, B)]),
        }),
      ),
    ).toHaveLength(1);
  });

  it('still collapses when the committed UseCase holds only a control-link pair between the boundaries', () => {
    const committedWithControlPair = usecase(
      6,
      [A, MDF1, B],
      [
        [A, MDF1],
        [MDF1, B],
        [A, B],
      ],
    );

    const rewrites = analyzer.analyze(
      committedWithControlPair,
      singleHopInventory(),
    );

    expect(rewrites).toHaveLength(1);
    expect(rewrites[0]?.kind).toBe(MDF_TOPOLOGY_REWRITE_KIND.MdfToDirect);
  });

  it.each([
    {
      name: 'there is no session-added direct data link',
      overrides: {effectiveAddedDataLinksByDirectedPair: new Map()},
    },
    {
      name: 'an effective reverse direct data link exists',
      overrides: {
        effectiveAddedDataLinksByDirectedPair: new Map([
          [directedKey(A, B), [dataLink(103, A, B)]],
          [directedKey(B, A), [dataLink(104, B, A)]],
        ]),
      },
    },
    {
      name: 'a committed direct bypass exists',
      overrides: {
        committedDataLinksByDirectedPair: new Map([
          [directedKey(A, MDF1), [dataLink(101, A, MDF1)]],
          [directedKey(MDF1, B), [dataLink(102, MDF1, B)]],
          [directedKey(A, B), [dataLink(105, A, B)]],
        ]),
      },
    },
    {
      name: 'a committed reverse direct bypass exists',
      overrides: {
        committedDataLinksByDirectedPair: new Map([
          [directedKey(A, MDF1), [dataLink(101, A, MDF1)]],
          [directedKey(MDF1, B), [dataLink(102, MDF1, B)]],
          [directedKey(B, A), [dataLink(105, B, A)]],
        ]),
      },
    },
    {
      name: 'one chain pair remains effectively supported',
      overrides: {survivingDataLinkPairKeys: new Set([unorderedKey(A, MDF1)])},
    },
  ])('returns no rewrite when $name', ({overrides}) => {
    expect(analyzer.analyze(singleHop, singleHopInventory(overrides))).toEqual(
      [],
    );
  });

  it('rejects branches through a deleted MDF member', () => {
    const c = 40;
    const branch = usecase(
      3,
      [A, MDF1, B, c],
      [
        [A, MDF1],
        [MDF1, B],
        [MDF1, c],
      ],
    );

    expect(
      analyzer.analyze(
        branch,
        singleHopInventory({
          committedDataLinksByDirectedPair: new Map([
            [directedKey(A, MDF1), [dataLink(101, A, MDF1)]],
            [directedKey(MDF1, B), [dataLink(102, MDF1, B)]],
            [directedKey(MDF1, c), [dataLink(103, MDF1, c)]],
          ]),
        }),
      ),
    ).toEqual([]);
  });

  it('rejects a chain whose intermediate is not a deleted MDF member', () => {
    const regular = 25;
    const currentUsecase = usecase(
      4,
      [A, regular, B],
      [
        [A, regular],
        [regular, B],
      ],
    );
    const result = analyzer.analyze(
      currentUsecase,
      inventory({
        deletedSubgraphSystemIds: new Set([regular]),
        committedDataLinksByDirectedPair: new Map([
          [directedKey(A, regular), [dataLink(101, A, regular)]],
          [directedKey(regular, B), [dataLink(102, regular, B)]],
        ]),
        effectiveAddedDataLinksByDirectedPair: new Map([
          [directedKey(A, B), [dataLink(103, A, B)]],
        ]),
      }),
    );

    expect(result).toEqual([]);
  });

  it('rejects an EC mismatch between the committed chain and direct replacement', () => {
    const result = analyzer.analyze(
      singleHop,
      inventory({
        deletedMdfSubgraphSystemIds: new Set([MDF1]),
        deletedSubgraphSystemIds: new Set([MDF1]),
        committedDataLinksByDirectedPair: new Map([
          [directedKey(A, MDF1), [dataLink(101, A, MDF1, true)]],
          [directedKey(MDF1, B), [dataLink(102, MDF1, B, true)]],
        ]),
        effectiveAddedDataLinksByDirectedPair: new Map([
          [directedKey(A, B), [dataLink(103, A, B)]],
        ]),
      }),
    );

    expect(result).toEqual([]);
  });

  it('rejects a direct replacement that would change the usecase type', () => {
    const result = analyzer.analyze(
      singleHop,
      singleHopInventory({
        effectiveAddedDataLinksByDirectedPair: new Map([
          [directedKey(A, B), [dataLink(103, A, B, true)]],
        ]),
      }),
    );

    expect(result).toEqual([]);
  });

  it('fast-exits when the usecase has no deleted MDF member', () => {
    expect(
      analyzer.analyze(
        usecase(5, [A, B], [[A, B]]),
        inventory({deletedMdfSubgraphSystemIds: new Set()}),
      ),
    ).toEqual([]);
  });
});
