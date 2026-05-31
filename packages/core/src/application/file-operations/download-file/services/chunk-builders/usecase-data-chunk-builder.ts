/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  UsecaseDataChunk,
  type GkvNumKeysGroup,
  type GkvKeyEntry,
  type GkvValueEntry,
} from '../../../shared/acdb-chunks/usecase-data-chunk.js';
import type {UsecaseDataDownloadModel} from '../../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import {SubgraphPair} from '../../../../../shared/types/subgraph-pair.js';

/**
 * Input for building usecase data chunk.
 */
export interface UsecaseDataChunkBuildInput {
  usecaseData: UsecaseDataDownloadModel[];
}

/**
 * Builder for usecase data chunk from database entities.
 *
 * Builds a 3-level grouped structure matching reference implementation:
 * - Level 1: Group by numKeys (number of key IDs)
 * - Level 2: Group by unique key combinations (deduplicated, sorted)
 * - Level 3: All value entries (NO deduplication - each DB row gets its own entry)
 *
 * Note: Even though business logic prevents duplicate key-value combinations,
 * the serialization format allows multiple entries per key to match behavior.
 * Each database row produces one LUT entry.
 *
 * Data arrives pre-sorted from database by: numKeys ASC, keyIds ASC, valueIds ASC
 *
 * Datapool offsets (sgPropOffset) are initialized to 0 and will be
 * assigned in Phase 2 (sequential datapool assignment).
 *
 * Usage:
 * ```typescript
 * const chunk = UsecaseDataChunkBuilder.buildChunk({usecaseData});
 * ```
 */
export const UsecaseDataChunkBuilder = {
  /**
   * Build usecase data chunk from database entities.
   * Creates 3-level grouped structure for GKV serialization.
   *
   * @param input - Usecase data from database with natural IDs (pre-sorted)
   * @returns Parsed usecase data chunk with gkvGroups
   */
  buildChunk(input: UsecaseDataChunkBuildInput): UsecaseDataChunk {
    const chunk = new UsecaseDataChunk();

    // Build 3-level grouped structure
    chunk.gkvGroups = this.buildGkvGroups(input.usecaseData);

    return chunk;
  },

  /**
   * Build 3-level GKV grouped structure from sorted usecase data.
   *
   * Structure:
   * - Level 1: numKeys groups (1, 2, 3, ...)
   * - Level 2: unique keys within each numKeys group (deduplicated)
   * - Level 3: all value entries for each key (NOT deduplicated)
   *
   * Each database row produces one value entry in the LUT, ensuring
   * the output matches the reference implementation.
   *
   * @param usecaseData - Pre-sorted usecase data from database
   * @returns Array of numKeys groups
   */
  buildGkvGroups(usecaseData: UsecaseDataDownloadModel[]): GkvNumKeysGroup[] {
    const groups: GkvNumKeysGroup[] = [];
    let currentGroup: GkvNumKeysGroup | null = null;
    let currentKey: GkvKeyEntry | null = null;

    for (const usecase of usecaseData) {
      const numKeys = usecase.keyIds.length;
      const keySignature = usecase.keyIds.join(',');

      // Level 1: Check if we need a new numKeys group
      if (!currentGroup || currentGroup.numKeys !== numKeys) {
        currentGroup = {
          numKeys,
          keys: [],
        };
        groups.push(currentGroup);
        currentKey = null;
      }

      // Level 2: Check if we need a new key entry
      if (!currentKey || currentKey.keyIds.join(',') !== keySignature) {
        currentKey = {
          keyIds: usecase.keyIds,
          values: [],
        };
        currentGroup.keys.push(currentKey);
      }

      // Level 3: Add value entry (no deduplication)
      // Each database row creates its own LUT entry, even if value IDs are the same.

      const valueEntry: GkvValueEntry = {
        valueIds: usecase.valueIds,
        sgListOffset: 0, // Will be assigned in Phase 2 serialization
        sgPropOffset: 0, // Will be assigned in Phase 2 serialization
        sgList: usecase.subgraphIds,
        sgPairList: usecase.subgraphPairs.map(
          pair => new SubgraphPair(pair.sourceSubgraphId, pair.destSubgraphId),
        ),
        subgraphs: [], // Will be populated from entities.subgraphData in serializer
      };
      currentKey.values.push(valueEntry);
    }

    return groups;
  },
};
