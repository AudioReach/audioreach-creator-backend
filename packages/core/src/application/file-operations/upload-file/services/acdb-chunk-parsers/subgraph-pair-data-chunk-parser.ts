import {CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import {BaseChunkParser} from './base-chunk-parser.js';
import {SubgraphPairDataChunk} from '../../../shared/acdb-chunks/subgraph-pair-data-chunk.js';
import type {SubgraphPairEntry} from '../../../shared/acdb-chunks/subgraph-pair-data-chunk.js';
import type {ChunkParseContext} from '../../models/chunk-parse-context.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';
import type {
  DataLink,
  ControlLink,
} from '../../../shared/acdb-chunks/spf-properties/types.js';
import {buildDataLinkNaturalKeyHash} from '../../../shared/utils/natural-key-utils.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import {
  GECKO_APM_MODULE_ID,
  PARAM_ID_MODULE_DATA_LINK,
  PARAM_ID_MODULE_CTRL_LINK,
  MODULE_PROP_ID_CTRL_HEAP_ID,
  HEAP_ID_DEFAULT,
} from '../../../shared/constants/spf-ids.js';

/**
 * Parser for subgraph pair data chunks containing SCLU, SCDE, and SCDO data.
 * Based on C# subgraph connection parsing logic.
 * Creates subgraph pair entries with data and control links.
 */
export class SubgraphPairDataChunkParser extends BaseChunkParser<SubgraphPairDataChunk> {
  readonly chunkType = CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT;

  parse(context: ChunkParseContext): SubgraphPairDataChunk {
    // Get SCLU, SCDE, SCDO chunks from context
    const scluData = context.rawChunks?.get(
      CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT,
    );
    const scdeData = context.rawChunks?.get(
      CHUNK_TYPES.SUBGRAPH_CONNECTION_DEF,
    );
    const scdoData = context.rawChunks?.get(
      CHUNK_TYPES.SUBGRAPH_CONNECTION_DOT,
    );

    const datapoolChunk = context.parsedChunks?.get(
      CHUNK_TYPES.DATAPOOL,
    ) as DatapoolChunk;

    if (!scluData) {
      throw new Error('SUBGRAPH_CONNECTION_LUT chunk not found in context');
    }
    if (!scdeData) {
      throw new Error('SUBGRAPH_CONNECTION_DEF chunk not found in context');
    }
    if (!scdoData) {
      throw new Error('SUBGRAPH_CONNECTION_DOT chunk not found in context');
    }
    if (!datapoolChunk) {
      throw new Error('DATAPOOL chunk not found in context');
    }

    // Parse subgraph pairs
    const subgraphPairs = this.parseSubgraphConnections(
      scluData,
      scdeData,
      scdoData,
      datapoolChunk,
    );

    // Create and populate chunk
    const chunk = new SubgraphPairDataChunk();
    chunk.subgraphPairs = subgraphPairs;

    return chunk;
  }

