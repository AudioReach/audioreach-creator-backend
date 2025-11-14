import {BaseChunkParser} from './base-chunk-parser.js';
import {
  SubgraphDataChunk,
  type SubgraphDataEntry,
} from '../../../shared/acdb-chunks/subgraph-data-chunk.js';
import {UsecaseDataChunk} from '../../../shared/acdb-chunks/usecase-data-chunk.js';
import {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import {CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

/**
 * Parser for derived subgraph data chunks.
 * Extracts subgraph properties from DATAPOOL using sgPropOffset values from usecase entries.
 * This parser works with already-parsed chunks rather than raw binary data.
 */
export class SubgraphDataChunkParser extends BaseChunkParser<SubgraphDataChunk> {
  readonly chunkType = CHUNK_TYPES.SUBGRAPH_DATA;

  parse(
    _chunkGroup: Array<{chunkType: string; chunkData: Uint8Array}>,
    context: ChunkParseContext,
  ): SubgraphDataChunk {
    // For derived chunks, we work with parsed chunks from context, not raw chunkGroup data
    if (!context.parsedChunks) {
      throw new Error(
        'Parsed chunks context is required for derived chunk processing',
      );
    }

    const usecaseChunk = context.parsedChunks.get(
      CHUNK_TYPES.GKV_TABLE,
    ) as UsecaseDataChunk;
    const datapoolChunk = context.parsedChunks.get(
      CHUNK_TYPES.DATAPOOL,
    ) as DatapoolChunk;

    if (!usecaseChunk) {
      throw new Error('UsecaseDataChunk not found in parsed chunks context');
    }
    if (!datapoolChunk) {
      throw new Error('DatapoolChunk not found in parsed chunks context');
    }

    const chunk = new SubgraphDataChunk();

    // Process each usecase entry to extract subgraph data
    usecaseChunk.usecases.forEach((usecaseEntry, index) => {
      try {
        const subgraphData = this.extractSubgraphData(
          datapoolChunk,
          usecaseEntry.sgPropOffset,
        );
        chunk.addSubgraphData(subgraphData);
      } catch (error) {
        // Log error but continue processing other usecases
        console.warn(
          `Failed to extract subgraph data for usecase ${index}:`,
          error,
        );
      }
    });

    return chunk;
  }

  /**
   * Extract subgraph properties from DATAPOOL chunk using the provided offset
   */
  private extractSubgraphData(
    datapoolChunk: DatapoolChunk,
    sgPropOffset: number,
  ): SubgraphDataEntry {
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

    // Extract properties from the specific payload
    const properties = this.extractPropertiesFromPayload(
      payloadInfo.payload,
      payloadInfo.relativeOffset,
    );

    return {
      properties,
    };
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
   * Extract subgraph properties from a specific payload at the given relative offset.
   * This implements the binary parsing logic similar to the C# GetGeckoPrptyDataPayload method.
   */
  private extractPropertiesFromPayload(
    payload: Uint8Array,
    relativeOffset: number,
  ): Uint8Array {
    try {
      const view = new DataView(
        payload.buffer,
        payload.byteOffset,
        payload.byteLength,
      );
      let pos = relativeOffset;

      // Read the data length (first uint32 at the offset)
      if (pos + BinaryUtils.SIZEOF_UINT32 > payload.length) {
        throw new Error(
          `Cannot read data length at relative offset ${relativeOffset}`,
        );
      }

      const dataLength = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Validate data length
      if (pos + dataLength > payload.length) {
        throw new Error(
          `Data length ${dataLength} exceeds available data at relative offset ${pos}`,
        );
      }

      // Extract the properties data
      const properties = payload.slice(pos, pos + dataLength);

      return properties;
    } catch (error) {
      throw new Error(
        `Failed to extract properties from payload at relative offset ${relativeOffset}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
