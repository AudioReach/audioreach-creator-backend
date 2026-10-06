/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {ControlLink} from '../../../../../../src/domain/entities/usecase-data/links/control-link.js';
import {DataLink} from '../../../../../../src/domain/entities/usecase-data/links/data-link.js';
import type {SubgraphPair} from '../../../../../../src/domain/entities/usecase-data/usecase/usecase.js';
import {ManualLinkSupportResolver} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/manual-link-support-resolver.js';

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

describe('ManualLinkSupportResolver', () => {
  const resolver = new ManualLinkSupportResolver();

  it('uses current data direction and groups every same-direction supporting link', () => {
    const result = resolver.resolve({
      candidates: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
      dataLinks: [dataLink(11, 2, 1), dataLink(12, 2, 1)],
      overlayDataLinks: [dataLink(11, 2, 1), dataLink(12, 2, 1)],
      controlLinks: [controlLink(21, 1, 2)],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.pair).toEqual({
      sourceSubgraphSystemId: 2,
      destSubgraphSystemId: 1,
    });
    expect(result[0]!.dataLinks.map(link => link.systemId)).toEqual([11, 12]);
    expect(result[0]!.controlLinks).toEqual([]);
  });

  it('suppresses control fallback when overlay data exists but all data is excluded', () => {
    const result = resolver.resolve({
      candidates: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
      dataLinks: [],
      overlayDataLinks: [dataLink(11, 1, 2)],
      controlLinks: [controlLink(21, 1, 2)],
    });

    expect(result).toEqual([]);
  });

  it('uses canonical direction for a control-only relationship', () => {
    const result = resolver.resolve({
      candidates: [{sourceSubgraphSystemId: 8, destSubgraphSystemId: 3}],
      dataLinks: [],
      overlayDataLinks: [],
      controlLinks: [controlLink(21, 8, 3)],
    });

    expect(result[0]!.pair).toEqual({
      sourceSubgraphSystemId: 3,
      destSubgraphSystemId: 8,
    });
    expect(result[0]!.dataLinks).toEqual([]);
    expect(result[0]!.controlLinks.map(link => link.systemId)).toEqual([21]);
  });

  it('emits opposite data directions as distinct pairs in numeric direction order', () => {
    const result = resolver.resolve({
      candidates: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
      dataLinks: [dataLink(22, 2, 1), dataLink(11, 1, 2)],
      overlayDataLinks: [],
      controlLinks: [],
    });

    expect(result.map(item => item.pair)).toEqual([
      {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
      {sourceSubgraphSystemId: 2, destSubgraphSystemId: 1},
    ]);
  });

  it('retains every same-direction data support link once and sorts by system ID', () => {
    const result = resolver.resolve({
      candidates: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
      dataLinks: [dataLink(30, 1, 2), dataLink(10, 1, 2), dataLink(20, 1, 2)],
      overlayDataLinks: [],
      controlLinks: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.dataLinks.map(link => link.systemId)).toEqual([
      10, 20, 30,
    ]);
  });

  it('retains multiple control links under one canonical pair', () => {
    const result = resolver.resolve({
      candidates: [{sourceSubgraphSystemId: 1, destSubgraphSystemId: 2}],
      dataLinks: [],
      overlayDataLinks: [],
      controlLinks: [controlLink(22, 2, 1), controlLink(11, 1, 2)],
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.pair).toEqual({
      sourceSubgraphSystemId: 1,
      destSubgraphSystemId: 2,
    });
    expect(result[0]!.controlLinks.map(link => link.systemId)).toEqual([
      11, 22,
    ]);
  });

  it('suppresses fallback only for the relationship with excluded data evidence', () => {
    const result = resolver.resolve({
      candidates: [
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
        {sourceSubgraphSystemId: 1, destSubgraphSystemId: 3},
      ],
      dataLinks: [],
      overlayDataLinks: [dataLink(12, 1, 2)],
      controlLinks: [controlLink(22, 1, 2), controlLink(23, 1, 3)],
    });

    expect(result.map(item => item.pair)).toEqual([
      {sourceSubgraphSystemId: 1, destSubgraphSystemId: 3},
    ]);
  });

  it('omits unsupported candidates while preserving supported candidates', () => {
    const candidates: readonly SubgraphPair[] = [
      {sourceSubgraphSystemId: 1, destSubgraphSystemId: 2},
      {sourceSubgraphSystemId: 2, destSubgraphSystemId: 3},
      {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
    ];
    const result = resolver.resolve({
      candidates,
      dataLinks: [dataLink(12, 2, 1)],
      overlayDataLinks: [],
      controlLinks: [controlLink(34, 3, 4)],
    });

    expect(result.map(item => item.pair)).toEqual([
      {sourceSubgraphSystemId: 2, destSubgraphSystemId: 1},
      {sourceSubgraphSystemId: 3, destSubgraphSystemId: 4},
    ]);
  });
});
