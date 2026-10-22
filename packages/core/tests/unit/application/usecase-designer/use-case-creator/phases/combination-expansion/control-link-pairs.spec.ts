/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {deriveControlLinkPairs} from '../../../../../../../src/application/usecase-designer/use-case-creator/phases/combination-expansion/control-link-pairs.js';
import type {ControlLink} from '../../../../../../../src/domain/entities/usecase-data/links/control-link.js';

function controlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
): ControlLink {
  return {
    systemId,
    sourceSubgraphSystemId,
    destSubgraphSystemId,
  } as ControlLink;
}

const dataLinkPairs = [
  {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
  {sourceSubgraphSystemId: 20, destSubgraphSystemId: 30},
  {sourceSubgraphSystemId: 30, destSubgraphSystemId: 40},
];

const members = [10, 20, 30, 40];

describe('deriveControlLinkPairs', () => {
  it('emits one canonical pair for an uncovered control link between members', () => {
    const result = deriveControlLinkPairs(members, dataLinkPairs, {
      eligibleControlLinks: [controlLink(1, 20, 40)],
      preExistingUnorderedPairKeys: new Set(),
    });

    expect(result).toEqual([
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
    ]);
  });

  it('uses canonical ordering regardless of the control link direction', () => {
    const result = deriveControlLinkPairs(members, dataLinkPairs, {
      eligibleControlLinks: [controlLink(1, 40, 20)],
      preExistingUnorderedPairKeys: new Set(),
    });

    expect(result).toEqual([
      {sourceSubgraphSystemId: 20, destSubgraphSystemId: 40},
    ]);
  });

  it('emits one pair for several control links sharing endpoints', () => {
    const result = deriveControlLinkPairs(members, dataLinkPairs, {
      eligibleControlLinks: [controlLink(1, 20, 40), controlLink(2, 40, 20)],
      preExistingUnorderedPairKeys: new Set(),
    });

    expect(result).toHaveLength(1);
  });

  it('skips a control link already covered by a data-link pair', () => {
    const result = deriveControlLinkPairs(members, dataLinkPairs, {
      eligibleControlLinks: [controlLink(1, 20, 30)],
      preExistingUnorderedPairKeys: new Set(),
    });

    expect(result).toEqual([]);
  });

  it('skips a control link covered by a data-link pair in the opposite direction', () => {
    const result = deriveControlLinkPairs(members, dataLinkPairs, {
      eligibleControlLinks: [controlLink(1, 30, 20)],
      preExistingUnorderedPairKeys: new Set(),
    });

    expect(result).toEqual([]);
  });

  it('skips a control link already owned by a pre-existing UseCase', () => {
    const result = deriveControlLinkPairs(members, dataLinkPairs, {
      eligibleControlLinks: [controlLink(1, 20, 40)],
      preExistingUnorderedPairKeys: new Set(['20>40']),
    });

    expect(result).toEqual([]);
  });

  it('skips a control link with an endpoint outside the candidate', () => {
    const result = deriveControlLinkPairs(members, dataLinkPairs, {
      eligibleControlLinks: [controlLink(1, 20, 99)],
      preExistingUnorderedPairKeys: new Set(),
    });

    expect(result).toEqual([]);
  });

  it('orders emitted pairs deterministically', () => {
    const result = deriveControlLinkPairs([10, 20, 30, 40], [], {
      eligibleControlLinks: [controlLink(1, 40, 30), controlLink(2, 20, 10)],
      preExistingUnorderedPairKeys: new Set(),
    });

    expect(result).toEqual([
      {sourceSubgraphSystemId: 10, destSubgraphSystemId: 20},
      {sourceSubgraphSystemId: 30, destSubgraphSystemId: 40},
    ]);
  });
});
