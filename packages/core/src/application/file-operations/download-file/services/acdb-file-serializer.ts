/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  DownloadEntities,
  UsecaseDataDownloadModel,
  CalibrationDataDownloadModel,
  SubgraphDownloadModel,
} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import {isVoiceSubgraph} from '../../shared/utils/subgraph-utils.js';
import {ChunkBuilderService} from './chunk-builder-service.js';
import {HeaderChunkSerializer} from './chunk-serializers/header-chunk-serializer.js';
import {UsecaseDataChunkSerializer} from './chunk-serializers/usecase-data-chunk-serializer.js';
import {AudioCalibrationChunkSerializer} from './chunk-serializers/audio-calibration-chunk-serializer.js';
import {VoiceCalibrationChunkSerializer} from './chunk-serializers/voice-calibration-chunk-serializer.js';
import {DatapoolChunk} from '../../shared/acdb-chunks/datapool-chunk.js';
import {DatapoolChunkSerializer} from './chunk-serializers/datapool-chunk-serializer.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';
import {ACDB_RAW_CHUNK_TYPES} from '../../shared/constants/chunk-types.js';
import {HANDLER_KEYS} from '../../shared/constants/registry-keys.js';
import {UsecaseDataChunkBuilder} from './chunk-builders/usecase-data-chunk-builder.js';
import {UsecaseDataChunk} from '../../shared/acdb-chunks/usecase-data-chunk.js';

/**
 * Serializes domain entities to binary ACDB format.
 *
 * This is the reverse operation of AcdbFileOrchestrator (upload).
 * Converts database entities back into .acdb file format.
 *
 * Architecture:
 * - Phase 1: Build chunk objects from entities (ChunkBuilderService)
 * - Phase 2: Serialize chunks to binary (ChunkSerializers)
 * - Phase 3: Assemble final ACDB file with headers
 */
export class AcdbFileSerializer {
  private readonly chunkBuilder: ChunkBuilderService;

  constructor(private readonly workerPool?: WorkerPoolPort) {
    this.chunkBuilder = new ChunkBuilderService();
  }

  /**
   * Determine if workers should be used for parallel processing.
   */
  private shouldUseWorkers(): boolean {
    return (
      this.workerPool !== undefined && this.workerPool.isThreadingSupported()
    );
  }

  /**
   * Build usecase data chunk with optional parallel processing.
   * Splits data into 2 batches at numKeys boundaries if workers available.
   */
  private async buildUsecaseChunk(
    usecaseData: UsecaseDataDownloadModel[],
  ): Promise<UsecaseDataChunk> {
    if (this.shouldUseWorkers() && usecaseData.length > 1) {
      return this.buildUsecaseChunkParallel(usecaseData);
    }
    return UsecaseDataChunkBuilder.buildChunk({usecaseData});
  }

  /**
   * Build usecase chunk using parallel workers.
   * Splits data into 2 batches at numKeys boundaries to preserve grouping.
   *
   * Smart splitting strategy:
   * - Data is pre-sorted by numKeys, keyIds, valueIds
   * - Split at numKeys boundary to avoid breaking groups
   * - Each batch can independently build its 3-level structure
   * - Final merge is simple concatenation (already sorted)
   */
  private async buildUsecaseChunkParallel(
    usecaseData: UsecaseDataDownloadModel[],
  ): Promise<UsecaseDataChunk> {
    // Find split point at numKeys boundary
    const [batch1, batch2] = this.splitAtNumKeysBoundary(usecaseData);

    const tasks = [
      {
        handlerKey: HANDLER_KEYS.BUILD_USECASE_DATA_CHUNK,
        input: {usecaseData: batch1},
      },
      {
        handlerKey: HANDLER_KEYS.BUILD_USECASE_DATA_CHUNK,
        input: {usecaseData: batch2},
      },
    ];

    const results = await this.workerPool!.executeParallel(tasks);

    if (!results[0].success || !results[1].success) {
      throw new Error(
        `Failed to build usecase data chunk: ${results[0].error || results[1].error}`,
      );
    }

    // Merge results - simple concatenation since already sorted
    const chunk = new UsecaseDataChunk();
    const chunk1 = results[0].data as UsecaseDataChunk;
    const chunk2 = results[1].data as UsecaseDataChunk;

    chunk.gkvGroups = [...chunk1.gkvGroups, ...chunk2.gkvGroups];

    return chunk;
  }

