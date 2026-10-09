/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {logicalEcConnections} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/logical-ec-connections.js';
import {DATA_LINK_TYPE} from '../../../../../../src/domain/entities/usecase-data/links/data-link-type.js';
import type {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';

function ecLink(
  systemId: number,
  source: number,
  destination: number,
): DataLink {
  return {
    systemId,
    sourceSubgraphSystemId: source,
    destSubgraphSystemId: destination,
    linkType: DATA_LINK_TYPE.Ec,
  } as DataLink;
}

describe('logicalEcConnections', () => {
  it('represents one physical EC link as one logical connection', () => {
    expect(logicalEcConnections([ecLink(10, 1, 2)], new Set())).toEqual([
      {
        representativeDataLinkSystemId: 10,
        leftSubgraphSystemId: 1,
        rightSubgraphSystemId: 2,
        subgraphSystemIds: [1, 2],
        dataLinkSystemIds: [10],
      },
    ]);
  });

  it('collapses a directed EC chain whose interior subgraphs are all MDF', () => {
    expect(
      logicalEcConnections(
        [ecLink(10, 1, 2), ecLink(11, 2, 3), ecLink(12, 3, 4)],
        new Set([2, 3]),
      ),
    ).toEqual([
      {
        representativeDataLinkSystemId: 10,
        leftSubgraphSystemId: 1,
        rightSubgraphSystemId: 4,
        subgraphSystemIds: [1, 2, 3, 4],
        dataLinkSystemIds: [10, 11, 12],
      },
    ]);
  });

  it.each([
    {
      name: 'branch',
      links: [ecLink(10, 1, 2), ecLink(11, 2, 3), ecLink(12, 2, 4)],
      mdfIds: new Set([2]),
    },
    {
      name: 'parallel links',
      links: [ecLink(10, 1, 2), ecLink(11, 1, 2)],
      mdfIds: new Set<number>(),
    },
    {
      name: 'disconnected links',
      links: [ecLink(10, 1, 2), ecLink(11, 3, 4)],
      mdfIds: new Set<number>(),
    },
    {
      name: 'MDF cycle',
      links: [ecLink(10, 1, 2), ecLink(11, 2, 1)],
      mdfIds: new Set([1, 2]),
    },
  ])(
    'does not collapse $name into one logical connection',
    ({links, mdfIds}) => {
      expect(logicalEcConnections(links, mdfIds)).toHaveLength(links.length);
    },
  );
});
