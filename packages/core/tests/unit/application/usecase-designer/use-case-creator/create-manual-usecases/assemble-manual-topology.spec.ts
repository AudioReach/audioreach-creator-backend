/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, expect, it} from '@jest/globals';
import {RESULT_KIND} from '../../../../../../src/application/shared/result/result.js';
import {assembleManualTopology} from '../../../../../../src/application/usecase-designer/use-case-creator/create-manual-usecases/manual-topology-assembler.js';

function dataLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
) {
  return {systemId, sourceSubgraphSystemId, destSubgraphSystemId} as never;
}

function controlLink(
  systemId: number,
  sourceSubgraphSystemId: number,
  destSubgraphSystemId: number,
) {
  return {systemId, sourceSubgraphSystemId, destSubgraphSystemId} as never;
}

describe('assembleManualTopology', () => {
  const dl801 = dataLink(801, 10, 20);
  const cl901 = controlLink(901, 10, 20);

  it('builds topology from routable data and control links', () => {
    const result = assembleManualTopology([dl801], [cl901], [10, 20]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.pairs).toHaveLength(1);
    expect(result.data.isolatedSubgraphSystemIds).toHaveLength(0);
  });

  it('returns empty pairs for empty links but tracks all subgraphs as isolated', () => {
    const result = assembleManualTopology([], [], [10, 20]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.pairs).toHaveLength(0);
    expect(result.data.isolatedSubgraphSystemIds).toEqual([10, 20]);
  });

  it('tracks subgraphs not in any pair as isolated', () => {
    const result = assembleManualTopology([dl801], [], [10, 20, 30]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.pairs).toHaveLength(1);
    // SG 30 is not a pair endpoint → isolated
    expect(result.data.isolatedSubgraphSystemIds).toEqual([30]);
  });

  it('rejects directed data cycles', () => {
    const result = assembleManualTopology(
      [dataLink(1, 10, 20), dataLink(2, 20, 30), dataLink(3, 30, 10)],
      [],
      [10, 20, 30],
    );

    expect(result.kind).toBe(RESULT_KIND.Fail);
    if (result.kind !== RESULT_KIND.Fail) throw new Error('Expected failure');
    expect(result.issues[0]?.code).toBe('ARC-ROUTING-MANUAL-CYCLE');
  });

  it('assembles control-only topology with isolated subgraph', () => {
    const result = assembleManualTopology([], [cl901], [10, 20, 30]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.pairs[0]?.dataLinks).toHaveLength(0);
    expect(result.data.pairs[0]?.controlLinks.length).toBeGreaterThan(0);
    expect(result.data.isolatedSubgraphSystemIds).toEqual([30]);
  });

  it('isolated-subgraph-only topology (no links) is valid', () => {
    const result = assembleManualTopology([], [], [42]);

    expect(result.kind).toBe(RESULT_KIND.Ok);
    if (result.kind === RESULT_KIND.Fail) throw new Error('Expected success');
    expect(result.data.pairs).toHaveLength(0);
    expect(result.data.isolatedSubgraphSystemIds).toEqual([42]);
  });
});
