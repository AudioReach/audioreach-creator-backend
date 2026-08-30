/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  SgkvEntry,
  SubgraphRepository,
} from '../../ports/persistence/repositories/subgraph/subgraph.repository.js';

/**
 * UC-filter map: KeyDefSystemId → Set<ValueDefSystemId>.
 * A given key may map to multiple allowed values when different selected
 * UCs assign different values to the same key.
 */
export type UcFilter = ReadonlyMap<number, ReadonlySet<number>>;

/**
 * Applies a UC filter to the SGKV set of a single SG on `fileSystemId`.
 * Retains only KV pairs whose (keyDef, valueDef) appears in `ucFilter`.
 * Drops SGKV instances that become empty. Returns new SgkvEntry objects
 * with filtered keyValues; never mutates inputs.
 *
 * Consumers: Phase 2 (LLD4 §5.4.b legacy EC UC narrow check),
 *            Phase 4 (LLD1 §6.2 FR-KV-02 UC-filtered baseline).
 */
export async function applyUcFilterToSg(
  fileSystemId: number,
  sgSystemId: number,
  ucFilter: UcFilter,
  subgraphRepo: SubgraphRepository,
): Promise<SgkvEntry[]> {
  const all = await subgraphRepo.getSgkvs(fileSystemId, [sgSystemId]);
  const result: SgkvEntry[] = [];
  for (const entry of all) {
    const retained = entry.keyValues.filter(kv => {
      const allowed = ucFilter.get(kv.keyDefSystemId);
      return allowed?.has(kv.valueDefSystemId) ?? false;
    });
    if (retained.length > 0) result.push({...entry, keyValues: retained});
  }
  return result;
}
