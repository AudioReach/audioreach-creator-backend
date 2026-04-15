/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseChunkParser} from './base-chunk-parser.js';
import {
  SubgraphDataChunk,
  type SubgraphDataEntry,
} from '../../../shared/acdb-chunks/subgraph-data-chunk.js';
import {UsecaseDataChunk} from '../../../shared/acdb-chunks/usecase-data-chunk.js';
import {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import {PARSED_CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {SpfProperties} from '../../../shared/acdb-chunks/spf-properties/index.js';
import type {Logger} from '../../../../../shared/types/logger.interface.js';

/**
 * Parser for derived subgraph data chunks.
 * Extracts subgraph properties from DATAPOOL using sgPropOffset values from usecase entries.
 * This parser works with already-parsed chunks rather than raw binary data.
 */
export class SubgraphDataChunkParser extends BaseChunkParser<SubgraphDataChunk> {
  readonly chunkType = PARSED_CHUNK_TYPES.SUBGRAPH_DATA;

  /** Track processed subgraph IDs to avoid duplicates */
  private processedSubgraphIds = new Set<number>();

  constructor(private readonly logger?: Logger) {
    super();
  }

  parse(context: ChunkParseContext): SubgraphDataChunk {
    // Reset processed subgraph IDs for this parsing session
    this.processedSubgraphIds.clear();

    // For derived chunks, we work with parsed chunks from context, not raw data
    if (!context.parsedChunks) {
      throw new Error(
        'Parsed chunks context is required for derived chunk processing',
      );
    }

    const usecaseChunk = context.parsedChunks.get(
      PARSED_CHUNK_TYPES.USECASE_DATA,
    ) as UsecaseDataChunk;
    const datapoolChunk = context.parsedChunks.get(
      PARSED_CHUNK_TYPES.DATAPOOL,
    ) as DatapoolChunk;

    if (!usecaseChunk) {
      throw new Error('UsecaseDataChunk not found in parsed chunks context');
    }
    if (!datapoolChunk) {
      throw new Error('DatapoolChunk not found in parsed chunks context');
    }

    const chunk = new SubgraphDataChunk();

    // Process each usecase entry to extract subgraph data
    for (const [index, usecaseEntry] of usecaseChunk.usecases.entries()) {
      try {
        const subgraphEntries = this.extractSubgraphData(
          datapoolChunk,
          usecaseEntry.sgPropOffset,
        );
        // Add each unique subgraph entry
        for (const entry of subgraphEntries) {
          chunk.addSubgraphData(entry);
        }
      } catch (error) {
        // Log error but continue processing other usecases
        this.logger?.logWarn({
          msg: `Failed to extract subgraph data for usecase ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'extract_subgraph_data_failed',
          component: 'SubgraphDataChunkParser',
          tag: 'subgraph-parsing',
          error: error as Error,
          timestamp: new Date(),
        });
      }
    }

    return chunk;
  }

  /**
   * Extract subgraph properties from DATAPOOL chunk using the provided offset
   */
  private extractSubgraphData(
    datapoolChunk: DatapoolChunk,
    sgPropOffset: number,
  ): SubgraphDataEntry[] {
    if (!datapoolChunk.payloads || datapoolChunk.payloads.length === 0) {
      throw new Error('DATAPOOL chunk has no payloads');
    }

    // Find the payload that contains the sgPropOffset
    const payloadInfo = this.findPayloadForOffset(datapoolChunk, sgPropOffset);
    if (!payloadInfo) {
      throw new Error(
        `Invalid sgPropOffset ${sgPropOffset}, not found in any datapool payload`,
      );
    }

    // Extract subgraph entries from the specific payload
    const subgraphEntries = this.extractSubgraphEntriesFromPayload(
      payloadInfo.payload,
    );

    return subgraphEntries;
  }

  /**
   * Find which payload contains the given offset and return payload info
   */
  private findPayloadForOffset(
    datapoolChunk: DatapoolChunk,
    targetOffset: number,
  ): {
    payload: Uint8Array;
    relativeOffset: number;
    payloadIndex: number;
  } | null {
    for (let i = 0; i < datapoolChunk.offsets.length; i++) {
      const payloadOffset = datapoolChunk.offsets[i];
      const payload = datapoolChunk.payloads[i];

      // Check if the target offset falls within this payload
      if (
        targetOffset >= payloadOffset &&
        targetOffset < payloadOffset + payload.length
      ) {
        return {
          payload,
          relativeOffset: targetOffset - payloadOffset,
          payloadIndex: i,
        };
      }
    }
    return null;
  }

  /**
   * Extract subgraph entries from a specific payload at the given relative offset.
   */
  private extractSubgraphEntriesFromPayload(
    payload: Uint8Array,
  ): SubgraphDataEntry[] {
    try {
      const view = new DataView(
        payload.buffer,
        payload.byteOffset,
        payload.byteLength,
      );
      let pos = 0;
      const subgraphEntries: SubgraphDataEntry[] = [];

      // Read the subgraph count (sgCount)
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(`Cannot read sgCount at relative offset ${pos}`);
      }

      const sgCount = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Loop through each subgraph
      for (let j = 0; j < sgCount; j++) {
        const result = this.processSubgraphEntry(payload, view, pos);
        pos = result.newPos;

        if (result.entry) {
          subgraphEntries.push(result.entry);
        }
      }

      return subgraphEntries;
    } catch (error) {
      throw new Error(
        `Failed to extract subgraph entries from payload: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private processSubgraphEntry(
    payload: Uint8Array,
    view: DataView,
    pos: number,
  ): {newPos: number; entry: SubgraphDataEntry | null} {
    // Read curSGId
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error(`Cannot read curSGId at position ${pos}`);
    }
    const curSGId = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Skip if this subgraph ID was already processed
    if (this.processedSubgraphIds.has(curSGId)) {
      const newPos = this.skipSubgraphData(payload, view, pos);
      return {newPos, entry: null};
    }

    // Mark this subgraph ID as processed
    this.processedSubgraphIds.add(curSGId);

    // Read totalPropSize
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error(`Cannot read totalPropSize at position ${pos}`);
    }
    const totalPropSize = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    const remainingDataStart = pos;
    const {driverProperties, spfProperties, newPos} =
      this.readSubgraphProperties(payload, view, pos);
    pos = newPos;

    // Validate data consumption
    this.validateDataConsumption(
      pos,
      remainingDataStart,
      totalPropSize,
      driverProperties.length,
      spfProperties.length,
    );

    // Parse SPF properties from binary data
    let parsedSpfProperties: SpfProperties;
    try {
      parsedSpfProperties = SpfProperties.fromPayload(spfProperties);
    } catch (error) {
      // Log error and skip this subgraph entry
      this.logger?.logError({
        msg: `Failed to parse SPF properties for subgraph ${BinaryUtils.toHexString(curSGId)}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'parse_spf_properties_failed',
        component: 'SubgraphDataChunkParser',
        tag: 'subgraph-parsing',
        error: error as Error,
        timestamp: new Date(),
      });
      // Return null entry to skip this subgraph
      return {newPos: pos, entry: null};
    }

    // Create SubgraphDataEntry
    const entry: SubgraphDataEntry = {
      subgraphId: curSGId,
      driverProperties,
      spfProperties: parsedSpfProperties,
    };

    return {newPos: pos, entry};
  }

  private skipSubgraphData(
    payload: Uint8Array,
    view: DataView,
    pos: number,
  ): number {
    // Read totalPropSize to know how much to skip
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error(`Cannot read totalPropSize at position ${pos}`);
    }
    const totalPropSize = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Skip the entire property data
    return pos + totalPropSize;
  }

  private readSubgraphProperties(
    payload: Uint8Array,
    view: DataView,
    pos: number,
  ): {driverProperties: Uint8Array; spfProperties: Uint8Array; newPos: number} {
    // Read driverPropSize
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error(`Cannot read driverPropSize at position ${pos}`);
    }
    const driverPropSize = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read driverProperties data
    if (pos + driverPropSize > payload.length) {
      throw new Error(`Cannot read driverProperties data at position ${pos}`);
    }
    const driverProperties = payload.slice(pos, pos + driverPropSize);
    pos += driverPropSize;

    // Read spfPropSize
    if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
      throw new Error(`Cannot read spfPropSize at position ${pos}`);
    }
    const spfPropSize = BinaryUtils.readUint32(view, pos);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Read spfProperties data
    if (pos + spfPropSize > payload.length) {
      throw new Error(`Cannot read spfProperties data at position ${pos}`);
    }
    const spfProperties = payload.slice(pos, pos + spfPropSize);
    pos += spfPropSize;

    return {driverProperties, spfProperties, newPos: pos};
  }

  private validateDataConsumption(
    currentPos: number,
    startPos: number,
    totalPropSize: number,
    driverPropSize: number,
    spfPropSize: number,
  ): void {
    const actualDataConsumed = currentPos - startPos;
    const expectedDataSize =
      BinaryUtils.SIZEOF_UINT32 +
      driverPropSize +
      BinaryUtils.SIZEOF_UINT32 +
      spfPropSize;

    if (actualDataConsumed !== expectedDataSize) {
      throw new Error(
        `Data size mismatch: expected ${expectedDataSize}, consumed ${actualDataConsumed}, totalPropSize was ${totalPropSize}`,
      );
    }
  }
}
