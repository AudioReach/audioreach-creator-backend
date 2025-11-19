import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {DataLink} from './types.js';

/**
 * Handles parsing of data links properties from binary data.
 * Based on C# ConnectionListProperty implementation.
 */
export class DataLinksProperty {
  /** List of data links */
  readonly dataLinks: DataLink[] = [];

  private constructor() {}

  /**
   * Create DataLinksProperty from binary payload
   */
  static fromPayload(
    payload: Uint8Array,
    currentSubgraphModuleInstanceIds: number[] = [],
  ): DataLinksProperty {
    const instance = new DataLinksProperty();
    instance.parsePayload(payload, currentSubgraphModuleInstanceIds);
    return instance;
  }

  /**
   * Parse binary payload into data links
   */
  private parsePayload(
    payload: Uint8Array,
    currentSubgraphModuleInstanceIds: number[] = [],
  ): void {
    const view = new DataView(
      payload.buffer,
      payload.byteOffset,
      payload.byteLength,
    );
    let pos = 0;

    // Read count of data links
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error('Cannot read data link count from payload');
    }

    const count = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Parse each data link
    for (let i = 0; i < count; i++) {
      // Read source module instance ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read source instance ID at position ${pos}`);
      }

      const sourceInstanceId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read source port ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read source port ID at position ${pos}`);
      }

      const sourcePortId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read destination module instance ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(
          `Cannot read destination instance ID at position ${pos}`,
        );
      }

      const destinationInstanceId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read destination port ID
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read destination port ID at position ${pos}`);
      }

      const destinationPortId = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Calculate isInterGraph based on module instance membership
      const isInterGraph = this.calculateIsInterGraph(
        sourceInstanceId,
        destinationInstanceId,
        currentSubgraphModuleInstanceIds,
      );

      // Create data link
      const dataLink: DataLink = {
        sourceInstanceId,
        sourcePortId,
        destinationInstanceId,
        destinationPortId,
        isInterGraph,
      };

      this.dataLinks.push(dataLink);
    }
  }

  /**
   * Get all data links from a specific source instance
   */
  getDataLinksFromSource(sourceInstanceId: number): DataLink[] {
    return this.dataLinks.filter(
      link => link.sourceInstanceId === sourceInstanceId,
    );
  }

  /**
   * Get all data links to a specific destination instance
   */
  getDataLinksToDestination(destinationInstanceId: number): DataLink[] {
    return this.dataLinks.filter(
      link => link.destinationInstanceId === destinationInstanceId,
    );
  }

  /**
   * Get data link for a specific source instance and port
   */
  getDataLinkFromSourcePort(
    sourceInstanceId: number,
    sourcePortId: number,
  ): DataLink | null {
    return (
      this.dataLinks.find(
        link =>
          link.sourceInstanceId === sourceInstanceId &&
          link.sourcePortId === sourcePortId,
      ) || null
    );
  }

  /**
   * Get data link for a specific destination instance and port
   */
  getDataLinkToDestinationPort(
    destinationInstanceId: number,
    destinationPortId: number,
  ): DataLink | null {
    return (
      this.dataLinks.find(
        link =>
          link.destinationInstanceId === destinationInstanceId &&
          link.destinationPortId === destinationPortId,
      ) || null
    );
  }

  /**
   * Get all unique source instance IDs
   */
  getSourceInstanceIds(): number[] {
    const sourceIds = new Set(
      this.dataLinks.map(link => link.sourceInstanceId),
    );
    return Array.from(sourceIds);
  }

  /**
   * Get all unique destination instance IDs
   */
  getDestinationInstanceIds(): number[] {
    const destIds = new Set(
      this.dataLinks.map(link => link.destinationInstanceId),
    );
    return Array.from(destIds);
  }

  /**
   * Calculate whether a data link crosses subgraph boundaries
   */
  private calculateIsInterGraph(
    sourceInstanceId: number,
    destinationInstanceId: number,
    currentSubgraphModuleInstanceIds: number[],
  ): boolean {
    const sourceInCurrentSubgraph =
      currentSubgraphModuleInstanceIds.includes(sourceInstanceId);
    const destInCurrentSubgraph = currentSubgraphModuleInstanceIds.includes(
      destinationInstanceId,
    );

    // If either source or destination is not in current subgraph, it's inter-graph
    return !sourceInCurrentSubgraph || !destInCurrentSubgraph;
  }
}
