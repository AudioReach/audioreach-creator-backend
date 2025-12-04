import {CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import {BaseChunkParser} from './base-chunk-parser.js';
import {UsecaseDataChunk} from '../../../shared/acdb-chunks/usecase-data-chunk.js';
import type {UsecaseEntry} from '../../../shared/acdb-chunks/usecase-data-chunk.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import {
  KeyValue,
  KeyValuePairList,
} from '../../../../../shared/types/key-value-pair.js';
import {SubgraphPair} from '../../../../../shared/types/subgraph-pair.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';

/**
 * Parser for usecase data chunks containing GKV_TABLE and GKV_LUT data.
 * Based on C# InitializeGraphData and GetGeckoPrptyDataPayload methods.
 * Creates multiple usecase entries, each corresponding to a Keys->GraphData mapping.
 */
export class UsecaseDataChunkParser extends BaseChunkParser<UsecaseDataChunk> {
  readonly chunkType = CHUNK_TYPES.GKV_TABLE;

  parse(context: ChunkParseContext): UsecaseDataChunk {
    // Get GKV_TABLE and GKV_LUT chunks from context
    const gkvTableData = context.rawChunks?.get(CHUNK_TYPES.GKV_TABLE);
    const gkvLutData = context.rawChunks?.get(CHUNK_TYPES.GKV_LUT);

    const datapoolChunk = context.parsedChunks?.get(
      CHUNK_TYPES.DATAPOOL,
    ) as DatapoolChunk;

    if (!gkvTableData) {
      throw new Error('GKV_TABLE chunk not found in context');
    }
    if (!gkvLutData) {
      throw new Error('GKV_LUT chunk not found in context');
    }

    // Parse GKV_TABLE to get key structures and LUT offsets
    const tableEntries = this.parseGkvTable(gkvTableData);

    // Parse each table entry to create usecase entries
    const usecases: UsecaseEntry[] = [];
    for (const tableEntry of tableEntries) {
      const usecaseEntries = this.parseGkvLutEntries(
        gkvLutData,
        tableEntry,
        datapoolChunk,
      );
      usecases.push(...usecaseEntries);
    }

    // Create and populate chunk
    const chunk = new UsecaseDataChunk();
    chunk.usecases = usecases;

    return chunk;
  }