  /**
   * Split usecase data at numKeys boundary for parallel processing.
   * Ensures each batch contains complete numKeys groups.
   *
   * @param usecaseData - Pre-sorted usecase data
   * @returns Two batches split at numKeys boundary
   */
  private splitAtNumKeysBoundary(
    usecaseData: UsecaseDataDownloadModel[],
  ): [UsecaseDataDownloadModel[], UsecaseDataDownloadModel[]] {
    if (usecaseData.length === 0) {
      return [[], []];
    }

    // Find approximate midpoint
    const midIndex = Math.floor(usecaseData.length / 2);
    const midNumKeys = usecaseData[midIndex].keyIds.length;

    // Find boundary where numKeys changes
    // Move forward to find end of current numKeys group
    let splitIndex = midIndex;
    while (
      splitIndex < usecaseData.length &&
      usecaseData[splitIndex].keyIds.length === midNumKeys
    ) {
      splitIndex++;
    }

    // If we reached the end, split at midpoint (all same numKeys)
    if (splitIndex >= usecaseData.length) {
      splitIndex = midIndex;
    }

    return [usecaseData.slice(0, splitIndex), usecaseData.slice(splitIndex)];
  }

  /**
   * Build audio calibration chunk sequentially.
   *
   * Audio calibration chunk building is intentionally not parallelized because
   * CAKT/CDLU/CDDE offsets are relative to concatenated payload chunks and must
   * be calculated in one consistent offset space. CDDO/DOT2 serialization also
   * depends on sequential datapool offset assignment.
   */
  private buildAudioCalibrationChunk(
    audioData: CalibrationDataDownloadModel[],
    datapool: DatapoolChunk,
  ) {
    return this.chunkBuilder.buildAudioCalibrationChunk(audioData, datapool);
  }

  /**
   * Build voice calibration chunk sequentially.
   *
   * Voice calibration chunk building is intentionally not parallelized because
   * datapool offsets are assigned while building calibration data objects.
   */
  private buildVoiceCalibrationChunk(
    voiceData: CalibrationDataDownloadModel[],
    datapool: DatapoolChunk,
  ) {
    return this.chunkBuilder.buildVoiceCalibrationChunk(voiceData, datapool);
  }

  /**
   * Split unified calibration data into audio and voice arrays.
   * Uses isVoiceSubgraph() to classify each entry from subgraph properties.
   * Also emits stubs for voice subgraphs that have no CKV entries.
   */
  private splitCalibrationData(
    calibrationData: CalibrationDataDownloadModel[],
    subgraphData: SubgraphDownloadModel[],
  ): {
    audio: CalibrationDataDownloadModel[];
    voice: CalibrationDataDownloadModel[];
  } {
    const propsBySubgraph = new Map(
      subgraphData.map(sg => [sg.subgraphId, sg.properties]),
    );

    const audio: CalibrationDataDownloadModel[] = [];
    const voice: CalibrationDataDownloadModel[] = [];

    for (const entry of calibrationData) {
      const properties = propsBySubgraph.get(entry.subgraphId) ?? [];
      if (isVoiceSubgraph(properties)) {
        voice.push(entry);
      } else {
        audio.push(entry);
      }
    }

    return {audio, voice};
  }

