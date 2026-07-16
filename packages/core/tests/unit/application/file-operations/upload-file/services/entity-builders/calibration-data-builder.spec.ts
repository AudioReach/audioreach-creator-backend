/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {describe, it, expect, beforeEach, jest} from '@jest/globals';
import {CalibrationDataBuilder} from '../../../../../../../src/application/file-operations/upload-file/services/entity-builders/calibration-data-builder.js';
import {ParsedAcdb} from '../../../../../../../src/application/file-operations/upload-file/models/parsed-acdb.js';
import {VoiceCalibrationChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/voice-calibration-chunk.js';
import {AudioCalibrationChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/audio-calibration-chunk.js';
import {DatapoolChunk} from '../../../../../../../src/application/file-operations/shared/acdb-chunks/datapool-chunk.js';
import {PARSED_CHUNK_TYPES} from '../../../../../../../src/application/file-operations/shared/constants/chunk-types.js';
import type {IdGenerationPort} from '../../../../../../../src/application/ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../../../../../../../src/application/file-operations/upload-file/services/foreign-key-mapper.js';
import type {Logger} from '../../../../../../../src/shared/types/logger.interface.js';
import {
  createMockLogger,
  createMockIdGenerator,
  createMockForeignKeyMapper,
} from '../../../../../../helpers/index.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../../../src/shared/types/branded-ids.js';
import {Subgraph} from '../../../../../../../src/domain/entities/usecase-data/subgraph/subgraph.js';
import {VcpmInstance} from '../../../../../../../src/domain/entities/usecase-data/subgraph/entities/vcpm-module-instance.js';
import {SPF_VCPM_MODULE_ID} from '../../../../../../../src/application/file-operations/shared/constants/spf-ids.js';
import {KvData} from '../../../../../../../src/domain/entities/common/entities/kv-data.js';

describe('CalibrationDataBuilder', () => {
  let builder: CalibrationDataBuilder;
  let mockIdGenerator: jest.Mocked<IdGenerationPort>;
  let mockForeignKeyMapper: jest.Mocked<ForeignKeyMapper>;
  let mockLogger: jest.Mocked<Logger>;
  const TEST_FILE_SYSTEM_ID = 123;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockIdGenerator = createMockIdGenerator();
    mockForeignKeyMapper = createMockForeignKeyMapper();
    // Default: sequential IDs starting at 1
    let idCounter = 1;
    mockIdGenerator.getNextId.mockImplementation(async () => idCounter++);
    builder = new CalibrationDataBuilder(mockIdGenerator, mockLogger);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // buildCalibrationDataByModule — no chunks
  // ─────────────────────────────────────────────────────────────────────────────

  describe('buildCalibrationDataByModule — no calibration chunks', () => {
    it('should return empty map when no calibration chunks are present', async () => {
      const parsedAcdb = new ParsedAcdb();

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      expect(result.size).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // buildCalibrationDataByModule — voice-SPF path
  // ─────────────────────────────────────────────────────────────────────────────

  describe('buildCalibrationDataByModule — voice-SPF path', () => {
    function buildVoiceChunkWithOneSubgraph(): VoiceCalibrationChunk {
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;
      chunk.voiceParamId = 20;

      // Populate caches directly — the parser would do this during upload
      // Cal key table at offset 0: one key ID = 100
      chunk.setCalKeyTableAt(0, {voiceKeyIds: [100]});

      // CKV LUT at offset 0: one entry with one cal key value = 200
      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 1,
        voiceCkvLookupEntries: [{voiceCalKeyValues: [200]}],
      });

      // DEF entry at offset 0: one module-param pair
      chunk.setCalDefinitionEntryAt(0, {
        moduleInstanceParamPairs: [{moduleInstanceId: 300, paramId: 400}],
      });

      // DOT entry keyed by DEF offset (0): one datapool offset = 0
      chunk.setCalDataOffsetEntryAt(0, {offsetsInGlobalDataPool: [0]});

      // Master key table at offset 0 (needed by builder)
      chunk.setMasterKeyTableAt(0, {
        keyInfos: [{voiceKeyId: 100, isDynamic: false}],
      });

      chunk.subgraphCalTables.push({
        subgraphId: 999,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0,
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 1,
                offsetsInGlobalDataPool: [0],
              },
            ],
          },
        ],
      });

      return chunk;
    }

    it('should group KvData by SPF module systemId for voice calibration', async () => {
      const parsedAcdb = new ParsedAcdb();
      const voiceChunk = buildVoiceChunkWithOneSubgraph();
      parsedAcdb.addChunk(
        PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA,
        voiceChunk,
      );

      // Datapool with payload at offset 0
      const datapoolChunk = new DatapoolChunk();
      datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
      datapoolChunk.offsets = [0];
      datapoolChunk.totalLength = 4;
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      // FK mappings for voice-SPF path
      mockForeignKeyMapper.getValueSystemId.mockReturnValue(asSystemId(500));
      mockForeignKeyMapper.getSpfModuleSystemId.mockReturnValue(
        asSystemId(600) as any,
      );
      mockForeignKeyMapper.getModuleDefinitionSystemIdFromInstance.mockReturnValue(
        asSystemId(700) as any,
      );
      mockForeignKeyMapper.getParamDefinitionSystemId.mockReturnValue(
        asSystemId(800) as any,
      );

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      expect(result.size).toBeGreaterThan(0);
      expect(result.has(600 as any)).toBe(true);
      const kvDataList = result.get(600 as any)!;
      expect(kvDataList.length).toBeGreaterThan(0);
    });

    it('should skip entries where CKV LUT table is not cached', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      // DEF entry cached but CKV LUT NOT cached at offset 99
      chunk.setCalDefinitionEntryAt(0, {
        moduleInstanceParamPairs: [{moduleInstanceId: 300, paramId: 400}],
      });
      chunk.setCalDataOffsetEntryAt(0, {offsetsInGlobalDataPool: [0]});
      chunk.setCalKeyTableAt(0, {voiceKeyIds: [100]});
      chunk.setMasterKeyTableAt(0, {
        keyInfos: [{voiceKeyId: 100, isDynamic: false}],
      });

      chunk.subgraphCalTables.push({
        subgraphId: 1,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 99, // no entry cached here
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 1,
                offsetsInGlobalDataPool: [0],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      expect(result.size).toBe(0);
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });

    it('should skip entries where DEF entry is not cached', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 0,
        voiceCkvLookupEntries: [],
      });
      // DEF NOT cached at offset 0
      chunk.setCalKeyTableAt(0, {voiceKeyIds: []});
      chunk.setMasterKeyTableAt(0, {keyInfos: []});

      chunk.subgraphCalTables.push({
        subgraphId: 1,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0,
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 0,
                offsetsInGlobalDataPool: [],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // DEF entry is missing — skipped
      expect(result.size).toBe(0);
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });

    it('should skip entries when value system ID resolution fails and there are key IDs', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      chunk.setCalKeyTableAt(0, {voiceKeyIds: [100]});
      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 1,
        voiceCkvLookupEntries: [{voiceCalKeyValues: [200]}],
      });
      chunk.setCalDefinitionEntryAt(0, {
        moduleInstanceParamPairs: [{moduleInstanceId: 300, paramId: 400}],
      });
      chunk.setCalDataOffsetEntryAt(0, {offsetsInGlobalDataPool: [0]});
      chunk.setMasterKeyTableAt(0, {
        keyInfos: [{voiceKeyId: 100, isDynamic: false}],
      });

      chunk.subgraphCalTables.push({
        subgraphId: 1,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0,
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 1,
                offsetsInGlobalDataPool: [0],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      // Value system ID lookup returns undefined → resolution fails
      mockForeignKeyMapper.getValueSystemId.mockReturnValue(undefined);

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      expect(result.size).toBe(0);
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // attachVcpmDataToSubgraphs — voice-VCPM path
  // ─────────────────────────────────────────────────────────────────────────────

  describe('attachVcpmDataToSubgraphs — voice-VCPM path', () => {
    function makeSubgraph(subgraphId: number, systemId: number): Subgraph {
      return new Subgraph({
        systemId,
        subgraphId,
        fileSystemId: TEST_FILE_SYSTEM_ID,
        name: `sg_${subgraphId}`,
        isExported: false,
      });
    }

    it('should return early when no VoiceCalibrationChunk present', async () => {
      const parsedAcdb = new ParsedAcdb();
      const subgraph = makeSubgraph(999, 1);

      await builder.attachVcpmDataToSubgraphs(
        parsedAcdb,
        mockForeignKeyMapper,
        [subgraph],
        TEST_FILE_SYSTEM_ID,
      );

      expect(subgraph.vcpmDataInstance).toBeNull();
    });

    it('should return early when VoiceCalibrationChunk has no subgraph tables', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      // subgraphCalTables is empty by default
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const subgraph = makeSubgraph(999, 1);

      await builder.attachVcpmDataToSubgraphs(
        parsedAcdb,
        mockForeignKeyMapper,
        [subgraph],
        TEST_FILE_SYSTEM_ID,
      );

      expect(subgraph.vcpmDataInstance).toBeNull();
    });

    it('should return early and warn when DatapoolChunk is missing', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;
      chunk.subgraphCalTables.push({
        subgraphId: 999,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [],
      });
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);
      // No DatapoolChunk added

      mockForeignKeyMapper.getVcpmModuleDefinitionSystemId.mockReturnValue(
        asSystemId(50),
      );

      const subgraph = makeSubgraph(999, 1);

      await builder.attachVcpmDataToSubgraphs(
        parsedAcdb,
        mockForeignKeyMapper,
        [subgraph],
        TEST_FILE_SYSTEM_ID,
      );

      expect(subgraph.vcpmDataInstance).toBeNull();
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });

    it('should return early and warn when VCPM module definition not found in ForeignKeyMapper', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;
      chunk.subgraphCalTables.push({
        subgraphId: 999,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [],
      });
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const datapoolChunk = new DatapoolChunk();
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      // VCPM module definition lookup returns undefined
      mockForeignKeyMapper.getVcpmModuleDefinitionSystemId.mockReturnValue(
        undefined,
      );

      const subgraph = makeSubgraph(999, 1);

      await builder.attachVcpmDataToSubgraphs(
        parsedAcdb,
        mockForeignKeyMapper,
        [subgraph],
        TEST_FILE_SYSTEM_ID,
      );

      expect(subgraph.vcpmDataInstance).toBeNull();
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });

    it('should attach VcpmInstance to matching subgraph', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;
      chunk.setMasterKeyTableAt(0, {keyInfos: []});
      chunk.subgraphCalTables.push({
        subgraphId: 999,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [],
      });
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const datapoolChunk = new DatapoolChunk();
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      mockForeignKeyMapper.getVcpmModuleDefinitionSystemId.mockReturnValue(
        asSystemId(50),
      );

      const subgraph = makeSubgraph(999, 1);

      await builder.attachVcpmDataToSubgraphs(
        parsedAcdb,
        mockForeignKeyMapper,
        [subgraph],
        TEST_FILE_SYSTEM_ID,
      );

      expect(subgraph.vcpmDataInstance).toBeInstanceOf(VcpmInstance);
      expect(subgraph.vcpmDataInstance!.vcpmModuleDefinitionId).toBe(50);
    });

    it('should warn and skip when subgraph not found in provided list', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;
      chunk.setMasterKeyTableAt(0, {keyInfos: []});
      chunk.subgraphCalTables.push({
        subgraphId: 888, // won't match any subgraph
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [],
      });
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const datapoolChunk = new DatapoolChunk();
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      mockForeignKeyMapper.getVcpmModuleDefinitionSystemId.mockReturnValue(
        asSystemId(50),
      );

      const subgraph = makeSubgraph(999, 1); // subgraphId 999 ≠ 888

      await builder.attachVcpmDataToSubgraphs(
        parsedAcdb,
        mockForeignKeyMapper,
        [subgraph],
        TEST_FILE_SYSTEM_ID,
      );

      expect(subgraph.vcpmDataInstance).toBeNull();
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });

    it('should attach VcpmInstance with CKV data when VCPM param definitions are resolved', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      // Full calibration data for VCPM path
      chunk.setMasterKeyTableAt(0, {
        keyInfos: [{voiceKeyId: 100, isDynamic: false}],
      });
      chunk.setCalKeyTableAt(0, {voiceKeyIds: [100]});
      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 1,
        voiceCkvLookupEntries: [{voiceCalKeyValues: [200]}],
      });
      chunk.setCalDefinitionEntryAt(0, {
        moduleInstanceParamPairs: [
          {moduleInstanceId: SPF_VCPM_MODULE_ID, paramId: 400},
        ],
      });
      chunk.setCalDataOffsetEntryAt(0, {offsetsInGlobalDataPool: [0]});

      chunk.subgraphCalTables.push({
        subgraphId: 999,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0,
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 1,
                offsetsInGlobalDataPool: [0],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const datapoolChunk = new DatapoolChunk();
      datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
      datapoolChunk.offsets = [0];
      datapoolChunk.totalLength = 4;
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      mockForeignKeyMapper.getVcpmModuleDefinitionSystemId.mockReturnValue(
        asSystemId(50),
      );
      mockForeignKeyMapper.getValueSystemId.mockReturnValue(asSystemId(500));
      mockForeignKeyMapper.getVcpmParamDefinitionSystemId.mockReturnValue(
        asSystemId(600),
      );

      const subgraph = makeSubgraph(999, 1);

      await builder.attachVcpmDataToSubgraphs(
        parsedAcdb,
        mockForeignKeyMapper,
        [subgraph],
        TEST_FILE_SYSTEM_ID,
      );

      expect(subgraph.vcpmDataInstance).toBeInstanceOf(VcpmInstance);
      expect(subgraph.vcpmDataInstance!.ckvs.length).toBe(1);
      const ckv = subgraph.vcpmDataInstance!.ckvs[0];
      expect(ckv.parameterPayloads.length).toBe(1);
    });

    it('should warn and skip CKV when paramId not found in ForeignKeyMapper', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      chunk.setMasterKeyTableAt(0, {
        keyInfos: [{voiceKeyId: 100, isDynamic: false}],
      });
      chunk.setCalKeyTableAt(0, {voiceKeyIds: [100]});
      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 1,
        voiceCkvLookupEntries: [{voiceCalKeyValues: [200]}],
      });
      chunk.setCalDefinitionEntryAt(0, {
        moduleInstanceParamPairs: [
          {moduleInstanceId: SPF_VCPM_MODULE_ID, paramId: 400},
        ],
      });
      chunk.setCalDataOffsetEntryAt(0, {offsetsInGlobalDataPool: [0]});

      chunk.subgraphCalTables.push({
        subgraphId: 999,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0,
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 1,
                offsetsInGlobalDataPool: [0],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const datapoolChunk = new DatapoolChunk();
      datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
      datapoolChunk.offsets = [0];
      datapoolChunk.totalLength = 4;
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      mockForeignKeyMapper.getVcpmModuleDefinitionSystemId.mockReturnValue(
        asSystemId(50),
      );
      mockForeignKeyMapper.getValueSystemId.mockReturnValue(asSystemId(500));
      // Param definition not found
      mockForeignKeyMapper.getVcpmParamDefinitionSystemId.mockReturnValue(
        undefined,
      );

      const subgraph = makeSubgraph(999, 1);

      await builder.attachVcpmDataToSubgraphs(
        parsedAcdb,
        mockForeignKeyMapper,
        [subgraph],
        TEST_FILE_SYSTEM_ID,
      );

      // VcpmInstance is created but the CKV is skipped because paramId was not resolved
      expect(subgraph.vcpmDataInstance).toBeInstanceOf(VcpmInstance);
      expect(subgraph.vcpmDataInstance!.ckvs.length).toBe(0);
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // buildCalibrationDataByModule — audio path
  // ─────────────────────────────────────────────────────────────────────────────

  describe('buildCalibrationDataByModule — audio path', () => {
    it('should return empty map when AudioCalibrationChunk has no entries', async () => {
      const parsedAcdb = new ParsedAcdb();
      const audioChunk = new AudioCalibrationChunk();
      // subgraphLookupEntries is empty by default
      parsedAcdb.addChunk(
        PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA,
        audioChunk,
      );

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      expect(result.size).toBe(0);
    });

    it('should group KvData by SPF module systemId for audio calibration', async () => {
      const parsedAcdb = new ParsedAcdb();
      const audioChunk = new AudioCalibrationChunk();

      // Populate audio chunk caches
      audioChunk.setCalKeyTableAt(0, [100]); // key ID 100
      audioChunk.setCkvLookupTableAt(0, {
        numCalKeyValues: 1,
        ckvLookupEntries: [
          {
            calKeyValues: [200],
            offsetCalDefinition: 0,
            offsetCalDataOffset: 0,
            offsetDOT2: 0,
          },
        ],
      });
      audioChunk.setCalDefinitionEntryAt(0, {
        calIdEntries: [{moduleInstanceId: 300, paramId: 400}],
      });
      audioChunk.setCalDataOffsetEntryAt(0, {calDataOffsets: [0]});

      audioChunk.subgraphLookupEntries.push({
        subgraphId: 1,
        calKeyTableEntries: [{offsetCalKeyTable: 0, offsetCalLookupTable: 0}],
      });

      parsedAcdb.addChunk(
        PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA,
        audioChunk,
      );

      const datapoolChunk = new DatapoolChunk();
      datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
      datapoolChunk.offsets = [0];
      datapoolChunk.totalLength = 4;
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      mockForeignKeyMapper.getValueSystemId.mockReturnValue(asSystemId(500));
      mockForeignKeyMapper.getSpfModuleSystemId.mockReturnValue(
        asSystemId(600) as any,
      );
      mockForeignKeyMapper.getModuleDefinitionSystemIdFromInstance.mockReturnValue(
        asSystemId(700) as any,
      );
      mockForeignKeyMapper.getParamDefinitionSystemId.mockReturnValue(
        asSystemId(800) as any,
      );

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      expect(result.size).toBeGreaterThan(0);
      expect(result.has(600 as any)).toBe(true);
    });

    it('should warn and skip audio entry when key table is missing', async () => {
      const parsedAcdb = new ParsedAcdb();
      const audioChunk = new AudioCalibrationChunk();

      // CKV LUT cached at offset 0 but key table NOT cached
      audioChunk.setCkvLookupTableAt(0, {
        numCalKeyValues: 0,
        ckvLookupEntries: [],
      });

      audioChunk.subgraphLookupEntries.push({
        subgraphId: 1,
        calKeyTableEntries: [{offsetCalKeyTable: 99, offsetCalLookupTable: 0}], // 99 not cached
      });

      parsedAcdb.addChunk(
        PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA,
        audioChunk,
      );

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      expect(result.size).toBe(0);
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Merged extract method — shared edge cases
  // ─────────────────────────────────────────────────────────────────────────────

  describe('merged extractModuleParameterPayloads — shared edge cases', () => {
    it('should return empty KvData payload list when DEF/DOT pair count mismatches', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      chunk.setCalKeyTableAt(0, {voiceKeyIds: []});
      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 0,
        voiceCkvLookupEntries: [{voiceCalKeyValues: []}],
      });
      // DEF has 2 pairs but DOT has 1 offset → mismatch
      chunk.setCalDefinitionEntryAt(0, {
        moduleInstanceParamPairs: [
          {moduleInstanceId: 1, paramId: 1},
          {moduleInstanceId: 2, paramId: 2},
        ],
      });
      chunk.setCalDataOffsetEntryAt(0, {offsetsInGlobalDataPool: [0]});
      chunk.setMasterKeyTableAt(0, {keyInfos: []});

      chunk.subgraphCalTables.push({
        subgraphId: 1,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0,
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 2,
                offsetsInGlobalDataPool: [0],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      mockForeignKeyMapper.getSpfModuleSystemId.mockReturnValue(
        asSystemId(600) as any,
      );
      mockForeignKeyMapper.getModuleDefinitionSystemIdFromInstance.mockReturnValue(
        asSystemId(700) as any,
      );
      mockForeignKeyMapper.getParamDefinitionSystemId.mockReturnValue(
        asSystemId(800) as any,
      );

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // Mismatch causes no KvData to be produced
      expect(result.size).toBe(0);
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });

    it('should produce empty payloads when DatapoolChunk is missing', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      chunk.setCalKeyTableAt(0, {voiceKeyIds: []});
      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 0,
        voiceCkvLookupEntries: [{voiceCalKeyValues: []}],
      });
      chunk.setCalDefinitionEntryAt(0, {
        moduleInstanceParamPairs: [{moduleInstanceId: 300, paramId: 400}],
      });
      chunk.setCalDataOffsetEntryAt(0, {offsetsInGlobalDataPool: [0]});
      chunk.setMasterKeyTableAt(0, {keyInfos: []});

      chunk.subgraphCalTables.push({
        subgraphId: 1,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0,
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 1,
                offsetsInGlobalDataPool: [0],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);
      // No DatapoolChunk

      mockForeignKeyMapper.getSpfModuleSystemId.mockReturnValue(
        asSystemId(600) as any,
      );

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // No payloads; module still gets KvData entry (with empty payloads) if module is resolved
      expect(mockLogger.logWarn).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // VCPM path — one KvData per CKV LUT entry (regression for DuplicateCkvExceptionError)
  // ─────────────────────────────────────────────────────────────────────────────

  describe('attachVcpmDataToSubgraphs — one KvData per CKV LUT entry', () => {
    it('should create one KvData per CKV LUT entry (not one per CalDataObj)', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      chunk.setMasterKeyTableAt(0, {
        keyInfos: [{voiceKeyId: 100, isDynamic: false}],
      });
      chunk.setCalKeyTableAt(0, {voiceKeyIds: [100]});

      // CKV LUT with 2 distinct entries (different key values → different valueDefinitionSystemIds)
      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 1,
        voiceCkvLookupEntries: [
          {voiceCalKeyValues: [200]}, // entry 1
          {voiceCalKeyValues: [201]}, // entry 2
        ],
      });

      chunk.setCalDefinitionEntryAt(0, {
        moduleInstanceParamPairs: [
          {moduleInstanceId: SPF_VCPM_MODULE_ID, paramId: 400},
        ],
      });
      chunk.setCalDataOffsetEntryAt(0, {offsetsInGlobalDataPool: [0]});

      chunk.subgraphCalTables.push({
        subgraphId: 999,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0,
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 1,
                offsetsInGlobalDataPool: [0],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const datapoolChunk = new DatapoolChunk();
      datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
      datapoolChunk.offsets = [0];
      datapoolChunk.totalLength = 4;
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      mockForeignKeyMapper.getVcpmModuleDefinitionSystemId.mockReturnValue(
        asSystemId(50),
      );
      // Return distinct value system IDs for different key values
      mockForeignKeyMapper.getValueSystemId
        .mockReturnValueOnce(asSystemId(500)) // for voiceCalKeyValues[0]=200
        .mockReturnValueOnce(asSystemId(501)); // for voiceCalKeyValues[0]=201
      mockForeignKeyMapper.getVcpmParamDefinitionSystemId.mockReturnValue(
        asSystemId(600),
      );

      const subgraph = new Subgraph({
        systemId: 1,
        subgraphId: 999,
        fileSystemId: TEST_FILE_SYSTEM_ID,
        name: 'sg_999',
        isExported: false,
      });

      // Must NOT throw DuplicateCkvExceptionError
      await expect(
        builder.attachVcpmDataToSubgraphs(
          parsedAcdb,
          mockForeignKeyMapper,
          [subgraph],
          TEST_FILE_SYSTEM_ID,
        ),
      ).resolves.not.toThrow();

      expect(subgraph.vcpmDataInstance).toBeInstanceOf(VcpmInstance);
      // Two CKV LUT entries → two KvData
      expect(subgraph.vcpmDataInstance!.ckvs.length).toBe(2);
    });

    it('should create one KvData per CalDataObj when each uses a distinct CKV LUT', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      chunk.setMasterKeyTableAt(0, {
        keyInfos: [{voiceKeyId: 100, isDynamic: false}],
      });
      chunk.setCalKeyTableAt(0, {voiceKeyIds: [100]});

      // Two distinct CKV LUTs at different offsets, each with one entry
      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 1,
        voiceCkvLookupEntries: [{voiceCalKeyValues: [200]}],
      });
      chunk.setCkvLookupTableAt(4, {
        numVoiceCalKeyValues: 1,
        voiceCkvLookupEntries: [{voiceCalKeyValues: [201]}],
      });

      // Two CalDataObjs with distinct DEF offsets
      chunk.setCalDefinitionEntryAt(4, {
        moduleInstanceParamPairs: [
          {moduleInstanceId: SPF_VCPM_MODULE_ID, paramId: 400},
        ],
      });
      chunk.setCalDataOffsetEntryAt(4, {offsetsInGlobalDataPool: [0]});
      chunk.setCalDefinitionEntryAt(8, {
        moduleInstanceParamPairs: [
          {moduleInstanceId: SPF_VCPM_MODULE_ID, paramId: 401},
        ],
      });
      chunk.setCalDataOffsetEntryAt(8, {offsetsInGlobalDataPool: [0]});

      chunk.subgraphCalTables.push({
        subgraphId: 999,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0, // distinct LUT
                offsetVoiceCalDefinitionTable: 4,
                numModuleInstanceParamPairs: 1,
                offsetsInGlobalDataPool: [0],
              },
              {
                offsetVoiceCkvLookupTable: 4, // distinct LUT
                offsetVoiceCalDefinitionTable: 8,
                numModuleInstanceParamPairs: 1,
                offsetsInGlobalDataPool: [0],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const datapoolChunk = new DatapoolChunk();
      datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
      datapoolChunk.offsets = [0];
      datapoolChunk.totalLength = 4;
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      mockForeignKeyMapper.getVcpmModuleDefinitionSystemId.mockReturnValue(
        asSystemId(50),
      );
      // Different value system IDs for different key values
      mockForeignKeyMapper.getValueSystemId
        .mockReturnValueOnce(asSystemId(500)) // for CalDataObj[0] CKV entry keyVal=200
        .mockReturnValueOnce(asSystemId(501)); // for CalDataObj[1] CKV entry keyVal=201
      // Distinct param system IDs for the two params
      mockForeignKeyMapper.getVcpmParamDefinitionSystemId
        .mockReturnValueOnce(asSystemId(600))
        .mockReturnValueOnce(asSystemId(601));

      const subgraph = new Subgraph({
        systemId: 1,
        subgraphId: 999,
        fileSystemId: TEST_FILE_SYSTEM_ID,
        name: 'sg_999',
        isExported: false,
      });

      // Must NOT throw — two CalDataObjs each produce their own KvData
      await expect(
        builder.attachVcpmDataToSubgraphs(
          parsedAcdb,
          mockForeignKeyMapper,
          [subgraph],
          TEST_FILE_SYSTEM_ID,
        ),
      ).resolves.not.toThrow();

      expect(subgraph.vcpmDataInstance!.ckvs.length).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SPF_VCPM_MODULE_ID skipping
  // ─────────────────────────────────────────────────────────────────────────────

  describe('SPF_VCPM_MODULE_ID (0x04) entries are silently skipped', () => {
    it('VCPM path: skips 0x04 entry without warning and resolves the real param', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      chunk.setMasterKeyTableAt(0, {
        keyInfos: [{voiceKeyId: 100, isDynamic: false}],
      });
      chunk.setCalKeyTableAt(0, {voiceKeyIds: [100]});
      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 1,
        voiceCkvLookupEntries: [{voiceCalKeyValues: [200]}],
      });
      // DEF has two pairs: first is the VCPM housekeeping row (0x04), second is a real param
      chunk.setCalDefinitionEntryAt(0, {
        moduleInstanceParamPairs: [
          {moduleInstanceId: SPF_VCPM_MODULE_ID, paramId: 999}, // housekeeping — skip
          {moduleInstanceId: 300, paramId: 400}, // real param
        ],
      });
      chunk.setCalDataOffsetEntryAt(0, {offsetsInGlobalDataPool: [0, 0]});
      chunk.subgraphCalTables.push({
        subgraphId: 999,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0,
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 2,
                offsetsInGlobalDataPool: [0, 0],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const datapoolChunk = new DatapoolChunk();
      datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
      datapoolChunk.offsets = [0];
      datapoolChunk.totalLength = 4;
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      mockForeignKeyMapper.getVcpmModuleDefinitionSystemId.mockReturnValue(
        asSystemId(50),
      );
      mockForeignKeyMapper.getValueSystemId.mockReturnValue(asSystemId(500));
      mockForeignKeyMapper.getVcpmParamDefinitionSystemId.mockReturnValue(
        asSystemId(600),
      );

      const subgraph = new Subgraph({
        systemId: 1,
        subgraphId: 999,
        fileSystemId: TEST_FILE_SYSTEM_ID,
        name: 'sg_999',
        isExported: false,
      });

      await builder.attachVcpmDataToSubgraphs(
        parsedAcdb,
        mockForeignKeyMapper,
        [subgraph],
        TEST_FILE_SYSTEM_ID,
      );

      expect(subgraph.vcpmDataInstance).toBeInstanceOf(VcpmInstance);
      const ckv = subgraph.vcpmDataInstance!.ckvs[0];
      // Only the real param (paramId=400) should produce a payload; 0x04 is skipped
      expect(ckv.parameterPayloads.length).toBe(1);
      // getVcpmParamDefinitionSystemId must NOT have been called for the 0x04 entry
      expect(
        mockForeignKeyMapper.getVcpmParamDefinitionSystemId,
      ).toHaveBeenCalledTimes(1);
      // No 'vcpm_param_not_found' warning for the housekeeping row
      const warnCalls = (mockLogger.logWarn as jest.Mock).mock.calls;
      const spuriousWarn = warnCalls.some(
        (args: unknown[]) =>
          (args[0] as {action?: string}).action === 'vcpm_param_not_found',
      );
      expect(spuriousWarn).toBe(false);
    });

    it('SPF path: skips 0x04 entry in DEF table without attempting SPF module lookup', async () => {
      const parsedAcdb = new ParsedAcdb();
      const chunk = new VoiceCalibrationChunk();
      chunk.voiceModuleInstanceId = 10;

      chunk.setCalKeyTableAt(0, {voiceKeyIds: [100]});
      chunk.setCkvLookupTableAt(0, {
        numVoiceCalKeyValues: 1,
        voiceCkvLookupEntries: [{voiceCalKeyValues: [200]}],
      });
      // DEF has two pairs: first is VCPM module row (0x04), second is a real SPF module
      chunk.setCalDefinitionEntryAt(0, {
        moduleInstanceParamPairs: [
          {moduleInstanceId: SPF_VCPM_MODULE_ID, paramId: 999}, // must be skipped
          {moduleInstanceId: 300, paramId: 400},
        ],
      });
      chunk.setCalDataOffsetEntryAt(0, {offsetsInGlobalDataPool: [0, 0]});
      chunk.setMasterKeyTableAt(0, {
        keyInfos: [{voiceKeyId: 100, isDynamic: false}],
      });
      chunk.subgraphCalTables.push({
        subgraphId: 1,
        subgraphCalTableSize: 0,
        majorVersion: 1,
        minorVersion: 0,
        offsetVoiceMasterKeyTable: 0,
        voiceCkvDataTables: [
          {
            voiceCkvDataTableSize: 0,
            offsetVoiceCalKeyTable: 0,
            dataOffsetTableSize: 0,
            calDataObjects: [
              {
                offsetVoiceCkvLookupTable: 0,
                offsetVoiceCalDefinitionTable: 0,
                numModuleInstanceParamPairs: 2,
                offsetsInGlobalDataPool: [0, 0],
              },
            ],
          },
        ],
      });

      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA, chunk);

      const datapoolChunk = new DatapoolChunk();
      datapoolChunk.payloads = [new Uint8Array([1, 2, 3, 4])];
      datapoolChunk.offsets = [0];
      datapoolChunk.totalLength = 4;
      parsedAcdb.addChunk(PARSED_CHUNK_TYPES.DATAPOOL, datapoolChunk);

      mockForeignKeyMapper.getValueSystemId.mockReturnValue(asSystemId(500));
      mockForeignKeyMapper.getSpfModuleSystemId.mockReturnValue(
        asSystemId(600) as any,
      );
      mockForeignKeyMapper.getModuleDefinitionSystemIdFromInstance.mockReturnValue(
        asSystemId(700) as any,
      );
      mockForeignKeyMapper.getParamDefinitionSystemId.mockReturnValue(
        asSystemId(800) as any,
      );

      const result = await builder.buildCalibrationDataByModule(
        parsedAcdb,
        mockForeignKeyMapper,
        TEST_FILE_SYSTEM_ID,
      );

      // Only moduleInstanceId=300 produces a KvData entry — 0x04 is silently dropped
      expect(result.size).toBe(1);
      // getSpfModuleSystemId must NOT have been called with the VCPM module ID
      const spfLookupArgs = (
        mockForeignKeyMapper.getSpfModuleSystemId as jest.Mock
      ).mock.calls;
      const vcpmLookupAttempted = spfLookupArgs.some(
        (args: unknown[]) => args[0] === asNaturalId(SPF_VCPM_MODULE_ID),
      );
      expect(vcpmLookupAttempted).toBe(false);
    });
  });
});

describe('CalibrationDataBuilder.applyUiMetadataToCkvs', () => {
  let builder: CalibrationDataBuilder;
  let mockFkMapper: ReturnType<typeof createMockForeignKeyMapper>;
  let mockIdGenerator: ReturnType<typeof createMockIdGenerator>;

  beforeEach(() => {
    mockFkMapper = createMockForeignKeyMapper();
    mockIdGenerator = createMockIdGenerator();
    builder = new CalibrationDataBuilder(mockIdGenerator);
  });

  it('should decode base64 payload and set uiPersistence on matching zero-CKV', () => {
    const ckv = new KvData({
      systemId: 1,
      valueDefinitionSystemIds: [],
      uiPersistence: null,
    });
    const payloadData = Buffer.from('hello').toString('base64');
    const uiMeta = {
      version: {major: 1, minor: 0},
      payloadMap: [{id: 'abc', data: payloadData}],
      modules: [
        {
          definitionId: 0x1234,
          instanceId: 42,
          calViewUiPersistences: [{payloadId: 'abc'}],
        },
      ],
      usecases: [],
      subsystems: [],
      subgraphs: [],
      dataLinks: [],
    };
    builder.applyUiMetadataToCkvs([ckv], 42, uiMeta as any, mockFkMapper);
    expect(ckv.uiPersistence).not.toBeNull();
    expect(Buffer.from(ckv.uiPersistence!).toString()).toBe('hello');
  });

  it('should logError and leave uiPersistence null when no matching CKV', () => {
    const mockLogger = createMockLogger();
    builder = new CalibrationDataBuilder(mockIdGenerator, mockLogger);
    const ckv = new KvData({
      systemId: 1,
      valueDefinitionSystemIds: [999],
      uiPersistence: null,
    });
    const payloadData = Buffer.from('test').toString('base64');
    const uiMeta = {
      version: {major: 1, minor: 0},
      payloadMap: [{id: 'abc', data: payloadData}],
      modules: [
        {
          definitionId: 0x1234,
          instanceId: 42,
          calViewUiPersistences: [{payloadId: 'abc'}], // zero-CKV match but ckv has valueSystemIds=[999]
        },
      ],
      usecases: [],
      subsystems: [],
      subgraphs: [],
      dataLinks: [],
    };
    builder.applyUiMetadataToCkvs([ckv], 42, uiMeta as any, mockFkMapper);
    expect(ckv.uiPersistence).toBeNull();
    expect(mockLogger.logError).toHaveBeenCalled();
  });
});
