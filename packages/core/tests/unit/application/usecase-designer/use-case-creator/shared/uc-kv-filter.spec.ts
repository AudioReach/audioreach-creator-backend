/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  applyUcFilterToSg,
  type UcFilter,
} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/uc-kv-filter.js';
import {FAILED_ENTITY_REASON} from '../../../../../../src/application/ports/persistence/batch-read.js';
import type {SubgraphRepository} from '../../../../../../src/application/ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {SgkvEntry} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/sgkv-entries.js';
import {ResourceNotFoundException} from '../../../../../../src/application/shared/exceptions/resource-not-found.exception.js';
import {ENTITY_TYPE} from '../../../../../../src/shared/entity-type.js';
import {batchOf} from '../../../../../helpers/index.js';
import {subgraphsWithSgkvs} from '../helpers/routing-reads.js';

/**
 * A `SubgraphRepository` holding the subgraphs of one file. A subgraph
 * requested from any other file is not found.
 */
function inMemorySubgraphRepo(rows: {
  fileSystemId: number;
  sgkvs: Record<number, SgkvEntry[]>;
}): SubgraphRepository {
  return {
    findSubgraphs: async (fileSystemId: number, ids: readonly number[]) =>
      fileSystemId === rows.fileSystemId
        ? subgraphsWithSgkvs(ids, Object.values(rows.sgkvs).flat())
        : batchOf(
            ENTITY_TYPE.Subgraph,
            [],
            ids.map(systemId => ({
              systemId,
              reason: FAILED_ENTITY_REASON.NotFound,
            })),
          ),
  } as unknown as SubgraphRepository;
}

describe('applyUcFilterToSg', () => {
  const K1 = 100;
  const K2 = 200;
  const V10 = 10;
  const V11 = 11;
  const V20 = 20;
  const V21 = 21;

  it('retains only (keyDef,valueDef) pairs present in the filter', async () => {
    const filter: UcFilter = new Map([
      [K1, new Set([V10])],
      [K2, new Set([V20])],
    ]);
    const repo = inMemorySubgraphRepo({
      fileSystemId: 10,
      sgkvs: {
        0xa1: [
          {
            sgSystemId: 0xa1,
            sgkvSystemId: 500,
            keyValues: [
              {keyDefSystemId: K1, valueDefSystemId: V10},
              {keyDefSystemId: K2, valueDefSystemId: V21},
            ],
          },
          // V10 retained, V21 dropped (K2 doesn't allow V21)
          {
            sgSystemId: 0xa1,
            sgkvSystemId: 501,
            keyValues: [{keyDefSystemId: K1, valueDefSystemId: V11}],
          },
          // V11 dropped → SGKV 501 becomes empty and is dropped
        ],
      },
    });
    const result = await applyUcFilterToSg(10, 0xa1, filter, repo);
    expect(result).toHaveLength(1);
    expect(result[0].sgkvSystemId).toBe(500);
    expect(result[0].keyValues).toEqual([
      {keyDefSystemId: K1, valueDefSystemId: V10},
    ]);
  });

  it('drops SGKVs where every pair is filtered out', async () => {
    const filter: UcFilter = new Map([[K1, new Set([V10])]]);
    const repo = inMemorySubgraphRepo({
      fileSystemId: 10,
      sgkvs: {
        0xa1: [
          {
            sgSystemId: 0xa1,
            sgkvSystemId: 500,
            keyValues: [{keyDefSystemId: K1, valueDefSystemId: V11}],
          },
        ],
      },
    });
    expect(await applyUcFilterToSg(10, 0xa1, filter, repo)).toEqual([]);
  });

  it('returns [] when the SG has no SGKVs on the given file', async () => {
    const filter: UcFilter = new Map([[K1, new Set([V10])]]);
    const repo = inMemorySubgraphRepo({fileSystemId: 10, sgkvs: {}});
    expect(await applyUcFilterToSg(10, 0xa1, filter, repo)).toEqual([]);
  });

  it('throws when the SG is not on the given file', async () => {
    const filter: UcFilter = new Map([[K1, new Set([V10])]]);
    const repo = inMemorySubgraphRepo({
      fileSystemId: 10,
      sgkvs: {
        0xa1: [
          {
            sgSystemId: 0xa1,
            sgkvSystemId: 500,
            keyValues: [{keyDefSystemId: K1, valueDefSystemId: V10}],
          },
        ],
      },
    });
    await expect(applyUcFilterToSg(999, 0xa1, filter, repo)).rejects.toThrow(
      ResourceNotFoundException,
    );
  });

  it('is stateless — repeated calls return equivalent results', async () => {
    const filter: UcFilter = new Map([[K1, new Set([V10])]]);
    const repo = inMemorySubgraphRepo({
      fileSystemId: 10,
      sgkvs: {
        0xa1: [
          {
            sgSystemId: 0xa1,
            sgkvSystemId: 500,
            keyValues: [{keyDefSystemId: K1, valueDefSystemId: V10}],
          },
        ],
      },
    });
    const first = await applyUcFilterToSg(10, 0xa1, filter, repo);
    const second = await applyUcFilterToSg(10, 0xa1, filter, repo);
    expect(first.map(s => s.sgkvSystemId)).toEqual(
      second.map(s => s.sgkvSystemId),
    );
  });
});