  /**
   * Serialize entities to complete ACDB file.
   *
   * @param entities - Domain entities from database
   * @returns Binary ACDB file as Uint8Array
   * @throws Error if serialization fails
   */
  async serialize(entities: DownloadEntities): Promise<Uint8Array> {
    try {
      const chunkList: Array<{id: string; data: Uint8Array}> = [];
      const datapool = new DatapoolChunk();

      this.serializeHeaderChunk(entities, chunkList);
      await this.serializeUsecaseChunks(entities, chunkList, datapool);

      const {audio, voice} = this.splitCalibrationData(
        entities.calibrationData ?? [],
        entities.subgraphData ?? [],
      );
      this.serializeAudioCalibrationChunks(audio, chunkList, datapool);
      this.serializeVoiceCalibrationChunks(voice, chunkList, datapool);
      this.serializeDatapoolChunk(chunkList, datapool);

      return this.assembleAcdbFile(chunkList);
    } catch (error) {
      throw new Error(
        `Failed to serialize ACDB file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Serialize header chunk.
   */
  private serializeHeaderChunk(
    entities: DownloadEntities,
    chunkList: Array<{id: string; data: Uint8Array}>,
  ): void {
    const headerChunk = this.chunkBuilder.buildHeaderChunk(
      entities.headerMetadata,
    );
    const headerSerializer = new HeaderChunkSerializer();
    const headerData = headerSerializer.serialize(headerChunk);
    this.addChunk(chunkList, ACDB_RAW_CHUNK_TYPES.HEADER, headerData);
  }

  /**
   * Serialize usecase data chunks (GKV_TABLE, GKV_LUT).
   */
  private async serializeUsecaseChunks(
    entities: DownloadEntities,
    chunkList: Array<{id: string; data: Uint8Array}>,
    datapool: DatapoolChunk,
  ): Promise<void> {
    if (!entities.usecaseData) return;

    const usecaseChunk = await this.buildUsecaseChunk(entities.usecaseData);
    const usecaseSerializer = new UsecaseDataChunkSerializer();
    const result = usecaseSerializer.serialize(
      usecaseChunk,
      datapool,
      entities.subgraphData ?? [],
      entities.containerData ?? [],
    );

    this.addChunk(chunkList, ACDB_RAW_CHUNK_TYPES.GKV_TABLE, result.gkvTable);
    this.addChunk(chunkList, ACDB_RAW_CHUNK_TYPES.GKV_LUT, result.gkvLut);
  }

  /**
   * Serialize audio calibration chunks.
   */
  private serializeAudioCalibrationChunks(
    audioData: CalibrationDataDownloadModel[],
    chunkList: Array<{id: string; data: Uint8Array}>,
    datapool: DatapoolChunk,
  ): void {
    if (audioData.length === 0) return;

    const buildResult = this.buildAudioCalibrationChunk(audioData, datapool);
    const calSerializer = new AudioCalibrationChunkSerializer();
    const calResult = calSerializer.serialize(buildResult);

    this.addAudioCalibrationChunks(chunkList, calResult);
  }

  /**
   * Add audio calibration chunks to chunk list.
   */
  private addAudioCalibrationChunks(
    chunkList: Array<{id: string; data: Uint8Array}>,
    calResult: {
      calSgLut: Uint8Array;
      calKeyTable: Uint8Array;
      ckvLut: Uint8Array;
      calDef: Uint8Array;
      calDot: Uint8Array;
    },
  ): void {
    if (calResult.calSgLut.length > 0) {
      this.addChunk(
        chunkList,
        ACDB_RAW_CHUNK_TYPES.CALIBRATION_SUBGRAPH_LUT,
        calResult.calSgLut,
      );
    }
    if (calResult.calKeyTable.length > 0) {
      this.addChunk(
        chunkList,
        ACDB_RAW_CHUNK_TYPES.CALIBRATION_KEY_TABLE,
        calResult.calKeyTable,
      );
    }
    if (calResult.ckvLut.length > 0) {
      this.addChunk(
        chunkList,
        ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_LUT,
        calResult.ckvLut,
      );
    }
    if (calResult.calDef.length > 0) {
      this.addChunk(
        chunkList,
        ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DEF,
        calResult.calDef,
      );
    }
    if (calResult.calDot.length > 0) {
      this.addChunk(
        chunkList,
        ACDB_RAW_CHUNK_TYPES.CALIBRATION_DATA_DOT,
        calResult.calDot,
      );
    }
  }

  /**
   * Serialize voice calibration chunks.
   */
  private serializeVoiceCalibrationChunks(
    voiceData: CalibrationDataDownloadModel[],
    chunkList: Array<{id: string; data: Uint8Array}>,
    datapool: DatapoolChunk,
  ): void {
    if (voiceData.length === 0) return;

    const buildResult = this.buildVoiceCalibrationChunk(voiceData, datapool);
    const voiceCalSerializer = new VoiceCalibrationChunkSerializer();
    const voiceCalResult = voiceCalSerializer.serialize(buildResult.chunk);

    this.addVoiceCalibrationChunks(chunkList, voiceCalResult);
  }

  /**
   * Add voice calibration chunks to chunk list.
   */
  private addVoiceCalibrationChunks(
    chunkList: Array<{id: string; data: Uint8Array}>,
    voiceCalResult: {
      vcpmCalData: Uint8Array;
      vcpmMasterKey: Uint8Array;
      vcpmCalKeyTable: Uint8Array;
      vcpmCalDataLut: Uint8Array;
      vcpmCalDataDef: Uint8Array;
    },
  ): void {
    if (voiceCalResult.vcpmCalData.length > 0) {
      this.addChunk(
        chunkList,
        ACDB_RAW_CHUNK_TYPES.VCPM_CALDATA,
        voiceCalResult.vcpmCalData,
      );
    }
    if (voiceCalResult.vcpmMasterKey.length > 0) {
      this.addChunk(
        chunkList,
        ACDB_RAW_CHUNK_TYPES.VCPM_MASTER_KEY,
        voiceCalResult.vcpmMasterKey,
      );
    }
    if (voiceCalResult.vcpmCalKeyTable.length > 0) {
      this.addChunk(
        chunkList,
        ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_KEY_TABLE,
        voiceCalResult.vcpmCalKeyTable,
      );
    }
    if (voiceCalResult.vcpmCalDataLut.length > 0) {
      this.addChunk(
        chunkList,
        ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_DATA_LUT,
        voiceCalResult.vcpmCalDataLut,
      );
    }
    if (voiceCalResult.vcpmCalDataDef.length > 0) {
      this.addChunk(
        chunkList,
        ACDB_RAW_CHUNK_TYPES.VCPM_CALIBRATION_DATA_DEF,
        voiceCalResult.vcpmCalDataDef,
      );
    }
  }

  /**
   * Serialize datapool chunk.
   */
  private serializeDatapoolChunk(
    chunkList: Array<{id: string; data: Uint8Array}>,
    datapool: DatapoolChunk,
  ): void {
    const datapoolSerializer = new DatapoolChunkSerializer();
    const datapoolBinary = datapoolSerializer.serialize(datapool);
    this.addChunk(chunkList, ACDB_RAW_CHUNK_TYPES.DATAPOOL, datapoolBinary);
  }

  /**
   * Add a chunk to the chunk list.
   *
   * @param chunkList - List of chunks to add to
   * @param id - Chunk ID (4-character string)
   * @param data - Chunk data
   */
  private addChunk(
    chunkList: Array<{id: string; data: Uint8Array}>,
    id: string,
    data: Uint8Array,
  ): void {
    chunkList.push({id, data});
  }

  /**
   * Assemble complete ACDB file with file header and chunk wrappers.
   *
   * ACDB file structure:
   * [File Header: 12 bytes]
   *   - File ID: "ACDB" (4 bytes)
   *   - File Type: uint32 (4 bytes) - placeholder 0 for now
   *   - File Length: uint32 (4 bytes) - size of chunks ONLY (excludes this 12-byte header)
   * [Chunks]
   *   Each chunk:
   *   - Chunk ID: 4 bytes
   *   - Chunk Length: uint32 (4 bytes)
   *   - Chunk Data: [N bytes]
   *
   * @param chunkList - List of chunks to assemble
   * @returns Complete ACDB file as Uint8Array
   */
  private assembleAcdbFile(
    chunkList: Array<{id: string; data: Uint8Array}>,
  ): Uint8Array {
    const FILE_HEADER_SIZE = 12;
    const CHUNK_HEADER_SIZE = 8; // chunk ID (4) + chunk length (4)

    // Calculate total size
    let chunksSize = 0;
    for (const chunk of chunkList) {
      chunksSize += CHUNK_HEADER_SIZE + chunk.data.length;
    }
    const totalSize = FILE_HEADER_SIZE + chunksSize;

    const buffer = new Uint8Array(totalSize);
    const view = new DataView(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength,
    );
    let pos = 0;

    // Write file header (12 bytes)
    const fileId = BinaryUtils.stringToUint32('ACDB');
    BinaryUtils.writeUint32(view, pos, fileId);
    pos += BinaryUtils.SIZEOF_UINT32;

    // TODO: File type - placeholder 0 for now, will be filled later
    const fileType = 0;
    BinaryUtils.writeUint32(view, pos, fileType);
    pos += BinaryUtils.SIZEOF_UINT32;

    // File Length = size of chunks only (excludes 12-byte file header)
    BinaryUtils.writeUint32(view, pos, chunksSize);
    pos += BinaryUtils.SIZEOF_UINT32;

    // Write all chunks
    for (const chunk of chunkList) {
      // Write chunk header (8 bytes)
      const chunkId = BinaryUtils.stringToUint32(chunk.id);
      BinaryUtils.writeUint32(view, pos, chunkId);
      pos += BinaryUtils.SIZEOF_UINT32;

      BinaryUtils.writeUint32(view, pos, chunk.data.length);
      pos += BinaryUtils.SIZEOF_UINT32;

      // Write chunk data
      buffer.set(chunk.data, pos);
      pos += chunk.data.length;
    }

    return buffer;
  }
}
