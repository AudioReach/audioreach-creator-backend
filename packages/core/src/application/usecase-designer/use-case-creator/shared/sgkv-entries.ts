/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SubgraphReadModel} from '../../../ports/persistence/query-services/subgraph/subgraph-read-model.js';
import type {KvPair} from '../../../ports/persistence/repositories/shared/kv-pair.js';

/** One SGKV instance of a subgraph, as key/value definition IDs. */
export interface SgkvEntry {
  readonly sgSystemId: number;
  readonly sgkvSystemId: number;
  readonly keyValues: readonly KvPair[];
}

/**
 * Flattens the SGKVs of subgraphs read with `FULL_DETAILS` into routing
 * entries. A subgraph read with `SUMMARY` contributes none.
 */
export function toSgkvEntries(
  subgraphs: readonly SubgraphReadModel[],
): SgkvEntry[] {
  return subgraphs.flatMap(subgraph =>
    (subgraph.sgkvs ?? []).map(sgkv => ({
      sgSystemId: subgraph.systemId,
      sgkvSystemId: sgkv.systemId,
      keyValues: sgkv.keyValuePairs.map(pair => ({
        keyDefSystemId: pair.key.systemId,
        valueDefSystemId: pair.value.systemId,
      })),
    })),
  );
}
