/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import {Subgraph} from '../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import {UseCase} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {ManualPairDiscoveryService} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/manual-pair-discovery.service.js';

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): DataLink {
  return new DataLink({
    systemId,
    sourceNodeSystemId: systemId * 10 + 1,
    destinationNodeSystemId: systemId * 10 + 2,
    sourcePortSystemId: systemId * 10 + 3,
    destinationPortSystemId: systemId * 10 + 4,
    linkType: 'NORMAL' as never,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
    fileSystemId: 1,
  });
}

function controlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): ControlLink {
  return new ControlLink(
    systemId,
    1,
    systemId * 10 + 1,
    systemId * 10 + 2,
    systemId * 10 + 3,
    systemId * 10 + 4,
    0,
    'NORMAL' as never,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  );
}

function subgraph(systemId: number) {
  return {
    subgraph: new Subgraph({
      systemId,
      subgraphId: systemId + 100,
      name: `sg-${systemId}`,
      isImported: false,
      fileSystemId: 1,
    }),
    requestedSgkvs: [],
    isMdf: false,
  };
}

describe('ManualPairDiscoveryService', () => {
  it('returns normalized topology from selected usecases and one immutable graph snapshot', () => {
    const service = new ManualPairDiscoveryService();
    const result = service.discover({
      selectedUsecases: [
        new UseCase({
          systemId: 100,
          fileSystemId: 1,
          keyVector: {valueSystemIds: []},
          subgraphSystemIds: [1, 2],
          subgraphPairs: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
        }),
      ],
      subgraphs: [subgraph(3), subgraph(1), subgraph(2)],
      dataLinks: [dataLink(12, 2, 1)],
      overlayDataLinks: [dataLink(13, 1, 3)],
      controlLinks: [controlLink(23, 2, 3), controlLink(13, 1, 3)],
    });

    expect(result.kind).toBe('OK');
    if (result.kind !== 'OK') return;
    expect(result.data.pairs).toHaveLength(2);
    expect(result.data.pairs[0]!.pair).toEqual({
      sourceSubgraphSystemId: 2,
      destSubgraphSystemId: 1,
    });
    expect(result.data.pairs[0]!.dataLinks.map(link => link.systemId)).toEqual([
      12,
    ]);
    expect(result.data.pairs[1]!.pair).toEqual({
      sourceSubgraphSystemId: 2,
      destSubgraphSystemId: 3,
    });
    expect(
      result.data.pairs[1]!.controlLinks.map(link => link.systemId),
    ).toEqual([23]);
  });

  it('fails discovery with deterministic diagnostics when supported data pairs form a cycle', () => {
    const service = new ManualPairDiscoveryService();
    const result = service.discover({
      selectedUsecases: [
        new UseCase({
          systemId: 100,
          fileSystemId: 1,
          keyVector: {valueSystemIds: []},
          subgraphSystemIds: [1, 2, 3],
          subgraphPairs: [
            {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
            {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
            {sourceSubgraphSystemId: 3, destSubgraphSystemId: 1},
          ],
        }),
      ],
      subgraphs: [subgraph(3), subgraph(1), subgraph(2)],
      dataLinks: [dataLink(23, 2, 3), dataLink(31, 3, 1), dataLink(12, 1, 2)],
      overlayDataLinks: [],
      controlLinks: [],
    });

    expect(result.kind).toBe('FAIL');
    if (result.kind !== 'FAIL') return;
    expect(result.issues).toEqual([
      {
        code: 'ARC-ROUTING-MANUAL-CYCLE',
        message:
          'Manual topology contains a data-link cycle: 1 -> 2 -> 3 -> 1 ' +
          '(supporting data links: [12, 23, 31]).',
        severity: 'ERROR',
      },
    ]);
  });
});
