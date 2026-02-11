/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunk} from './base-chunk.js';
import {CHUNK_TYPES} from '../constants/chunk-types.js';
import {KeyValuePairList} from '../../../../shared/types/key-value-pair.js';
import {SubgraphPair} from '../../../../shared/types/subgraph-pair.js';

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
 * Usecase data chunk containing GKV (Graph Key Vector) information.
 * Combines data from GKV_TABLE and GKV_LUT chunks to provide
 * multiple usecase entries, each with key-value pairs and subgraph offsets.
 *
 * Dependencies: GKV_LUT, DATAPOOL
 */
export class UsecaseDataChunk extends BaseChunk {
  readonly chunkType = CHUNK_TYPES.GKV_TABLE;

  /** Array of usecase entries, each containing key-value pairs and offsets */
  usecases: UsecaseEntry[] = [];
}
