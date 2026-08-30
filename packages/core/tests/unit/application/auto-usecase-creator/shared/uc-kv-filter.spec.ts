/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect} from '@jest/globals';
import {
  applyUcFilterToSg,
  type UcFilter,
} from '../../../../../src/application/auto-usecase-creator/shared/uc-kv-filter.js';
import type {
  SessionChanged,
  SgkvEntry,
  Subgraph,
  SubgraphRepository,
} from '@arc/core';

/**
 * In-memory `SubgraphRepository` implementation for these unit tests.
 * Each method has an honest implementation backed by the fixture map;
 * unused methods are wired to throw so a test that unexpectedly reaches
 * them fails loudly instead of silently returning defaults.
 */
class InMemorySubgraphRepo implements SubgraphRepository {
  constructor(
    private readonly rows: {
      fileSystemId: number;
      sgkvs: Record<number, SgkvEntry[]>;
    },
  ) {}

  async subgraphExists(
    _systemId: number,
    _fileSystemId: number,
  ): Promise<boolean> {
    throw new Error('subgraphExists not exercised by applyUcFilterToSg tests');
  }

  async createSubgraph(): Promise<void> {
    throw new Error('createSubgraph not exercised by applyUcFilterToSg tests');
  }

  async getSgkvs(
    fileSystemId: number,
    sgSystemIds: readonly number[],
  ): Promise<SgkvEntry[]> {
    if (fileSystemId !== this.rows.fileSystemId) return [];
    const out: SgkvEntry[] = [];
    for (const sgId of sgSystemIds) {
      out.push(...(this.rows.sgkvs[sgId] ?? []));
    }
    return out;
  }

  async findByIds(): Promise<never[]> {
    throw new Error('findByIds not exercised by applyUcFilterToSg tests');
  }

  async findIsMdfInScope(): Promise<never[]> {
    throw new Error(
      'findIsMdfInScope not exercised by applyUcFilterToSg tests',
    );
  }

  async findChangedInSession(): Promise<SessionChanged<Subgraph>> {
    throw new Error(
      'findChangedInSession not exercised by applyUcFilterToSg tests',
    );
  }
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
    const repo = new InMemorySubgraphRepo({
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
    const repo = new InMemorySubgraphRepo({
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
    const repo = new InMemorySubgraphRepo({fileSystemId: 10, sgkvs: {}});
    expect(await applyUcFilterToSg(10, 0xa1, filter, repo)).toEqual([]);
  });

  it('respects fileSystemId scope', async () => {
    const filter: UcFilter = new Map([[K1, new Set([V10])]]);
    const repo = new InMemorySubgraphRepo({
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
    expect(await applyUcFilterToSg(999, 0xa1, filter, repo)).toEqual([]);
  });

  it('is stateless — repeated calls return equivalent results', async () => {
    const filter: UcFilter = new Map([[K1, new Set([V10])]]);
    const repo = new InMemorySubgraphRepo({
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
