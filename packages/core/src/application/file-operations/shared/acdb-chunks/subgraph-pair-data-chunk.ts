/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunk} from './base-chunk.js';
import {CHUNK_TYPES} from '../constants/chunk-types.js';
import type {DataLink, ControlLink} from './spf-properties/types.js';
import type {SubgraphPair} from '../../../../shared/types/subgraph-pair.js';

/**
 * Represents a single subgraph pair entry with its connections
 */
export interface SubgraphPairEntry {
  /** Source subgraph ID */
  sourceSubgraphId: number;
  /** Destination subgraph ID */
  destinationSubgraphId: number;
  /** Data links between modules in these subgraphs */
  dataLinks: DataLink[];
  /** Control links between modules in these subgraphs */
  controlLinks: ControlLink[];
}

/**
 * Subgraph pair data chunk containing SCLU (Subgraph Connection LUT) information.
 * Combines data from SCLU, SCDE, and SCDO chunks with DATAPOOL to provide
 * subgraph connection pairs, each with data and control links.
 *
 * Dependencies: SCLU, SCDE, SCDO, DATAPOOL
 */
export class SubgraphPairDataChunk extends BaseChunk {
  readonly chunkType = CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT;

  /** Array of subgraph pair entries, each containing connection data */
  subgraphPairs: SubgraphPairEntry[] = [];

  /**
   * Get data links for specific subgraph pairs
   * @param subgraphPairs Array of subgraph pairs to get data links for
   * @returns Array of data links matching the specified subgraph pairs
   */
  getDataLinksForSubgraphPairs(subgraphPairs: SubgraphPair[]): DataLink[] {
    if (!subgraphPairs || subgraphPairs.length === 0) {
      return [];
    }

    const dataLinks: DataLink[] = [];

    // Find matching subgraph pair entries and collect their data links
    for (const entry of this.subgraphPairs) {
      for (const pair of subgraphPairs) {
        if (
          entry.sourceSubgraphId === pair.source &&
          entry.destinationSubgraphId === pair.destination
        ) {
          dataLinks.push(...entry.dataLinks);
          break; // Found match, no need to check other pairs for this entry
        }
      }
    }

    return dataLinks;
  }

  /**
   * Get all data links from all subgraph pairs
   * @returns Array of all data links
   */
  getAllDataLinks(): DataLink[] {
    const dataLinks: DataLink[] = [];
    for (const entry of this.subgraphPairs) {
      dataLinks.push(...entry.dataLinks);
    }
    return dataLinks;
  }
}
