/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunk} from './base-chunk.js';
import {CHUNK_TYPES} from '../constants/chunk-types.js';
import type {SpfProperties} from './spf-properties/index.js';
import type {
  SubgraphProperty,
  ContainerProperty,
  ModuleInstanceInfo,
  ModulePropertyConfig,
  DataLink,
  ControlLink,
} from './spf-properties/types.js';

/**
 * Represents a single subgraph data entry extracted from usecase data
 */
export interface SubgraphDataEntry {
  /** Subgraph ID */
  subgraphId: number;
  /** Driver properties data */
  driverProperties: Uint8Array;
  /** Parsed SPF properties */
  spfProperties: SpfProperties;
}

/**
 * Derived chunk containing subgraph data extracted from usecase entries.
 * This chunk is generated after parsing GKV_TABLE and DATAPOOL chunks,
 * by extracting subgraph properties from the datapool using sgPropOffset values.
 *
 * Dependencies: GKV_TABLE, DATAPOOL (parsed chunks, not raw binary data)
 */
export class SubgraphDataChunk extends BaseChunk {
  readonly chunkType = CHUNK_TYPES.SUBGRAPH_DATA;

  /** Array of extracted subgraph data entries */
  subgraphData: SubgraphDataEntry[] = [];

  /**
   * Add a subgraph data entry to the chunk
   */
  addSubgraphData(entry: SubgraphDataEntry): void {
    this.subgraphData.push(entry);
  }

  /**
   * Get all subgraph data entries
   */
  getAllSubgraphData(): SubgraphDataEntry[] {
    return [...this.subgraphData];
  }

  /**
   * Get the total number of subgraph data entries
   */
  getSubgraphDataCount(): number {
    return this.subgraphData.length;
  }

  /**
   * Clear all subgraph data entries
   */
  clearSubgraphData(): void {
    this.subgraphData = [];
  }

  /**
   * Extract all subgraphs from SPF properties
   */
  getAllSubgraphs(): SubgraphProperty[] {
    const subgraphs: SubgraphProperty[] = [];

    for (const entry of this.subgraphData) {
      if (entry.spfProperties.subgraphConfig) {
        subgraphs.push(
          ...entry.spfProperties.subgraphConfig.subgraphProperties,
        );
      }
    }

    return subgraphs;
  }

  /**
   * Extract all containers from SPF properties (deduplicated across subgraphs)
   */
  getAllContainers(): ContainerProperty[] {
    const containerMap = new Map<number, ContainerProperty>();

    for (const entry of this.subgraphData) {
      if (entry.spfProperties.containerConfig) {
        for (const container of entry.spfProperties.containerConfig
          .containerProperties) {
          // Use containerId as key to deduplicate
          if (!containerMap.has(container.containerId)) {
            containerMap.set(container.containerId, container);
          }
        }
      }
    }

    return [...containerMap.values()];
  }

  /**
   * Extract all modules from SPF properties
   */
  getAllModules(): ModuleInstanceInfo[] {
    const modules: ModuleInstanceInfo[] = [];

    for (const entry of this.subgraphData) {
      if (entry.spfProperties.moduleList) {
        modules.push(...entry.spfProperties.moduleList.moduleInstanceInfos);
      }
    }

    return modules;
  }

  /**
   * Extract all module properties from SPF properties
   */
  getAllModuleProperties(): ModulePropertyConfig[] {
    const moduleProperties: ModulePropertyConfig[] = [];

    for (const entry of this.subgraphData) {
      if (entry.spfProperties.moduleProperties) {
        moduleProperties.push(
          ...entry.spfProperties.moduleProperties.modulePropertyConfigs,
        );
      }
    }

    return moduleProperties;
  }

  /**
   * Extract all data links from SPF properties
   * @param subgraphIds Optional array of subgraph IDs to filter by. If not provided, returns all data links.
   */
  getAllDataLinks(subgraphIds?: number[]): DataLink[] {
    const dataLinks: DataLink[] = [];

    // If no subgraph filter is provided, return all data links
    if (!subgraphIds || subgraphIds.length === 0) {
      //TODO: deduplicate this for dangling links. Also, we should maintain per subgraph mapping? How to handle dangling link? Should it be part of usecase?
      for (const entry of this.subgraphData) {
        if (entry.spfProperties.dataLinks) {
          dataLinks.push(...entry.spfProperties.dataLinks.dataLinks);
        }
      }
      return dataLinks;
    }

    // Filter by specific subgraphs
    const subgraphSet = new Set(subgraphIds);
    for (const entry of this.subgraphData) {
      // Only include data links from the specified subgraphs
      if (subgraphSet.has(entry.subgraphId) && entry.spfProperties.dataLinks) {
        dataLinks.push(...entry.spfProperties.dataLinks.dataLinks);
      }
    }

    return dataLinks;
  }

  /**
   * Extract all control links from SPF properties
   */
  getAllControlLinks(): ControlLink[] {
    const controlLinks: ControlLink[] = [];
    //TODO: deduplicate this for dangling links. Also, we should maintain per subgraph mapping? How to handle dangling link? Should it be part of usecase?
    for (const entry of this.subgraphData) {
      if (entry.spfProperties.controlLinks) {
        controlLinks.push(...entry.spfProperties.controlLinks.controlLinks);
      }
    }

    return controlLinks;
  }
}
