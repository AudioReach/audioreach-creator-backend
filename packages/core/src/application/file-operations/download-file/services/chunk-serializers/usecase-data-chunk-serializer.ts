/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  UsecaseDataChunk,
  GkvNumKeysGroup,
} from '../../../shared/acdb-chunks/usecase-data-chunk.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import type {
  SubgraphDownloadModel,
  ContainerDownloadModel,
} from '../../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {
  SPF_APM_MODULE_ID,
  PARAM_ID_SUB_GRAPH_CONFIG,
  PARAM_ID_CONTAINER_CONFIG,
  PARAM_ID_MODULES_LIST,
  PARAM_ID_MODULE_PROP,
  PARAM_ID_MODULE_DATA_LINK,
  PARAM_ID_MODULE_CTRL_LINK,
  MODULE_PROP_ID_PORT_INFO,
  MODULE_PROP_ID_CTRL_HEAP_ID,
  MODULE_PROP_ID_CTRL_LINK_INTENTS,
  CONTAINER_PROP_ID_PARENT_CONTAINER,
  HEAP_ID_DEFAULT,
  ID_DONT_CARE_DUMMY,
} from '../../../shared/constants/spf-ids.js';
import {isVoiceSubgraph} from '../../../shared/utils/subgraph-utils.js';

/**
 * Result of usecase data serialization containing two chunks.
 */
export interface UsecaseDataSerializationResult {
  gkvTable: Uint8Array;
  gkvLut: Uint8Array;
}

/**
 * Orchestrator serializer for usecase data.
 * Coordinates serialization of GKV_TABLE and GKV_LUT chunks.
 *
 * This is Phase 2 & 3 of the 3-phase download architecture:
 * - Phase 1: Parallel chunk building (already done)
 * - Phase 2: Sequential datapool assignment (done here)
 * - Phase 3: Binary serialization (done here)
 *
 * Process:
 * 1. For each value entry, serialize subgraph data to datapool and assign offset
 * 2. Build LUT offset map for GKV_TABLE generation
 * 3. Serialize GKV_TABLE with LUT offsets
 * 4. Serialize GKV_LUT with datapool offsets
 *
 */
export class UsecaseDataChunkSerializer {
  /**
   * Serialize usecase data chunk to binary format.
   *
   * @param chunk - Usecase data chunk with gkvGroups
   * @param datapool - Datapool chunk for sequential offset assignment
   * @param subgraphData - Complete subgraph data from database
   * @param containerData - Complete container data from database
   * @returns Serialization result with GKV_TABLE and GKV_LUT chunks
   */
  serialize(
    chunk: UsecaseDataChunk,
    datapool: DatapoolChunk,
    subgraphData: SubgraphDownloadModel[],
    containerData: ContainerDownloadModel[],
  ): UsecaseDataSerializationResult {
    // Build subgraph lookup map for efficient access
    const subgraphMap = new Map(subgraphData.map(sg => [sg.subgraphId, sg]));

    // Build container lookup map for efficient access
    const containerMap = new Map(containerData.map(c => [c.containerId, c]));

    // Phase 2: Sequential datapool assignment
    // Assign TWO offsets to all value entries
    for (const group of chunk.gkvGroups) {
      for (const keyEntry of group.keys) {
        for (const valueEntry of keyEntry.values) {
          // Populate subgraphs from subgraphData based on sgList
          valueEntry.subgraphs = valueEntry.sgList
            .map(id => subgraphMap.get(id))
            .filter((sg): sg is SubgraphDownloadModel => sg !== undefined);

          // Generate and add subgraph list payload (topology-sorted connections)
          const sgListPayload = this.serializeSubgraphListPayload(
            valueEntry.sgList,
            valueEntry.sgPairList,
          );
          valueEntry.sgListOffset = datapool.addOrReuse(sgListPayload);

          // Generate and add subgraph property payload (complete subgraph data)
          const sgPropPayload = this.serializeSubgraphPropertyPayload(
            valueEntry.subgraphs,
            containerMap,
          );
          valueEntry.sgPropOffset = datapool.addOrReuse(sgPropPayload);
        }
      }
    }

    // Build LUT offset map for GKV_TABLE
    // Maps key signature -> offset in GKV_LUT chunk
    const lutOffsets = this.buildLutOffsetMap(chunk.gkvGroups);

    // Phase 3: Binary serialization
    // Serialize GKV_TABLE with LUT offsets
    const gkvTable = this.serializeGkvTable(chunk.gkvGroups, lutOffsets);

    // Serialize GKV_LUT with datapool offsets
    const gkvLut = this.serializeGkvLut(chunk.gkvGroups);

    return {
      gkvTable,
      gkvLut,
    };
  }

  /**
   * Build map of key signatures to their LUT offsets.
   * LUT offset is the byte position in GKV_LUT chunk where this key's data starts.
   *
   * @param gkvGroups - 3-level grouped GKV structure
   * @returns Map of key signature to LUT offset
   */
  private buildLutOffsetMap(gkvGroups: GkvNumKeysGroup[]): Map<string, number> {
    const lutOffsets = new Map<string, number>();
    let currentOffset = 0;

    for (const group of gkvGroups) {
      for (const keyEntry of group.keys) {
        const keySignature = keyEntry.keyIds.join(',');
        lutOffsets.set(keySignature, currentOffset);

        // Calculate size of this key's LUT entry
        const entrySize =
          BinaryUtils.SIZEOF_UINT32 + // NumGKeyVals
          BinaryUtils.SIZEOF_UINT32 + // NumGKVLUTEntries
          keyEntry.values.length *
            (group.numKeys * BinaryUtils.SIZEOF_UINT32 + // Value IDs
              BinaryUtils.SIZEOF_UINT32 + // OffsetSGListData
              BinaryUtils.SIZEOF_UINT32); // OffsetSGData

        currentOffset += entrySize;
      }
    }

    return lutOffsets;
  }

