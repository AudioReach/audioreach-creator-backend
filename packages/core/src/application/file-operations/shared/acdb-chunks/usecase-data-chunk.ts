/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunk} from './base-chunk.js';
import {KeyValuePairList} from '../../../../shared/types/key-value-pair.js';
import {SubgraphPair} from '../../../../shared/types/subgraph-pair.js';
import {PARSED_CHUNK_TYPES} from '../constants/chunk-types.js';
import type {SubgraphDownloadModel} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';

/**
 * Represents a single usecase entry with its key-value pairs and subgraph data
 */
export interface UsecaseEntry {
  /** Key-value pairs for this usecase */
  keyValuePairList: KeyValuePairList;
  /** Subgraph property offset for accessing DATAPOOL chunk */
  sgPropOffset: number;
  /** List of subgraph IDs parsed from DATAPOOL */
  sgList: number[];
  /** List of subgraph connection pairs parsed from DATAPOOL */
  sgPairList: SubgraphPair[];
}

/**
 * Represents a value entry with its associated subgraph data.
 * Multiple usecases with same key but different values are grouped here.
 */
export interface GkvValueEntry {
  /** Value IDs for this entry */
  valueIds: number[];

  /** Subgraph list offset for accessing DATAPOOL chunk */
  sgListOffset: number;

  /** Subgraph property offset for accessing DATAPOOL chunk */
  sgPropOffset: number;

  /** List of subgraph IDs */
  sgList: number[];

  /** List of subgraph connection pairs */
  sgPairList: SubgraphPair[];

  /** Complete subgraph data for serialization */
  subgraphs: SubgraphDownloadModel[];
}

/**
 * Represents a key entry with all its value variations.
 * This is the second level of the 3-level structure.
 */
export interface GkvKeyEntry {
  /** Key IDs for this entry */
  keyIds: number[];
  /** All value variations for this key */
  values: GkvValueEntry[];
}

/**
 * Represents a numKeys group (first level of 3-level structure).
 * Groups all keys that have the same number of key IDs.
 */
export interface GkvNumKeysGroup {
  /** Number of keys in this group */
  numKeys: number;
  /** All unique keys with this numKeys */
  keys: GkvKeyEntry[];
}

/**
 * Usecase data chunk containing GKV (Graph Key Vector) information.
 * Combines data from GKV_TABLE and GKV_LUT chunks to provide
 * multiple usecase entries, each with key-value pairs and subgraph offsets.
 *
 * Structure matches implementation:
 * - Level 1: Group by numKeys (number of key IDs)
 * - Level 2: Group by unique key combinations (sorted)
 * - Level 3: Group by unique value combinations (sorted)
 *
 * Dependencies: GKV_LUT, DATAPOOL
 */
export class UsecaseDataChunk extends BaseChunk {
  readonly chunkType = PARSED_CHUNK_TYPES.USECASE_DATA;

  /** Array of usecase entries (legacy format for upload/parsing) */
  usecases: UsecaseEntry[] = [];

  /** 3-level grouped structure for download (matches format) */
  gkvGroups: GkvNumKeysGroup[] = [];
}