  /**
   * Parse subgraph connections from SCLU, SCDE, SCDO chunks and datapool.
   * Based on C# parsing logic for subgraph connections.
   */
  private parseSubgraphConnections(
    scluData: Uint8Array,
    scdeData: Uint8Array,
    scdoData: Uint8Array,
    datapoolChunk: DatapoolChunk,
  ): SubgraphPairEntry[] {
    const lutView = new DataView(
      scluData.buffer,
      scluData.byteOffset,
      scluData.byteLength,
    );
    const cdefView = new DataView(
      scdeData.buffer,
      scdeData.byteOffset,
      scdeData.byteLength,
    );
    const cdotView = new DataView(
      scdoData.buffer,
      scdoData.byteOffset,
      scdoData.byteLength,
    );

    let lutPos = 0;
    const subgraphPairs: SubgraphPairEntry[] = [];

    try {
      // Read LUT count
      const lutCount = BinaryUtils.readUint32(lutView, lutPos);
      lutPos += BinaryUtils.SIZEOF_UINT32;

      for (let i = 0; i < lutCount; i++) {
        // Read source and destination subgraph IDs
        const sgIdSrc = BinaryUtils.readUint32(lutView, lutPos);
        lutPos += BinaryUtils.SIZEOF_UINT32;
        const sgIdDst = BinaryUtils.readUint32(lutView, lutPos);
        lutPos += BinaryUtils.SIZEOF_UINT32;

        // Read offsets for SCDE and SCDO
        const offsetSgConnDef = BinaryUtils.readUint32(lutView, lutPos);
        lutPos += BinaryUtils.SIZEOF_UINT32;
        const offsetSgConnDot = BinaryUtils.readUint32(lutView, lutPos);
        lutPos += BinaryUtils.SIZEOF_UINT32;

        // Parse connections for this subgraph pair
        const {dataLinks, controlLinks} = this.parseSubgraphPairConnections(
          cdefView,
          cdotView,
          datapoolChunk,
          offsetSgConnDef,
          offsetSgConnDot,
        );

        // Create subgraph pair entry
        subgraphPairs.push({
          sourceSubgraphId: sgIdSrc,
          destinationSubgraphId: sgIdDst,
          dataLinks,
          controlLinks,
        });
      }

      return subgraphPairs;
    } catch (error) {
      throw new Error(
        `Failed to parse subgraph connections: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Parse connections for a specific subgraph pair.
   */
  private parseSubgraphPairConnections(
    cdefView: DataView,
    cdotView: DataView,
    datapoolChunk: DatapoolChunk,
    offsetSgConnDef: number,
    offsetSgConnDot: number,
  ): {dataLinks: DataLink[]; controlLinks: ControlLink[]} {
    let cdefPos = offsetSgConnDef;
    let cdotPos = offsetSgConnDot;

    // Read number of entries from SCDE
    const numSgConnectDefEntries = BinaryUtils.readUint32(cdefView, cdefPos);
    cdefPos += BinaryUtils.SIZEOF_UINT32;

    // Read number of entries from SCDO
    const numSgConnectDotEntries = BinaryUtils.readUint32(cdotView, cdotPos);
    cdotPos += BinaryUtils.SIZEOF_UINT32;

    // Validate entry counts match
    if (numSgConnectDefEntries !== numSgConnectDotEntries) {
      throw new Error(
        `CDEF entries (${numSgConnectDefEntries}) do not match CDOT entries (${numSgConnectDotEntries}) for subgraph connections`,
      );
    }

    const dataLinks: DataLink[] = [];
    const controlLinks: ControlLink[] = [];

    // Process each entry
    for (let k = 0; k < numSgConnectDefEntries; k++) {
      // Read from SCDE
      const apmModId = BinaryUtils.readUint32(cdefView, cdefPos);
      cdefPos += BinaryUtils.SIZEOF_UINT32;
      const apmParamId = BinaryUtils.readUint32(cdefView, cdefPos);
      cdefPos += BinaryUtils.SIZEOF_UINT32;

      // Read datapool position from SCDO
      const dataPoolPos = BinaryUtils.readUint32(cdotView, cdotPos);
      cdotPos += BinaryUtils.SIZEOF_UINT32;

      // Parse based on parameter type
      if (
        apmModId === GECKO_APM_MODULE_ID &&
        apmParamId === PARAM_ID_MODULE_DATA_LINK
      ) {
        const parsedDataLinks = this.parseDataLinks(datapoolChunk, dataPoolPos);
        dataLinks.push(...parsedDataLinks);
      } else if (
        apmModId === GECKO_APM_MODULE_ID &&
        apmParamId === PARAM_ID_MODULE_CTRL_LINK
      ) {
        const parsedControlLinks = this.parseControlLinks(
          datapoolChunk,
          dataPoolPos,
        );
        controlLinks.push(...parsedControlLinks);
      }
    }

    return {dataLinks, controlLinks};
  }

  /**
   * Parse data links from datapool at specified position.
   */
  private parseDataLinks(
    datapoolChunk: DatapoolChunk,
    dataPoolPos: number,
  ): DataLink[] {
    const data = datapoolChunk.getDataAtOffset(dataPoolPos);
    if (!data) {
      return [];
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;
    const dataLinks: DataLink[] = [];

    try {
      // Read number of connections
      const numConnections = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      for (let connCount = 0; connCount < numConnections; connCount++) {
        const srcMid = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;
        const srcPortId = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;
        const dstMid = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;
        const dstPortId = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Generate natural key hash based on natural IDs
        const naturalKeyHash = buildDataLinkNaturalKeyHash(
          srcMid,
          srcPortId,
          dstMid,
          dstPortId,
        );

        dataLinks.push({
          sourceInstanceId: srcMid,
          sourcePortId: srcPortId,
          destinationInstanceId: dstMid,
          destinationPortId: dstPortId,
          isInterGraph: true, // Always true for subgraph connections
          naturalKeyHash,
        });
      }

      return dataLinks;
    } catch {
      // Return empty array on parse error to allow graceful degradation
      return [];
    }
  }

  /**
   * Parse control links from datapool at specified position.
   */
  private parseControlLinks(
    datapoolChunk: DatapoolChunk,
    dataPoolPos: number,
  ): ControlLink[] {
    const data = datapoolChunk.getDataAtOffset(dataPoolPos);
    if (!data) {
      return [];
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let pos = 0;
    const controlLinks: ControlLink[] = [];

    try {
      // Read number of connections
      const numConnections = BinaryUtils.readUint32(view, pos);
      pos += BinaryUtils.SIZEOF_UINT32;

      for (let connCount = 0; connCount < numConnections; connCount++) {
        const srcMid = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;
        const srcPortId = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;
        const dstMid = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;
        const dstPortId = BinaryUtils.readUint32(view, pos);
        pos += BinaryUtils.SIZEOF_UINT32;

        // Read number of properties
        const numProps = BinaryUtils.readInt32(view, pos);
        pos += BinaryUtils.SIZEOF_INT32;

        const properties = new Map<number, Uint8Array>();

        // Read properties
        for (let m = 0; m < numProps; m++) {
          const propId = BinaryUtils.readUint32(view, pos);
          pos += BinaryUtils.SIZEOF_UINT32;
          const propSize = BinaryUtils.readUint32(view, pos);
          pos += BinaryUtils.SIZEOF_UINT32;

          const propData = new Uint8Array(propSize);
          for (let n = 0; n < propSize; n++) {
            propData[n] = view.getUint8(pos + n);
          }
          pos += propSize;

          properties.set(propId, propData);
        }

        // Add default heap ID if not present (for older ACDB files)
        if (!properties.has(MODULE_PROP_ID_CTRL_HEAP_ID)) {
          const heapIdBytes = new Uint8Array(4);
          const heapIdView = new DataView(heapIdBytes.buffer);
          heapIdView.setUint32(0, HEAP_ID_DEFAULT, true); // little endian
          properties.set(MODULE_PROP_ID_CTRL_HEAP_ID, heapIdBytes);
        }

        controlLinks.push({
          peer1InstanceId: srcMid,
          peer1PortId: srcPortId,
          peer2InstanceId: dstMid,
          peer2PortId: dstPortId,
          properties,
        });
      }

      return controlLinks;
    } catch {
      // Return empty array on parse error to allow graceful degradation
      return [];
    }
  }
}