  /**
   * Perform DFS-based topological sort on subgraph pairs.
   * Returns subgraphs in reverse order (sink to source) per spec 7.6.4.
   *
   * @param sgList - List of subgraph IDs
   * @param sgPairList - List of subgraph connection pairs
   * @returns Subgraph IDs in reverse topological order
   */
  private topologicalSort(
    sgList: readonly number[],
    sgPairList: readonly {source: number; destination: number}[],
  ): number[] {
    if (sgList.length === 0) {
      return [];
    }

    const reverseOrder: number[] = [];
    const visited = new Set<number>();

    // DFS helper
    const dfs = (sgId: number): void => {
      if (visited.has(sgId)) {
        return;
      }

      visited.add(sgId);

      // Find all destinations from this source
      const pairs = sgPairList.filter(pair => pair.source === sgId);

      for (const pair of pairs) {
        if (sgList.includes(pair.destination)) {
          dfs(pair.destination);
        }
      }

      // Add to reverse order after visiting all descendants
      reverseOrder.push(sgId);
    };

    // Visit all subgraphs
    for (const sgId of sgList) {
      if (!visited.has(sgId)) {
        dfs(sgId);
      }
    }

    return reverseOrder;
  }

  /**
   * Build source→destinations map from reverse-ordered subgraph list.
   * Only includes sources that have at least one destination.
   *
   * @param reverseOrder - Subgraphs in reverse topological order
   * @param sgPairList - List of subgraph connection pairs
   * @returns Map of source ID to array of destination IDs
   */
  private buildSubgraphPairMap(
    reverseOrder: readonly number[],
    sgPairList: readonly {source: number; destination: number}[],
  ): Map<number, number[]> {
    const pairMap = new Map<number, number[]>();

    for (const srcId of reverseOrder) {
      // Find all pairs where this subgraph is the source
      const pairs = sgPairList.filter(pair => pair.source === srcId);

      if (pairs.length > 0) {
        const destinations = pairs.map(pair => pair.destination);
        pairMap.set(srcId, destinations);
      }
    }

    return pairMap;
  }

