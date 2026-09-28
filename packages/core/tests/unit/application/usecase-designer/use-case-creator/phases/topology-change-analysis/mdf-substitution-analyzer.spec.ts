/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it, jest} from '@jest/globals';
import type {DataLink} from '../../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {DATA_LINK_TYPE} from '../../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import type {RoutingSubgraph} from '../../../../../../../src/application/usecase-designer/use-case-creator/contracts/routing-input.js';
import type {
  DirectedEdge,
  TopologyImpactInventory,
} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/topology-impact-inventory.js';
import {MdfSubstitutionAnalyzer} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/topology-change-analysis/mdf-substitution-analyzer.js';

interface InventoryOptions {
  readonly adjacency: readonly (readonly [number, readonly DirectedEdge[]])[];
  readonly inScopeSubgraphSystemIds: readonly number[];
  readonly mdfSubgraphSystemIds: readonly number[];
  readonly survivingDataLinkPairKeys?: readonly string[];
  readonly survivingControlLinkPairKeys?: readonly string[];
}

function edge(destSubgraphSystemId: number, isEc = false): DirectedEdge {
  return {destSubgraphSystemId, isEc};
}

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
  isEc = false,
): DataLink {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    linkType: isEc ? DATA_LINK_TYPE.Ec : DATA_LINK_TYPE.Normal,
  } as DataLink;
}

function inventory(options: InventoryOptions): TopologyImpactInventory {
  const mdfIds = new Set(options.mdfSubgraphSystemIds);
  return {
    committedUsecasesByDirectedPair: new Map(),
    committedUsecasesBySubgraph: new Map(),
    deletedDataLinks: [],
    deletedControlLinks: [],
    deletedSubgraphSystemIds: new Set(),
    survivingDataLinkPairKeys: new Set(options.survivingDataLinkPairKeys ?? []),
    survivingControlLinkPairKeys: new Set(
      options.survivingControlLinkPairKeys ?? [],
    ),
    routableAdjacency: new Map(options.adjacency),
    routingSubgraphsById: new Map(
      options.inScopeSubgraphSystemIds.map(systemId => [
        systemId,
        {
          subgraph: {systemId},
          requestedSgkvs: [],
          isMdf: mdfIds.has(systemId),
        } as RoutingSubgraph,
      ]),
    ),
  };
}