  /**
   * Parse GKV_TABLE chunk to extract key structures and LUT offsets.
   *    GKVKeyTblChunkPayload = NumKeyTbls KeyTbl +
   *    KeyTbl = NumGKeys NumGKeyEntries KeyEntry+
   *    KeyEntry = GKeyId + OffsetLUT; OffsetLUT is offset of an table in GKVLUTChunk
   */
  private parseGkvTable(
    data: Uint8Array,
  ): Array<{keys: number[]; lutOffset: number}> {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;
    const tableEntries: Array<{keys: number[]; lutOffset: number}> = [];

    try {
      // Read number of key tables
      const numKeyTbls = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      for (let i = 0; i < numKeyTbls; i++) {
        // Read number of keys for this table
        const numKeys = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read number of entries for this table
        const numEntries = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        for (let j = 0; j < numEntries; j++) {
          // Read key list
          const keys: number[] = [];
          for (let k = 0; k < numKeys; k++) {
            keys.push(BinaryUtils.readUint32(view, pos));
            pos += BinaryUtils.SIZEOF_UINT32;
          }

          // Read LUT offset
          const lutOffset = BinaryUtils.readUint32(view, pos);
          pos += BinaryUtils.SIZEOF_UINT32;

          tableEntries.push({keys, lutOffset});
        }
      }

      return tableEntries;
    } catch (error) {
      throw new Error(
        `Failed to parse GKV_TABLE chunk: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Parse subgraph data from DATAPOOL chunk using sgListOffset.
   * Based on C# code that parses sgidList and sgPairs.
   */
  private parseSubgraphData(
    datapoolChunk: DatapoolChunk,
    sgListOffset: number,
  ): {sgList: number[]; sgPairList: SubgraphPair[]} {
    try {
      if (!datapoolChunk) {
        return {sgList: [], sgPairList: []};
      }

      // Get data at the specific offset using the new method
      const data = datapoolChunk.getDataAtOffset(sgListOffset);
      if (!data) {
        return {sgList: [], sgPairList: []};
      }

      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      let dataPoolIndex = 0; // Start from beginning since we got the exact payload

      // Read sgCount (number of subgraphs)
      const sgCount = BinaryUtils.readUint32(view, dataPoolIndex);
      dataPoolIndex += BinaryUtils.SIZEOF_UINT32;

      const sgList: number[] = [];
      const sgPairList: SubgraphPair[] = [];

      for (let i = 0; i < sgCount; i++) {
        // Read sgID
        const sgID = BinaryUtils.readUint32(view, dataPoolIndex);
        dataPoolIndex += BinaryUtils.SIZEOF_UINT32;
        sgList.push(sgID);

        // Read destCount (number of destinations for this subgraph)
        const destCount = BinaryUtils.readUint32(view, dataPoolIndex);
        dataPoolIndex += BinaryUtils.SIZEOF_UINT32;

        for (let destIndex = 0; destIndex < destCount; destIndex++) {
          // Read dstSgID
          const dstSgID = BinaryUtils.readUint32(view, dataPoolIndex);
          dataPoolIndex += BinaryUtils.SIZEOF_UINT32;

          // Create subgraph pair (sgID -> dstSgID)
          sgPairList.push(new SubgraphPair(sgID, dstSgID));
        }
      }

      return {sgList, sgPairList};
    } catch {
      // Log error but return empty arrays to allow graceful degradation
      return {sgList: [], sgPairList: []};
    }
  }

  /**
   * Parse multiple usecase entries from GKV_LUT data.
   * Each entry in numEntries loop becomes one UsecaseEntry.
   *    GKVLUTChunkPayload = GKVLUT +
   *    GKVLUT = NumGKeyVals NumGKVLUTEntries GKVLUTEntry+
   *    GKVLUTEntry = GKeyVal + OffsetSGListData OffsetSGData
   */
  private parseGkvLutEntries(
    lutData: Uint8Array,
    tableEntry: {keys: number[]; lutOffset: number},
    datapoolChunk?: DatapoolChunk,
  ): UsecaseEntry[] {
    const view = new DataView(
      lutData.buffer,
      lutData.byteOffset,
      lutData.byteLength,
    );
    const {keys, lutOffset} = tableEntry;
    let pos = lutOffset;

    try {
      // Read number of keys at this LUT offset
      const numKeys = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Read number of entries
      const numEntries = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Validate that numKeys matches the expected key count
      if (numKeys !== keys.length) {
        throw new Error(
          `Key count mismatch: expected ${keys.length}, got ${numKeys}`,
        );
      }

      const usecaseEntries: UsecaseEntry[] = [];

      // Process each entry - each becomes a separate UsecaseEntry
      for (let i = 0; i < numEntries; i++) {
        // Read key values for THIS entry
        const values: number[] = [];
        for (let j = 0; j < numKeys; j++) {
          values.push(BinaryUtils.readUint32(view, pos));
          pos += BinaryUtils.SIZEOF_UINT32;
        }

        // Read subgraph list offset for THIS entry
        const sgListOffset = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read subgraph property offset for THIS entry
        const sgPropOffset = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Create KeyValue pairs for THIS entry
        const keyValuePairs: KeyValue[] = [];
        for (const [k, key] of keys.entries()) {
          keyValuePairs.push(new KeyValue(key, values[k]));
        }

        // Parse subgraph data from DATAPOOL using sgListOffset for THIS entry
        let sgList: number[] = [];
        let sgPairList: SubgraphPair[] = [];

        if (datapoolChunk) {
          const result = this.parseSubgraphData(datapoolChunk, sgListOffset);
          sgList = result.sgList;
          sgPairList = result.sgPairList;
        } else {
          console.error(
            'DatapoolChunk is null/undefined - cannot parse subgraph data',
          );
        }

        // Create THIS usecase entry
        usecaseEntries.push({
          keyValuePairList: new KeyValuePairList(keyValuePairs),
          sgPropOffset,
          sgList,
          sgPairList,
        });
      }

      return usecaseEntries;
    } catch (error) {
      throw new Error(
        `Failed to parse usecase entry at LUT offset ${lutOffset}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
