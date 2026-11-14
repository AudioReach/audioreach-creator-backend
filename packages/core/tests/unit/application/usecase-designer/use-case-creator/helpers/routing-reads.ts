/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BatchRead} from '../../../../../../src/application/ports/persistence/batch-read.js';
import type {SubgraphReadModel} from '../../../../../../src/application/ports/persistence/query-services/subgraph/subgraph-read-model.js';
import type {KeyValuePairReadModel} from '../../../../../../src/application/ports/persistence/query-services/usecase/query-models/key-vector-read-model.js';
import type {KvPair} from '../../../../../../src/application/ports/persistence/repositories/shared/kv-pair.js';
import type {SgkvEntry} from '../../../../../../src/application/usecase-designer/use-case-creator/shared/sgkv-entries.js';
import {ENTITY_TYPE} from '../../../../../../src/shared/entity-type.js';
import {batchOf} from '../../../../../helpers/index.js';

type SubgraphBatch = BatchRead<SubgraphReadModel, typeof ENTITY_TYPE.Subgraph>;

/**
 * The subgraphs `ids`, each carrying the SGKVs `entries` give it. Every
 * requested subgraph is found.
 */
export function subgraphsWithSgkvs(
  ids: readonly number[],
  entries: readonly SgkvEntry[],
): SubgraphBatch {
  return batchOf(
    ENTITY_TYPE.Subgraph,
    ids.map(systemId => ({
      systemId,
      naturalId: systemId,
      name: `SG ${systemId}`,
      isImported: false,
      sgkvs: entries
        .filter(entry => entry.sgSystemId === systemId)
        .map(entry => ({
          systemId: entry.sgkvSystemId,
          keyValuePairs: entry.keyValues.map(keyValuePair),
        })),
    })),
  );
}

/** A `findSubgraphs` fake that serves the SGKVs `entries` give. */
export function findSubgraphsWithSgkvs(entries: readonly SgkvEntry[] = []) {
  return async (
    _fileSystemId: number,
    ids: readonly number[],
  ): Promise<SubgraphBatch> => subgraphsWithSgkvs(ids, entries);
}

/** The key/value pairs `pairs`, as `findKeyValuePairs` returns them. */
export function keyValuePairsOf(
  pairs: readonly KvPair[],
): BatchRead<KeyValuePairReadModel, typeof ENTITY_TYPE.ValueDefinition> {
  return batchOf(ENTITY_TYPE.ValueDefinition, pairs.map(keyValuePair));
}

function keyValuePair(pair: KvPair): KeyValuePairReadModel {
  return {
    key: {
      systemId: pair.keyDefSystemId,
      naturalId: pair.keyDefSystemId,
      name: `Key ${pair.keyDefSystemId}`,
    },
    value: {
      systemId: pair.valueDefSystemId,
      naturalId: pair.valueDefSystemId,
      name: `Value ${pair.valueDefSystemId}`,
    },
  };
}