describe('MdfSubstitutionAnalyzer', () => {
  const analyzer = new MdfSubstitutionAnalyzer();

  it('returns a normal substitution through one MDF member', () => {
    const result = analyzer.analyze(
      dataLink(100, 10, 30),
      inventory({
        adjacency: [
          [10, [edge(20)]],
          [20, [edge(30)]],
        ],
        inScopeSubgraphSystemIds: [10, 20, 30],
        mdfSubgraphSystemIds: [20],
      }),
    );

    expect(result).toEqual({
      removedPair: {
        sourceSubgraphSystemId: 10,
        destSubgraphSystemId: 30,
      },
      replacementSubgraphSystemIds: [20],
      replacementPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
      ],
    });
  });

  it('returns every MDF member and adjacent pair for a multi-member chain', () => {
    const result = analyzer.analyze(
      dataLink(101, 10, 40),
      inventory({
        adjacency: [
          [10, [edge(20)]],
          [20, [edge(30)]],
          [30, [edge(40)]],
        ],
        inScopeSubgraphSystemIds: [10, 20, 30, 40],
        mdfSubgraphSystemIds: [20, 30],
      }),
    );

    expect(result).toEqual({
      removedPair: {
        sourceSubgraphSystemId: 10,
        destSubgraphSystemId: 40,
      },
      replacementSubgraphSystemIds: [20, 30],
      replacementPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
        {sourceSubgraphSystemId: 30, destSubgraphSystemId: 40},
      ],
    });
  });

  it('returns an EC substitution when every replacement edge is EC', () => {
    const result = analyzer.analyze(
      dataLink(102, 10, 30, true),
      inventory({
        adjacency: [
          [10, [edge(20, true)]],
          [20, [edge(30, true)]],
        ],
        inScopeSubgraphSystemIds: [10, 20, 30],
        mdfSubgraphSystemIds: [20],
      }),
    );

    expect(result?.replacementSubgraphSystemIds).toEqual([20]);
    expect(result?.replacementPairs).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
    ]);
  });

  it.each([
    {
      name: 'no complete A-to-B route',
      adjacency: [[10, [edge(20)]]] as const,
    },
    {
      name: 'only a reverse B-to-A route',
      adjacency: [
        [30, [edge(20)]],
        [20, [edge(10)]],
      ] as const,
    },
    {
      name: 'only a direct A-to-B edge with no intermediate',
      adjacency: [[10, [edge(30)]]] as const,
    },
  ])('returns null for $name', ({adjacency}) => {
    expect(
      analyzer.analyze(
        dataLink(110, 10, 30),
        inventory({
          adjacency,
          inScopeSubgraphSystemIds: [10, 20, 30],
          mdfSubgraphSystemIds: [20],
        }),
      ),
    ).toBeNull();
  });

  it('returns null when an intermediate SG is not MDF', () => {
    expect(
      analyzer.analyze(
        dataLink(111, 10, 30),
        inventory({
          adjacency: [
            [10, [edge(20)]],
            [20, [edge(30)]],
          ],
          inScopeSubgraphSystemIds: [10, 20, 30],
          mdfSubgraphSystemIds: [],
        }),
      ),
    ).toBeNull();
  });

  it('returns null when a chain member is excluded from routable scope', () => {
    expect(
      analyzer.analyze(
        dataLink(112, 10, 30),
        inventory({
          adjacency: [
            [10, [edge(20)]],
            [20, [edge(30)]],
          ],
          inScopeSubgraphSystemIds: [10, 30, 40, 50],
          mdfSubgraphSystemIds: [20],
        }),
      ),
    ).toBeNull();
  });

  it('returns null when a chain link is excluded from routable adjacency', () => {
    expect(
      analyzer.analyze(
        dataLink(113, 10, 30),
        inventory({
          adjacency: [[10, [edge(20)]]],
          inScopeSubgraphSystemIds: [10, 20, 30],
          mdfSubgraphSystemIds: [20],
        }),
      ),
    ).toBeNull();
  });

  it.each([
    {name: 'source', inScopeSubgraphSystemIds: [20, 30, 40]},
    {name: 'destination', inScopeSubgraphSystemIds: [10, 20, 40]},
  ])(
    'returns null when the $name endpoint is outside routable scope',
    options => {
      expect(
        analyzer.analyze(
          dataLink(114, 10, 30),
          inventory({
            adjacency: [
              [10, [edge(20)]],
              [20, [edge(30)]],
            ],
            inScopeSubgraphSystemIds: options.inScopeSubgraphSystemIds,
            mdfSubgraphSystemIds: [20],
          }),
        ),
      ).toBeNull();
    },
  );

  it.each([
    {
      name: 'normal deletion with an all-EC replacement',
      deletedIsEc: false,
      firstEdgeIsEc: true,
      secondEdgeIsEc: true,
    },
    {
      name: 'EC deletion with an all-normal replacement',
      deletedIsEc: true,
      firstEdgeIsEc: false,
      secondEdgeIsEc: false,
    },
    {
      name: 'normal deletion with a mixed normal-to-EC replacement',
      deletedIsEc: false,
      firstEdgeIsEc: false,
      secondEdgeIsEc: true,
    },
    {
      name: 'EC deletion with a mixed EC-to-normal replacement',
      deletedIsEc: true,
      firstEdgeIsEc: true,
      secondEdgeIsEc: false,
    },
  ])(
    'returns null for $name',
    ({deletedIsEc, firstEdgeIsEc, secondEdgeIsEc}) => {
      expect(
        analyzer.analyze(
          dataLink(120, 10, 30, deletedIsEc),
          inventory({
            adjacency: [
              [10, [edge(20, firstEdgeIsEc)]],
              [20, [edge(30, secondEdgeIsEc)]],
            ],
            inScopeSubgraphSystemIds: [10, 20, 30],
            mdfSubgraphSystemIds: [20],
          }),
        ),
      ).toBeNull();
    },
  );

  it.each([
    {
      name: 'normal link before EC link',
      firstHop: [edge(20, false), edge(20, true)],
    },
    {
      name: 'EC link before normal link',
      firstHop: [edge(20, true), edge(20, false)],
    },
  ])('rejects a mixed-semantic parallel hop: $name', ({firstHop}) => {
    expect(
      analyzer.analyze(
        dataLink(121, 10, 30),
        inventory({
          adjacency: [
            [10, firstHop],
            [20, [edge(30)]],
          ],
          inScopeSubgraphSystemIds: [10, 20, 30],
          mdfSubgraphSystemIds: [20],
        }),
      ),
    ).toBeNull();
  });

  it('treats duplicate normal physical links as one logical hop', () => {
    const result = analyzer.analyze(
      dataLink(122, 10, 30),
      inventory({
        adjacency: [
          [10, [edge(20), edge(20)]],
          [20, [edge(30)]],
        ],
        inScopeSubgraphSystemIds: [10, 20, 30],
        mdfSubgraphSystemIds: [20],
      }),
    );

    expect(result).toEqual({
      removedPair: {
        sourceSubgraphSystemId: 10,
        destSubgraphSystemId: 30,
      },
      replacementSubgraphSystemIds: [20],
      replacementPairs: [
        {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
        {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
      ],
    });
  });

  it('returns null when a surviving direct data-link supports the pair', () => {
    expect(
      analyzer.analyze(
        dataLink(130, 10, 30),
        inventory({
          adjacency: [
            [10, [edge(20)]],
            [20, [edge(30)]],
          ],
          inScopeSubgraphSystemIds: [10, 20, 30],
          mdfSubgraphSystemIds: [20],
          survivingDataLinkPairKeys: ['10<->30'],
        }),
      ),
    ).toBeNull();
  });

  it('returns null when an opposite-direction control-link supports the pair', () => {
    expect(
      analyzer.analyze(
        dataLink(131, 10, 30),
        inventory({
          adjacency: [
            [10, [edge(20)]],
            [20, [edge(30)]],
          ],
          inScopeSubgraphSystemIds: [10, 20, 30],
          mdfSubgraphSystemIds: [20],
          survivingControlLinkPairKeys: ['10<->30'],
        }),
      ),
    ).toBeNull();
  });

  it('returns null for two complete A-to-B MDF chains', () => {
    expect(
      analyzer.analyze(
        dataLink(140, 10, 40),
        inventory({
          adjacency: [
            [10, [edge(20), edge(30)]],
            [20, [edge(40)]],
            [30, [edge(40)]],
          ],
          inScopeSubgraphSystemIds: [10, 20, 30, 40],
          mdfSubgraphSystemIds: [20, 30],
        }),
      ),
    ).toBeNull();
  });

  it('returns null when two complete chains share an MDF prefix', () => {
    expect(
      analyzer.analyze(
        dataLink(141, 10, 50),
        inventory({
          adjacency: [
            [10, [edge(20)]],
            [20, [edge(30), edge(40)]],
            [30, [edge(50)]],
            [40, [edge(50)]],
          ],
          inScopeSubgraphSystemIds: [10, 20, 30, 40, 50],
          mdfSubgraphSystemIds: [20, 30, 40],
        }),
      ),
    ).toBeNull();
  });

  it('keeps a sole complete chain when a chain node has an unrelated dead-end edge', () => {
    const result = analyzer.analyze(
      dataLink(142, 10, 40),
      inventory({
        adjacency: [
          [10, [edge(20)]],
          [20, [edge(40), edge(90)]],
        ],
        inScopeSubgraphSystemIds: [10, 20, 40, 90],
        mdfSubgraphSystemIds: [20, 90],
      }),
    );

    expect(result?.replacementSubgraphSystemIds).toEqual([20]);
  });

  it('does not count a second route whose intermediate is not MDF', () => {
    const result = analyzer.analyze(
      dataLink(143, 10, 40),
      inventory({
        adjacency: [
          [10, [edge(20), edge(30)]],
          [20, [edge(40)]],
          [30, [edge(40)]],
        ],
        inScopeSubgraphSystemIds: [10, 20, 30, 40],
        mdfSubgraphSystemIds: [20],
      }),
    );

    expect(result?.replacementSubgraphSystemIds).toEqual([20]);
  });

  it('ignores a cycle and returns the sole complete chain', () => {
    const result = analyzer.analyze(
      dataLink(150, 10, 30),
      inventory({
        adjacency: [
          [10, [edge(20)]],
          [20, [edge(10), edge(30)]],
        ],
        inScopeSubgraphSystemIds: [10, 20, 30],
        mdfSubgraphSystemIds: [20],
      }),
    );

    expect(result?.replacementSubgraphSystemIds).toEqual([20]);
  });

  it('returns null when a cycle has no complete route to the destination', () => {
    expect(
      analyzer.analyze(
        dataLink(151, 10, 30),
        inventory({
          adjacency: [
            [10, [edge(20)]],
            [20, [edge(10)]],
          ],
          inScopeSubgraphSystemIds: [10, 20, 30],
          mdfSubgraphSystemIds: [20],
        }),
      ),
    ).toBeNull();
  });

  it('accepts a simple chain that reaches the effective-scope depth bound', () => {
    const result = analyzer.analyze(
      dataLink(152, 10, 40),
      inventory({
        adjacency: [
          [10, [edge(20)]],
          [20, [edge(30)]],
          [30, [edge(40)]],
        ],
        inScopeSubgraphSystemIds: [10, 20, 30, 40],
        mdfSubgraphSystemIds: [20, 30],
      }),
    );

    expect(result?.replacementSubgraphSystemIds).toEqual([20, 30]);
  });

  it('sorts candidates and stops before inspecting a third branch after uniqueness is impossible', () => {
    const sourceEdges = Object.freeze([edge(99), edge(30), edge(20)]);
    const currentInventory = inventory({
      adjacency: [
        [10, sourceEdges],
        [20, [edge(40)]],
        [30, [edge(40)]],
      ],
      inScopeSubgraphSystemIds: [10, 20, 30, 40, 99],
      mdfSubgraphSystemIds: [20, 30, 99],
    });
    const routingSubgraphsById = currentInventory.routingSubgraphsById as Map<
      number,
      RoutingSubgraph
    >;
    const getSpy = jest.spyOn(routingSubgraphsById, 'get');

    expect(
      analyzer.analyze(dataLink(153, 10, 40), currentInventory),
    ).toBeNull();
    expect(getSpy).not.toHaveBeenCalledWith(99);
    expect(
      sourceEdges.map(candidate => candidate.destSubgraphSystemId),
    ).toEqual([99, 30, 20]);
  });
});