  /**
   * Serialize subgraph list with topology sort.
   * Based on reference GetSubGraphListPayload().
   *
   * Binary format:
   * - NumSourceSubgraphs: 4 bytes
   * - For each source:
   *   - SourceSGID: 4 bytes
   *   - NumDestSubgraphs: 4 bytes
   *   - DestSGID[]: NumDest × 4 bytes
   *
   * @param sgList - List of subgraph IDs
   * @param sgPairList - List of subgraph connection pairs
   * @returns Binary payload for datapool
   */
  private serializeSubgraphListPayload(
    sgList: readonly number[],
    sgPairList: readonly {source: number; destination: number}[],
  ): Uint8Array {
    // Perform topological sort
    const reverseOrder = this.topologicalSort(sgList, sgPairList);

    // Build source→destinations map
    const pairMap = this.buildSubgraphPairMap(reverseOrder, sgPairList);

    // Calculate size
    let size = BinaryUtils.SIZEOF_UINT32; // NumSourceSubgraphs
    for (const [, destinations] of pairMap) {
      size += BinaryUtils.SIZEOF_UINT32; // SourceSGID
      size += BinaryUtils.SIZEOF_UINT32; // NumDestSubgraphs
      size += destinations.length * BinaryUtils.SIZEOF_UINT32; // DestSGID[]
    }

    // Allocate buffer
    const buffer = new Uint8Array(size);
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    let pos = 0;

    // Write NumSourceSubgraphs
    BinaryUtils.writeUint32(view, pos, pairMap.size);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write each source with its destinations
    for (const [sourceId, destinations] of pairMap) {
      // Write SourceSGID
      BinaryUtils.writeUint32(view, pos, sourceId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write NumDestSubgraphs
      BinaryUtils.writeUint32(view, pos, destinations.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write DestSGID[]
      for (const destId of destinations) {
        BinaryUtils.writeUint32(view, pos, destId);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
    }

    return buffer;
  }

  /**
   * Wrap a parameter payload in APM parameter format.
   * Based on reference implementation.
   *
   * Binary format:
   * - APM Module ID: 4 bytes (uint32)
   * - Parameter ID: 4 bytes (uint32)
   * - Parameter Size: 4 bytes (uint32) - size of payload only
   * - Payload: variable length
   * - Padding: 0-7 bytes to align total size to 8-byte boundary
   *
   * @param paramId - APM parameter ID
   * @param payload - Binary parameter payload
   * @returns Wrapped parameter with 8-byte alignment
   */
  private serializeApmParameter(
    paramId: number,
    payload: Uint8Array,
  ): Uint8Array {
    const headerSize = BinaryUtils.SIZEOF_UINT32 * 3; // APM Module ID + Param ID + Size

    // Calculate padding for 8-byte alignment (based on payload size only)
    // This matches the parser's getPaddingSize() calculation
    const paddingSize = (8 - (payload.length % 8)) % 8;
    const totalSize = headerSize + payload.length + paddingSize;

    // Allocate buffer
    const buffer = new Uint8Array(totalSize);
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    let pos = 0;

    // Write APM module ID
    BinaryUtils.writeUint32(view, pos, SPF_APM_MODULE_ID);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write parameter ID
    BinaryUtils.writeUint32(view, pos, paramId);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write parameter size (payload length only, not including padding)
    BinaryUtils.writeUint32(view, pos, payload.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Copy payload
    buffer.set(payload, pos);
    return buffer;
  }

  /**
   * Serialize subgraph configuration properties.
   *
   * Binary format (inner payload):
   * - NumSubgraphs: 4 bytes (always 1 in this context)
   * - SubgraphID: 4 bytes
   * - NumProperties: 4 bytes
   * - For each property:
   *   - PropertyID: 4 bytes
   *   - PropertyDataLength: 4 bytes
   *   - PropertyData: variable bytes
   *
   * Wrapped with APM parameter format (8-byte aligned).
   *
   * @param subgraphId - Subgraph ID
   * @param properties - Subgraph properties from database
   * @returns APM-wrapped subgraph config binary data
   */
  private serializeSubgraphConfig(
    subgraphId: number,
    properties: readonly {propertyId: number; payload: Uint8Array}[],
  ): Uint8Array {
    if (properties.length === 0) {
      return new Uint8Array(0);
    }

    // Calculate inner payload size
    let payloadSize = BinaryUtils.SIZEOF_UINT32; // NumSubgraphs (always 1)
    payloadSize += BinaryUtils.SIZEOF_UINT32; // SubgraphID
    payloadSize += BinaryUtils.SIZEOF_UINT32; // NumProperties

    for (const prop of properties) {
      payloadSize += BinaryUtils.SIZEOF_UINT32; // PropertyID
      payloadSize += BinaryUtils.SIZEOF_UINT32; // PropertyDataLength
      payloadSize += prop.payload.length; // PropertyData
    }

    // Allocate inner payload buffer
    const payload = new Uint8Array(payloadSize);
    const payloadView = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Write NumSubgraphs (always 1)
    BinaryUtils.writeUint32(payloadView, pos, 1);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write SubgraphID
    BinaryUtils.writeUint32(payloadView, pos, subgraphId);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write NumProperties
    BinaryUtils.writeUint32(payloadView, pos, properties.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write each property
    for (const prop of properties) {
      // Write PropertyID
      BinaryUtils.writeUint32(payloadView, pos, prop.propertyId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write PropertyDataLength
      BinaryUtils.writeUint32(payloadView, pos, prop.payload.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write PropertyData
      payload.set(prop.payload, pos);
      pos += prop.payload.length;
    }

    // Wrap with APM parameter format and return
    return this.serializeApmParameter(PARAM_ID_SUB_GRAPH_CONFIG, payload);
  }

  /**
   * Serialize container configuration properties.
   * Parent containers are serialized before their children.
   *
   * Binary format (inner payload):
   * - NumContainers: 4 bytes
   * - For each container (parents first, then children):
   *   - ContainerID: 4 bytes
   *   - NumProperties: 4 bytes
   *   - For each property:
   *     - PropertyID: 4 bytes
   *     - PropertyDataLength: 4 bytes
   *     - PropertyData: variable bytes
   *
   * Wrapped with APM parameter format (8-byte aligned).
   *
   * @param containers - Container data with properties from database
   * @returns APM-wrapped container config binary data
   */
  private serializeContainerConfig(
    containers: readonly ContainerDownloadModel[],
  ): Uint8Array {
    if (containers.length === 0) {
      return new Uint8Array(0);
    }

    // Helper to extract parent container ID from properties
    const getParentContainerId = (
      container: ContainerDownloadModel,
    ): number => {
      const parentProp = container.properties.find(
        p => p.propertyId === CONTAINER_PROP_ID_PARENT_CONTAINER,
      );

      if (!parentProp || parentProp.payload.length < 4) {
        return ID_DONT_CARE_DUMMY;
      }

      const view = new DataView(
        parentProp.payload.buffer,
        parentProp.payload.byteOffset,
        parentProp.payload.byteLength,
      );
      return BinaryUtils.readUint32(view, 0);
    };

    // Build container map for quick lookup
    const containerMap = new Map(containers.map(c => [c.containerId, c]));

    // Order containers: parents first, then children
    const orderedContainers: ContainerDownloadModel[] = [];
    const addedIds = new Set<number>();

    // Helper to add a container and its parent chain
    const addContainerWithParents = (
      container: ContainerDownloadModel,
    ): void => {
      if (addedIds.has(container.containerId)) {
        return;
      }

      // Extract parent ID and add parent first if valid
      const parentId = getParentContainerId(container);
      if (parentId !== ID_DONT_CARE_DUMMY) {
        const parent = containerMap.get(parentId);
        if (parent) {
          addContainerWithParents(parent);
        }
      }

      // Add this container
      if (!addedIds.has(container.containerId)) {
        orderedContainers.push(container);
        addedIds.add(container.containerId);
      }
    };

    // Process all containers
    for (const container of containers) {
      addContainerWithParents(container);
    }

    // Calculate inner payload size
    let payloadSize = BinaryUtils.SIZEOF_UINT32; // NumContainers

    for (const container of orderedContainers) {
      payloadSize += BinaryUtils.SIZEOF_UINT32; // ContainerID
      payloadSize += BinaryUtils.SIZEOF_UINT32; // NumProperties

      for (const prop of container.properties) {
        payloadSize += BinaryUtils.SIZEOF_UINT32; // PropertyID
        payloadSize += BinaryUtils.SIZEOF_UINT32; // PropertyDataLength
        payloadSize += prop.payload.length; // PropertyData
      }
    }

    // Allocate inner payload buffer
    const payload = new Uint8Array(payloadSize);
    const payloadView = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Write NumContainers
    BinaryUtils.writeUint32(payloadView, pos, orderedContainers.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write each container
    for (const container of orderedContainers) {
      // Write ContainerID
      BinaryUtils.writeUint32(payloadView, pos, container.containerId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write NumProperties
      BinaryUtils.writeUint32(payloadView, pos, container.properties.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write each property
      for (const prop of container.properties) {
        // Write PropertyID
        BinaryUtils.writeUint32(payloadView, pos, prop.propertyId);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Write PropertyDataLength
        BinaryUtils.writeUint32(payloadView, pos, prop.payload.length);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Write PropertyData
        payload.set(prop.payload, pos);
        pos += prop.payload.length;
      }
    }

    // Wrap with APM parameter format and return
    return this.serializeApmParameter(PARAM_ID_CONTAINER_CONFIG, payload);
  }

  /**
   * Serialize driver properties.
   * Based on reference GeneratePayload() implementation.
   *
   * Binary format:
   * - SubgraphID: 4 bytes (uint32)
   * - NumProperties: 4 bytes (uint32)
   * - For each property:
   *   - PropertyID: 4 bytes (uint32)
   *   - PropertyDataLength: 4 bytes (uint32)
   *   - PropertyData: variable length bytes
   *
   * @param subgraphId - Subgraph ID
   * @param properties - Subgraph properties from database
   * @returns Driver property binary data
   */
  private serializeDriverProperties(
    subgraphId: number,
    properties: readonly {propertyId: number; payload: Uint8Array}[],
  ): Uint8Array {
    // Calculate total buffer size
    let totalSize = BinaryUtils.SIZEOF_UINT32; // SubgraphID
    totalSize += BinaryUtils.SIZEOF_UINT32; // NumProperties

    for (const prop of properties) {
      totalSize += BinaryUtils.SIZEOF_UINT32; // PropertyID
      totalSize += BinaryUtils.SIZEOF_UINT32; // PropertyDataLength
      totalSize += prop.payload.length; // PropertyData
    }

    // Allocate buffer
    const buffer = new Uint8Array(totalSize);
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    let pos = 0;

    // Write SubgraphID
    BinaryUtils.writeUint32(view, pos, subgraphId);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write NumProperties
    BinaryUtils.writeUint32(view, pos, properties.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write each property
    for (const prop of properties) {
      // Write PropertyID
      BinaryUtils.writeUint32(view, pos, prop.propertyId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write PropertyDataLength
      BinaryUtils.writeUint32(view, pos, prop.payload.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write PropertyData
      buffer.set(prop.payload, pos);
      pos += prop.payload.length;
    }

    return buffer;
  }

  /**
   * Serialize module list.
   * Groups modules by (subgraphId, containerId) and serializes with APM wrapper.
   *
   * Binary format (inner payload):
   * - NumModuleProperties: 4 bytes
   * - For each module property group:
   *   - SubgraphID: 4 bytes
   *   - ContainerID: 4 bytes
   *   - NumModules: 4 bytes
   *   - For each module:
   *     - ModuleID: 4 bytes
   *     - InstanceID: 4 bytes
   *
   * @param subgraphId - Subgraph ID for all modules
   * @param modules - Module instances from database
   * @returns APM-wrapped module list binary data
   */
  private serializeModuleList(
    subgraphId: number,
    modules: readonly {
      instanceId: number;
      moduleId: number;
      containerId: number;
    }[],
  ): Uint8Array {
    if (modules.length === 0) {
      return new Uint8Array(0);
    }

    // Group modules by containerId
    // All modules in this call belong to the same subgraph
    const groupMap = new Map<
      number,
      {
        subgraphId: number;
        containerId: number;
        modules: Array<{instanceId: number; moduleId: number}>;
      }
    >();

    // Group by containerId
    for (const module of modules) {
      const key = module.containerId;

      if (!groupMap.has(key)) {
        groupMap.set(key, {
          subgraphId,
          containerId: module.containerId,
          modules: [],
        });
      }

      groupMap.get(key)!.modules.push({
        instanceId: module.instanceId,
        moduleId: module.moduleId,
      });
    }

    // Calculate payload size
    let payloadSize = BinaryUtils.SIZEOF_UINT32; // NumModuleProperties

    for (const group of groupMap.values()) {
      payloadSize += BinaryUtils.SIZEOF_UINT32; // SubgraphID
      payloadSize += BinaryUtils.SIZEOF_UINT32; // ContainerID
      payloadSize += BinaryUtils.SIZEOF_UINT32; // NumModules
      payloadSize += group.modules.length * BinaryUtils.SIZEOF_UINT32 * 2; // ModuleID + InstanceID per module
    }

    // Allocate payload buffer
    const payload = new Uint8Array(payloadSize);
    const payloadView = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Write NumModuleProperties
    BinaryUtils.writeUint32(payloadView, pos, groupMap.size);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write each group
    for (const group of groupMap.values()) {
      // Write SubgraphID
      BinaryUtils.writeUint32(payloadView, pos, group.subgraphId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write ContainerID
      BinaryUtils.writeUint32(payloadView, pos, group.containerId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write NumModules
      BinaryUtils.writeUint32(payloadView, pos, group.modules.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write each module
      for (const module of group.modules) {
        // Write ModuleID
        BinaryUtils.writeUint32(payloadView, pos, module.moduleId);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Write InstanceID
        BinaryUtils.writeUint32(payloadView, pos, module.instanceId);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
    }

    // Wrap with APM parameter format and return
    return this.serializeApmParameter(PARAM_ID_MODULES_LIST, payload);
  }

  /**
   * Serialize module configuration properties.
   * Creates port info property from port data and includes heap ID properties.
   *
   * Binary format (inner payload):
   * - NumModules: 4 bytes
   * - For each module:
   *   - ModuleInstanceID: 4 bytes
   *   - NumProperties: 4 bytes
   *   - For each property (sorted by propertyId):
   *     - PropertyID: 4 bytes
   *     - PropertySize: 4 bytes
   *     - PropertyData: variable bytes
   *
   * Wrapped with APM parameter format (8-byte aligned).
   *
   * @param modules - Module instances with port data and properties from database
   * @returns APM-wrapped module config binary data
   */
  private serializeModuleConfig(
    modules: readonly {
      instanceId: number;
      moduleId: number;
      containerId: number;
      maxInputPorts: number;
      maxOutputPorts: number;
      properties: readonly {propertyId: number; payload: Uint8Array}[];
    }[],
  ): Uint8Array {
    // Build complete properties for each module (including port info)
    const modulesWithProperties: Array<{
      instanceId: number;
      properties: Array<{propertyId: number; payload: Uint8Array}>;
    }> = [];

    for (const module of modules) {
      const allProperties: Array<{propertyId: number; payload: Uint8Array}> = [
        ...module.properties,
      ];

      // Create port info property from port data
      if (module.maxInputPorts > 0 || module.maxOutputPorts > 0) {
        const portPayload = new Uint8Array(8); // 4 bytes + 4 bytes
        const portView = new DataView(
          portPayload.buffer,
          portPayload.byteOffset,
          portPayload.byteLength,
        );
        portView.setUint32(0, module.maxInputPorts, true); // little-endian
        portView.setUint32(4, module.maxOutputPorts, true); // little-endian

        allProperties.push({
          propertyId: MODULE_PROP_ID_PORT_INFO,
          payload: portPayload,
        });
      }

      // Only include modules that have properties
      if (allProperties.length > 0) {
        // Sort properties by propertyId
        allProperties.sort((a, b) => a.propertyId - b.propertyId);

        modulesWithProperties.push({
          instanceId: module.instanceId,
          properties: allProperties,
        });
      }
    }

    if (modulesWithProperties.length === 0) {
      return new Uint8Array(0);
    }

    // Calculate payload size
    let payloadSize = BinaryUtils.SIZEOF_UINT32; // NumModules

    for (const module of modulesWithProperties) {
      payloadSize += BinaryUtils.SIZEOF_UINT32; // ModuleInstanceID
      payloadSize += BinaryUtils.SIZEOF_UINT32; // NumProperties

      for (const prop of module.properties) {
        payloadSize += BinaryUtils.SIZEOF_UINT32; // PropertyID
        payloadSize += BinaryUtils.SIZEOF_UINT32; // PropertySize
        payloadSize += prop.payload.length; // PropertyData
      }
    }

    // Allocate payload buffer
    const payload = new Uint8Array(payloadSize);
    const payloadView = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Write NumModules
    BinaryUtils.writeUint32(payloadView, pos, modulesWithProperties.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write each module
    for (const module of modulesWithProperties) {
      // Write ModuleInstanceID
      BinaryUtils.writeUint32(payloadView, pos, module.instanceId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write NumProperties
      BinaryUtils.writeUint32(payloadView, pos, module.properties.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write each property
      for (const prop of module.properties) {
        // Write PropertyID
        BinaryUtils.writeUint32(payloadView, pos, prop.propertyId);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Write PropertySize
        BinaryUtils.writeUint32(payloadView, pos, prop.payload.length);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Write PropertyData
        payload.set(prop.payload, pos);
        pos += prop.payload.length;
      }
    }

    // Wrap with APM parameter format and return
    return this.serializeApmParameter(PARAM_ID_MODULE_PROP, payload);
  }

  /**
   * Serialize data links.
   * Serializes data connections between module instances with APM wrapper.
   *
   * Binary format (inner payload):
   * - NumConnections: 4 bytes
   * - For each connection:
   *   - SourceInstanceID: 4 bytes
   *   - SourcePortID: 4 bytes
   *   - DestinationInstanceID: 4 bytes
   *   - DestinationPortID: 4 bytes
   *
   * @param dataLinks - Data links from database
   * @returns APM-wrapped data links binary data
   */
  private serializeDataLinks(
    dataLinks: readonly {
      sourceInstanceId: number;
      sourcePortId: number;
      destinationInstanceId: number;
      destinationPortId: number;
      isInterGraph: boolean;
    }[],
  ): Uint8Array {
    if (dataLinks.length === 0) {
      return new Uint8Array(0);
    }

    // Calculate payload size
    const payloadSize =
      BinaryUtils.SIZEOF_UINT32 + // NumConnections
      dataLinks.length * BinaryUtils.SIZEOF_UINT32 * 4; // 4 fields per connection

    // Allocate payload buffer
    const payload = new Uint8Array(payloadSize);
    const payloadView = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Write NumConnections
    BinaryUtils.writeUint32(payloadView, pos, dataLinks.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write each connection
    for (const link of dataLinks) {
      // Write SourceInstanceID
      BinaryUtils.writeUint32(payloadView, pos, link.sourceInstanceId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write SourcePortID
      BinaryUtils.writeUint32(payloadView, pos, link.sourcePortId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write DestinationInstanceID
      BinaryUtils.writeUint32(payloadView, pos, link.destinationInstanceId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write DestinationPortID
      BinaryUtils.writeUint32(payloadView, pos, link.destinationPortId);
      pos += BinaryUtils.SIZEOF_UINT32;
    }

    // Wrap with APM parameter format and return
    return this.serializeApmParameter(PARAM_ID_MODULE_DATA_LINK, payload);
  }

  /**
   * Serialize control links.
   * Serializes control connections between module instances with properties.
   * Adds default heap ID if not present, and converts intents to properties.
   *
   * Binary format (inner payload):
   * - NumControlLinks: 4 bytes
   * - For each control link:
   *   - Peer1InstanceID: 4 bytes
   *   - Peer1PortID: 4 bytes
   *   - Peer2InstanceID: 4 bytes
   *   - Peer2PortID: 4 bytes
   *   - NumProperties: 4 bytes
   *   - For each property (sorted by propertyId):
   *     - PropertyID: 4 bytes
   *     - PropertyDataLength: 4 bytes
   *     - PropertyData: variable length
   *
   * @param controlLinks - Control links from database
   * @returns APM-wrapped control links binary data
   */
  private serializeControlLinks(
    controlLinks: readonly {
      peer1InstanceId: number;
      peer1PortId: number;
      peer2InstanceId: number;
      peer2PortId: number;
      isInterGraph: boolean;
      heapId?: number;
      intentIds: number[];
    }[],
  ): Uint8Array {
    if (controlLinks.length === 0) {
      return new Uint8Array(0);
    }

    // Build properties for each control link
    const linksWithProperties: Array<{
      peer1InstanceId: number;
      peer1PortId: number;
      peer2InstanceId: number;
      peer2PortId: number;
      properties: Array<{propertyId: number; payload: Uint8Array}>;
    }> = [];

    for (const link of controlLinks) {
      const properties: Array<{propertyId: number; payload: Uint8Array}> = [];

      // Add heap ID property (always include, use default if not present)
      const heapId = link.heapId ?? HEAP_ID_DEFAULT;
      const heapIdPayload = new Uint8Array(BinaryUtils.SIZEOF_UINT32);
      const heapIdView = new DataView(
        heapIdPayload.buffer,
        heapIdPayload.byteOffset,
        heapIdPayload.byteLength,
      );
      BinaryUtils.writeUint32(heapIdView, 0, heapId);
      properties.push({
        propertyId: MODULE_PROP_ID_CTRL_HEAP_ID,
        payload: heapIdPayload,
      });

      // Add intents property if intents exist
      if (link.intentIds.length > 0) {
        const intentsPayloadSize =
          BinaryUtils.SIZEOF_UINT32 + // NumIntents
          link.intentIds.length * BinaryUtils.SIZEOF_UINT32; // Intent IDs

        const intentsPayload = new Uint8Array(intentsPayloadSize);
        const intentsView = new DataView(
          intentsPayload.buffer,
          intentsPayload.byteOffset,
          intentsPayload.byteLength,
        );
        let pos = 0;

        // Write NumIntents
        BinaryUtils.writeUint32(intentsView, pos, link.intentIds.length);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Write each intent ID
        for (const intentId of link.intentIds) {
          BinaryUtils.writeUint32(intentsView, pos, intentId);
          pos += BinaryUtils.SIZEOF_UINT32;
        }

        properties.push({
          propertyId: MODULE_PROP_ID_CTRL_LINK_INTENTS,
          payload: intentsPayload,
        });
      }

      // Sort properties by propertyId
      properties.sort((a, b) => a.propertyId - b.propertyId);

      linksWithProperties.push({
        peer1InstanceId: link.peer1InstanceId,
        peer1PortId: link.peer1PortId,
        peer2InstanceId: link.peer2InstanceId,
        peer2PortId: link.peer2PortId,
        properties,
      });
    }

    // Calculate payload size
    let payloadSize = BinaryUtils.SIZEOF_UINT32; // NumControlLinks

    for (const link of linksWithProperties) {
      payloadSize += BinaryUtils.SIZEOF_UINT32 * 4; // 4 peer fields
      payloadSize += BinaryUtils.SIZEOF_UINT32; // NumProperties

      for (const prop of link.properties) {
        payloadSize += BinaryUtils.SIZEOF_UINT32; // PropertyID
        payloadSize += BinaryUtils.SIZEOF_UINT32; // PropertyDataLength
        payloadSize += prop.payload.length; // PropertyData
      }
    }

    // Allocate payload buffer
    const payload = new Uint8Array(payloadSize);
    const payloadView = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Write NumControlLinks
    BinaryUtils.writeUint32(payloadView, pos, controlLinks.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write each control link
    for (const link of linksWithProperties) {
      // Write Peer1InstanceID
      BinaryUtils.writeUint32(payloadView, pos, link.peer1InstanceId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write Peer1PortID
      BinaryUtils.writeUint32(payloadView, pos, link.peer1PortId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write Peer2InstanceID
      BinaryUtils.writeUint32(payloadView, pos, link.peer2InstanceId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write Peer2PortID
      BinaryUtils.writeUint32(payloadView, pos, link.peer2PortId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write NumProperties
      BinaryUtils.writeUint32(payloadView, pos, link.properties.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write each property
      for (const prop of link.properties) {
        // Write PropertyID
        BinaryUtils.writeUint32(payloadView, pos, prop.propertyId);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Write PropertyDataLength
        BinaryUtils.writeUint32(payloadView, pos, prop.payload.length);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Write PropertyData
        payload.set(prop.payload, pos);
        pos += prop.payload.length;
      }
    }

    // Wrap with APM parameter format and return
    return this.serializeApmParameter(PARAM_ID_MODULE_CTRL_LINK, payload);
  }

  /**
   * Serialize voice configuration (voice tagged modules).
   * TODO: Implement voice config serialization based on spec.
   *
   * @param _voiceTags - Voice tag mappings from database
   * @returns APM-wrapped voice config binary data
   */
  private serializeVoiceConfig(
    _voiceTags: readonly {tagId: number; moduleInstanceId: number}[],
  ): Uint8Array {
    // Placeholder: Return empty buffer
    // Full implementation will serialize voice tagged modules with APM parameter wrapper
    return new Uint8Array(0);
  }

  /**
   * Serialize SPF properties (orchestrator properties).
   * Combines subgraph config, container config, module list, links, and voice config.
   *
   * @param subgraph - Complete subgraph data
   * @param containerMap - Map of container ID to container data
   * @returns SPF-formatted binary data
   */
  private serializeSpfProperties(
    subgraph: {
      subgraphId: number;
      properties: readonly {propertyId: number; payload: Uint8Array}[];
      modules: readonly {
        instanceId: number;
        moduleId: number;
        containerId: number;
        maxInputPorts: number;
        maxOutputPorts: number;
        properties: readonly {propertyId: number; payload: Uint8Array}[];
      }[];
      dataLinks: readonly {
        sourceInstanceId: number;
        sourcePortId: number;
        destinationInstanceId: number;
        destinationPortId: number;
        isInterGraph: boolean;
      }[];
      controlLinks: readonly {
        peer1InstanceId: number;
        peer1PortId: number;
        peer2InstanceId: number;
        peer2PortId: number;
        isInterGraph: boolean;
        heapId?: number;
        intentIds: number[];
      }[];
      voiceTags: readonly {tagId: number; moduleInstanceId: number}[];
    },
    containerMap: Map<number, ContainerDownloadModel>,
  ): Uint8Array {
    const parts: Uint8Array[] = [];

    // 1. Add subgraph config
    const sgConfig = this.serializeSubgraphConfig(
      subgraph.subgraphId,
      subgraph.properties,
    );
    if (sgConfig.length > 0) {
      parts.push(sgConfig);
    }

    // 2. Add container config - get containers used by this subgraph
    const subgraphContainerIds = new Set(
      subgraph.modules.map(m => m.containerId),
    );
    const subgraphContainers = [...subgraphContainerIds]
      .map(id => containerMap.get(id))
      .filter((c): c is ContainerDownloadModel => c !== undefined);

    const contConfig = this.serializeContainerConfig(subgraphContainers);
    if (contConfig.length > 0) {
      parts.push(contConfig);
    }

    // 3. Add module config properties
    const moduleConfig = this.serializeModuleConfig(subgraph.modules);
    if (moduleConfig.length > 0) {
      parts.push(moduleConfig);
    }

    // 4. Add module list
    const moduleList = this.serializeModuleList(
      subgraph.subgraphId,
      subgraph.modules,
    );
    if (moduleList.length > 0) {
      parts.push(moduleList);
    }

    // 5. Add data links
    const dataLinks = this.serializeDataLinks(subgraph.dataLinks);
    if (dataLinks.length > 0) {
      parts.push(dataLinks);
    }

    // 6. Add control links
    const controlLinks = this.serializeControlLinks(subgraph.controlLinks);
    if (controlLinks.length > 0) {
      parts.push(controlLinks);
    }

    // 7. Add voice config if voice subgraph
    //TODO:
    if (isVoiceSubgraph(subgraph.properties) && subgraph.voiceTags.length > 0) {
      const voiceConfig = this.serializeVoiceConfig(subgraph.voiceTags);
      if (voiceConfig.length > 0) {
        parts.push(voiceConfig);
      }
    }

    // Combine all parts
    if (parts.length === 0) {
      return new Uint8Array(0);
    }

    const totalSize = parts.reduce((sum, part) => sum + part.length, 0);
    const buffer = new Uint8Array(totalSize);
    let pos = 0;
    for (const part of parts) {
      buffer.set(part, pos);
      pos += part.length;
    }

    return buffer;
  }

  /**
   * Serialize complete subgraph property payload.
   * Combines driver and SPF (orchestrator) data for all subgraphs.
   *
   * Binary format:
   * - NumSubgraphs: 4 bytes
   * - For each subgraph:
   *   - SGID: 4 bytes
   *   - TotalDataSize: 4 bytes
   *   - DriverDataSize: 4 bytes
   *   - DriverData: DriverDataSize bytes
   *   - OrchestratorDataSize: 4 bytes
   *   - OrchestratorData: OrchestratorDataSize bytes
   *
   * @param subgraphs - Complete subgraph data from database
   * @param containerMap - Map of container ID to container data
   * @returns Binary payload for datapool
   */
  private serializeSubgraphPropertyPayload(
    subgraphs: readonly {
      subgraphId: number;
      properties: readonly {propertyId: number; payload: Uint8Array}[];
      modules: readonly {
        instanceId: number;
        moduleId: number;
        containerId: number;
        maxInputPorts: number;
        maxOutputPorts: number;
        properties: readonly {propertyId: number; payload: Uint8Array}[];
      }[];
      dataLinks: readonly {
        sourceInstanceId: number;
        sourcePortId: number;
        destinationInstanceId: number;
        destinationPortId: number;
        isInterGraph: boolean;
      }[];
      controlLinks: readonly {
        peer1InstanceId: number;
        peer1PortId: number;
        peer2InstanceId: number;
        peer2PortId: number;
        isInterGraph: boolean;
        heapId?: number;
        intentIds: number[];
      }[];
      voiceTags: readonly {tagId: number; moduleInstanceId: number}[];
    }[],
    containerMap: Map<number, ContainerDownloadModel>,
  ): Uint8Array {
    // Calculate total size
    let totalSize = BinaryUtils.SIZEOF_UINT32; // NumSubgraphs

    const subgraphData: Array<{
      sgId: number;
      driverData: Uint8Array;
      orchestratorData: Uint8Array;
    }> = [];

    for (const subgraph of subgraphs) {
      const driverData = this.serializeDriverProperties(
        subgraph.subgraphId,
        subgraph.properties,
      );
      const orchestratorData = this.serializeSpfProperties(
        subgraph,
        containerMap,
      );

      subgraphData.push({
        sgId: subgraph.subgraphId,
        driverData,
        orchestratorData,
      });

      totalSize += BinaryUtils.SIZEOF_UINT32; // SGID
      totalSize += BinaryUtils.SIZEOF_UINT32; // TotalDataSize
      totalSize += BinaryUtils.SIZEOF_UINT32; // DriverDataSize
      totalSize += driverData.length; // DriverData
      totalSize += BinaryUtils.SIZEOF_UINT32; // OrchestratorDataSize
      totalSize += orchestratorData.length; // OrchestratorData
    }

    // Allocate buffer
    const buffer = new Uint8Array(totalSize);
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    let pos = 0;

    // Write NumSubgraphs
    BinaryUtils.writeUint32(view, pos, subgraphs.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write each subgraph
    for (const sg of subgraphData) {
      // Write SGID
      BinaryUtils.writeUint32(view, pos, sg.sgId);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Calculate TotalDataSize
      const totalDataSize =
        BinaryUtils.SIZEOF_UINT32 +
        sg.driverData.length +
        BinaryUtils.SIZEOF_UINT32 +
        sg.orchestratorData.length;

      // Write TotalDataSize
      BinaryUtils.writeUint32(view, pos, totalDataSize);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write DriverDataSize
      BinaryUtils.writeUint32(view, pos, sg.driverData.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write DriverData
      buffer.set(sg.driverData, pos);
      pos += sg.driverData.length;

      // Write OrchestratorDataSize
      BinaryUtils.writeUint32(view, pos, sg.orchestratorData.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write OrchestratorData
      buffer.set(sg.orchestratorData, pos);
      pos += sg.orchestratorData.length;
    }

    return buffer;
  }

  /**
   * Serialize GKV groups to GKV_TABLE binary format.
   * Matches reference WriteGkvChunk implementation.
   *
   * Binary format (little-endian):
   * GKVKeyTblChunkPayload = NumKeyTbls KeyTbl+
   * KeyTbl = NumGKeys NumGKeyEntries KeyEntry+
   * KeyEntry = GKeyId+ OffsetLUT
   *
   * Structure:
   * - NumKeyTbls: 4 bytes (uint32) - number of distinct numKeys groups
   * - For each numKeys group:
   *   - NumGKeys: 4 bytes (uint32) - the numKeys value (e.g., 1, 2, 3)
   *   - NumGKeyEntries: 4 bytes (uint32) - count of unique keys in this group
   *   - For each key:
   *     - GKeyId+: numKeys x 4 bytes (uint32 each) - the key IDs
   *     - OffsetLUT: 4 bytes (uint32) - offset into GKV_LUT chunk
   *
   * @param gkvGroups - 3-level grouped GKV structure
   * @param lutOffsets - Map of key signature to LUT offset
   * @returns Binary data as Uint8Array
   */
  private serializeGkvTable(
    gkvGroups: GkvNumKeysGroup[],
    lutOffsets: Map<string, number>,
  ): Uint8Array {
    const size = this.calculateGkvTableSize(gkvGroups);
    if (size === 0) {
      return new Uint8Array(0);
    }

    const buffer = new Uint8Array(size);
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    let pos = 0;

    // Write NumKeyTbls (number of distinct numKeys groups)
    BinaryUtils.writeUint32(view, pos, gkvGroups.length);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write each numKeys group
    for (const group of gkvGroups) {
      // Write NumGKeys (the numKeys value itself)
      BinaryUtils.writeUint32(view, pos, group.numKeys);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write NumGKeyEntries (count of unique keys in this group)
      BinaryUtils.writeUint32(view, pos, group.keys.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write each key entry
      for (const keyEntry of group.keys) {
        // Write key IDs (numKeys values)
        for (const keyId of keyEntry.keyIds) {
          BinaryUtils.writeUint32(view, pos, keyId);
          pos += BinaryUtils.SIZEOF_UINT32;
        }

        // Write LUT offset for this key
        const keySignature = keyEntry.keyIds.join(',');
        const lutOffset = lutOffsets.get(keySignature) ?? 0;
        BinaryUtils.writeUint32(view, pos, lutOffset);
        pos += BinaryUtils.SIZEOF_UINT32;
      }
    }

    return buffer;
  }

  /**
   * Calculate the size in bytes needed to serialize the GKV_TABLE.
   *
   * @param gkvGroups - 3-level grouped GKV structure
   * @returns Size in bytes
   */
  private calculateGkvTableSize(gkvGroups: GkvNumKeysGroup[]): number {
    let size = BinaryUtils.SIZEOF_UINT32; // NumKeyTbls

    for (const group of gkvGroups) {
      size += BinaryUtils.SIZEOF_UINT32; // NumGKeys
      size += BinaryUtils.SIZEOF_UINT32; // NumGKeyEntries

      for (const keyEntry of group.keys) {
        // Key IDs + LUT offset
        size += keyEntry.keyIds.length * BinaryUtils.SIZEOF_UINT32;
        size += BinaryUtils.SIZEOF_UINT32; // OffsetLUT
      }
    }

    return size;
  }

  /**
   * Serialize GKV groups to GKV_LUT (Graph Key Vector Lookup Table) binary format.
   * Matches reference WriteGkvChunk implementation.
   *
   * Binary format (little-endian):
   * GKVLUTChunkPayload = GKVLUT+
   * GKVLUT = NumGKeyVals NumGKVLUTEntries GKVLUTEntry+
   * GKVLUTEntry = GKeyVal+ OffsetSGListData OffsetSGData
   *
   * Structure:
   * For each unique key:
   * - NumGKeyVals: 4 bytes (uint32) - number of values (= numKeys)
   * - NumGKVLUTEntries: 4 bytes (uint32) - count of value entries for this key
   * - For each value entry:
   *   - GKeyVal+: numKeys x 4 bytes (uint32 each) - the value IDs
   *   - OffsetSGListData: 4 bytes (uint32) - offset to subgraph list in datapool
   *   - OffsetSGData: 4 bytes (uint32) - offset to subgraph property data in datapool
   *
   * @param gkvGroups - 3-level grouped GKV structure
   * @returns Binary data as Uint8Array
   */
  private serializeGkvLut(gkvGroups: GkvNumKeysGroup[]): Uint8Array {
    const size = this.calculateGkvLutSize(gkvGroups);
    if (size === 0) {
      return new Uint8Array(0);
    }

    const buffer = new Uint8Array(size);
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    let pos = 0;

    // Write LUT entries for each key
    for (const group of gkvGroups) {
      for (const keyEntry of group.keys) {
        // Write NumGKeyVals (= numKeys = number of values per entry)
        BinaryUtils.writeUint32(view, pos, group.numKeys);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Write NumGKVLUTEntries (count of value entries for this key)
        BinaryUtils.writeUint32(view, pos, keyEntry.values.length);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Write each value entry
        for (const valueEntry of keyEntry.values) {
          // Write value IDs (numKeys values)
          for (const valueId of valueEntry.valueIds) {
            BinaryUtils.writeUint32(view, pos, valueId);
            pos += BinaryUtils.SIZEOF_UINT32;
          }

          // Write OffsetSGListData (subgraph list offset in datapool)
          BinaryUtils.writeUint32(view, pos, valueEntry.sgListOffset);
          pos += BinaryUtils.SIZEOF_UINT32;

          // Write OffsetSGData (subgraph property offset in datapool)
          BinaryUtils.writeUint32(view, pos, valueEntry.sgPropOffset);
          pos += BinaryUtils.SIZEOF_UINT32;
        }
      }
    }

    return buffer;
  }

  /**
   * Calculate the size in bytes needed to serialize the GKV_LUT.
   *
   * @param gkvGroups - 3-level grouped GKV structure
   * @returns Size in bytes
   */
  private calculateGkvLutSize(gkvGroups: GkvNumKeysGroup[]): number {
    let size = 0;

    for (const group of gkvGroups) {
      for (const keyEntry of group.keys) {
        size += BinaryUtils.SIZEOF_UINT32; // NumGKeyVals
        size += BinaryUtils.SIZEOF_UINT32; // NumGKVLUTEntries

        for (const valueEntry of keyEntry.values) {
          // Value IDs + OffsetSGListData + OffsetSGData
          size += valueEntry.valueIds.length * BinaryUtils.SIZEOF_UINT32;
          size += BinaryUtils.SIZEOF_UINT32; // OffsetSGListData
          size += BinaryUtils.SIZEOF_UINT32; // OffsetSGData
        }
      }
    }

    return size;
  }
}
