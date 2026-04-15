/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {ParsedAcdb} from '../../models/parsed-acdb.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import {KvData} from '../../../../../domain/entities/common/entities/kv-data.js';
import {ModuleParameterData} from '../../../../../domain/entities/common/value-objects/module-parameter-data.js';
import {
  asSystemId,
  asNaturalId,
} from '../../../../../shared/types/branded-ids.js';
import type {KeyVectorInput} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import {PARSED_CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import type {
  VoiceCalibrationChunk,
  VoiceSubgraphCalTable,
  VoiceCkvDataTable,
  VoiceCalDataObject,
  VoiceCkvLookupTable,
  VoiceCalDefinitionEntry,
  VoiceCalDataOffsetEntry,
} from '../../../shared/acdb-chunks/voice-calibration-chunk.js';
import type {
  AudioCalibrationChunk,
  CalDefinitionEntry,
  CalDataOffsetEntry,
} from '../../../shared/acdb-chunks/audio-calibration-chunk.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';

/**
 * VCPM Configuration instance ID - should be skipped during calibration processing
 */
const VCPM_CFG_INSTANCE_ID = 0x00_00_00_01;

/**
 * Intermediate structure for module-parameter-payload extraction
 */
interface ModuleParameterPayload {
  moduleInstanceId: number;
  parameterId: number;
  payload: Uint8Array;
}

/**
 * Intermediate structure to track KvData with its associated module during building
 */
interface KvDataWithModule {
  kvData: KvData;
  moduleSystemId: number;
}

/**
 * Builder for creating calibration data (KvData) entities from parsed ACDB chunks.
 * Handles both voice and audio calibration data processing.
 * Uses ForeignKeyMapper for KeyVector deduplication.
 */
export class CalibrationDataBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly logger?: Logger,
  ) {}

  /**
   * Main API: Build calibration data with KeyVector deduplication.
   * Returns KvData entities grouped by module systemId, ready for attachment to SpfModules.
   */
  async buildCalibrationDataByModule(
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
  ): Promise<Map<number, KvData[]>> {
    // Step 1: Build raw KvData with module associations (systemId = 0, no KeyVector systemId yet)
    const rawResult = this.buildCalibrationData(parsedAcdb, foreignKeyMapper);

    // Step 2: Assign systemIds to KeyVectors and KvData entities
    const kvDataWithModules = await this.assignSystemIds(
      rawResult.kvDataWithModules,
      foreignKeyMapper,
      fileSystemId,
    );

    // Step 3: Group KvData by module systemId
    const kvDataByModule = new Map<number, KvData[]>();
    for (const {kvData, moduleSystemId} of kvDataWithModules) {
      const moduleKvData = kvDataByModule.get(moduleSystemId) || [];
      moduleKvData.push(kvData);
      kvDataByModule.set(moduleSystemId, moduleKvData);
    }

    this.logger?.logInfo({
      msg: `Built calibration data: ${kvDataWithModules.length} KvData entries for ${kvDataByModule.size} modules, ${foreignKeyMapper.getKeyVectorCount()} unique KeyVectors`,
      action: 'calibration_data_built',
      component: 'CalibrationDataBuilder',
      tag: 'calibration-building',
      timestamp: new Date(),
    });

    return kvDataByModule;
  }

  /**
   * Internal: Build raw calibration data (systemId = 0, keyVectorSystemId = 0)
   */
  private buildCalibrationData(
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper,
  ): {
    keyVectorInputs: KeyVectorInput[];
    kvDataWithModules: KvDataWithModule[];
  } {
    const result: {
      keyVectorInputs: KeyVectorInput[];
      kvDataWithModules: KvDataWithModule[];
    } = {
      keyVectorInputs: [],
      kvDataWithModules: [],
    };

    // Process voice calibration if available
    const voiceCalChunk = parsedAcdb.getChunk<VoiceCalibrationChunk>(
      PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA,
    );
    if (voiceCalChunk) {
      const voiceResult = this.processVoiceCalibration(
        voiceCalChunk,
        foreignKeyMapper,
        parsedAcdb,
      );
      result.keyVectorInputs.push(...voiceResult.keyVectorInputs);
      result.kvDataWithModules.push(...voiceResult.kvDataWithModules);
    }

    // Process audio calibration if available
    const audioCalChunk = parsedAcdb.getChunk<AudioCalibrationChunk>(
      PARSED_CHUNK_TYPES.AUDIO_CALIBRATION_DATA,
    );
    if (audioCalChunk) {
      const audioResult = this.processAudioCalibration(
        audioCalChunk,
        foreignKeyMapper,
        parsedAcdb,
      );
      result.keyVectorInputs.push(...audioResult.keyVectorInputs);
      result.kvDataWithModules.push(...audioResult.kvDataWithModules);
    }

    return result;
  }

  /**
   * Assign systemIds to KeyVectors and KvData entities.
   * Handles KeyVector deduplication via ForeignKeyMapper.
   * Mutates the KvData objects in place.
   */
  private async assignSystemIds(
    rawKvDataWithModules: KvDataWithModule[],
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
  ): Promise<KvDataWithModule[]> {
    for (const {kvData} of rawKvDataWithModules) {
      // Use valueDefinitionSystemIds directly for KeyVector lookup
      // Convert readonly array to mutable array for ForeignKeyMapper
      const valueSystemIds = [...kvData.valueDefinitionSystemIds];

      let keyVectorSystemId =
        foreignKeyMapper.getKeyVectorSystemId(valueSystemIds);

      // If not found, generate new systemId and store mapping
      if (keyVectorSystemId === undefined) {
        keyVectorSystemId = asSystemId(
          await this.idGenerator.getNextId(fileSystemId),
        );
        foreignKeyMapper.addKeyVectorMapping(valueSystemIds, keyVectorSystemId);
      }

      // Assign keyVectorSystemId
      kvData.systemId = keyVectorSystemId;
    }

    return rawKvDataWithModules;
  }

  /**
   * Process a single calibration data object
   */
  private processCalDataObject(
    calDataObj: VoiceCalDataObject,
    masterKeyIds: number[],
    voiceCalChunk: VoiceCalibrationChunk,
    foreignKeyMapper: ForeignKeyMapper,
    parsedAcdb: ParsedAcdb,
  ): {
    keyVectorInput: KeyVectorInput;
    kvDataWithModules: KvDataWithModule[];
  } | null {
    // Get cached CKV LUT table
    const ckvLutTbl = voiceCalChunk.getCkvLookupTable(
      calDataObj.offsetVoiceCkvLookupTable,
    );
    if (!ckvLutTbl) {
      this.logger?.logWarn({
        msg: `CKV LUT table not found for offset ${calDataObj.offsetVoiceCkvLookupTable}`,
        action: 'missing_ckv_lut_table',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return null;
    }

    // Get cached DEF entry
    const defEntry = voiceCalChunk.getCalDefinitionEntry(
      calDataObj.offsetVoiceCalDefinitionTable,
    );
    if (!defEntry) {
      this.logger?.logWarn({
        msg: `DEF entry not found for offset ${calDataObj.offsetVoiceCalDefinitionTable}`,
        action: 'missing_def_entry',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return null;
    }

    // Get cached DOT entry
    const dotEntry = voiceCalChunk.getCalDataOffsetEntry(
      calDataObj.offsetVoiceCalDefinitionTable,
    );
    if (!dotEntry) {
      this.logger?.logWarn({
        msg: `DOT entry not found for offset ${calDataObj.offsetVoiceCalDefinitionTable}`,
        action: 'missing_dot_entry',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return null;
    }

    // Resolve value system IDs from CKV LUT entries
    const valueSystemIds = this.resolveValueSystemIdsFromCKVLUT(
      ckvLutTbl,
      masterKeyIds,
      foreignKeyMapper,
    );

    if (masterKeyIds.length > 0 && valueSystemIds.length === 0) {
      this.logger?.logWarn({
        msg: 'Failed to resolve value system IDs for voice calibration',
        action: 'value_resolution_failed',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return null;
    }

    const keyVectorInput: KeyVectorInput = {valueSystemIds};

    // Extract module-parameter-payloads
    const moduleParamPayloads = this.extractModuleParameterPayloadsVoice(
      defEntry,
      dotEntry,
      parsedAcdb,
    );

    // Create KvData entities
    const kvDataWithModules = this.createKvDataFromPayloads(
      moduleParamPayloads,
      keyVectorInput,
      foreignKeyMapper,
    );

    return {keyVectorInput, kvDataWithModules};
  }

  /**
   * Process a voice CKV data table
   */
  private processVoiceCkvDataTable(
    ckvDataTbl: VoiceCkvDataTable,
    masterKeyIds: number[],
    voiceCalChunk: VoiceCalibrationChunk,
    foreignKeyMapper: ForeignKeyMapper,
    parsedAcdb: ParsedAcdb,
  ): {
    keyVectorInputs: KeyVectorInput[];
    kvDataWithModules: KvDataWithModule[];
  } {
    const keyVectorInputs: KeyVectorInput[] = [];
    const kvDataWithModules: KvDataWithModule[] = [];

    // Get cached calibration key table
    const calKeyTbl = voiceCalChunk.getCalKeyTable(
      ckvDataTbl.offsetVoiceCalKeyTable,
    );
    if (!calKeyTbl) {
      this.logger?.logWarn({
        msg: `Calibration key table not found for offset ${ckvDataTbl.offsetVoiceCalKeyTable}`,
        action: 'missing_cal_key_table',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return {keyVectorInputs, kvDataWithModules};
    }

    // Process each calibration data object
    for (const calDataObj of ckvDataTbl.calDataObjects) {
      try {
        const result = this.processCalDataObject(
          calDataObj,
          masterKeyIds,
          voiceCalChunk,
          foreignKeyMapper,
          parsedAcdb,
        );
        if (result) {
          keyVectorInputs.push(result.keyVectorInput);
          kvDataWithModules.push(...result.kvDataWithModules);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger?.logWarn({
          msg: `Failed to process calibration data object: ${errorMessage}`,
          action: 'cal_data_obj_processing_failed',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
          timestamp: new Date(),
        });
      }
    }

    return {keyVectorInputs, kvDataWithModules};
  }

  /**
   * Process a subgraph calibration table
   */
  private processSubgraphCalTable(
    sgCalTbl: VoiceSubgraphCalTable,
    voiceCalChunk: VoiceCalibrationChunk,
    foreignKeyMapper: ForeignKeyMapper,
    parsedAcdb: ParsedAcdb,
  ): {
    keyVectorInputs: KeyVectorInput[];
    kvDataWithModules: KvDataWithModule[];
  } {
    const keyVectorInputs: KeyVectorInput[] = [];
    const kvDataWithModules: KvDataWithModule[] = [];

    // Get cached master key table
    const masterKeyTbl = voiceCalChunk.getMasterKeyTable(
      sgCalTbl.offsetVoiceMasterKeyTable,
    );
    if (!masterKeyTbl) {
      this.logger?.logWarn({
        msg: `Master key table not found for offset ${sgCalTbl.offsetVoiceMasterKeyTable}`,
        action: 'missing_master_key_table',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return {keyVectorInputs, kvDataWithModules};
    }

    // Extract key IDs from master key table
    const masterKeyIds = masterKeyTbl.keyInfos.map(info => info.voiceKeyId);

    // Process each CKV data table
    for (const ckvDataTbl of sgCalTbl.voiceCkvDataTables) {
      try {
        const result = this.processVoiceCkvDataTable(
          ckvDataTbl,
          masterKeyIds,
          voiceCalChunk,
          foreignKeyMapper,
          parsedAcdb,
        );
        keyVectorInputs.push(...result.keyVectorInputs);
        kvDataWithModules.push(...result.kvDataWithModules);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger?.logWarn({
          msg: `Failed to process voice CKV data table: ${errorMessage}`,
          action: 'voice_ckv_data_tbl_processing_failed',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
          timestamp: new Date(),
        });
      }
    }

    return {keyVectorInputs, kvDataWithModules};
  }

  /**
   * Process voice calibration data (VCPM_CALDATA chunk)
   */
  private processVoiceCalibration(
    voiceCalChunk: VoiceCalibrationChunk,
    foreignKeyMapper: ForeignKeyMapper,
    parsedAcdb: ParsedAcdb,
  ): {
    keyVectorInputs: KeyVectorInput[];
    kvDataWithModules: KvDataWithModule[];
  } {
    const keyVectorInputs: KeyVectorInput[] = [];
    const kvDataWithModules: KvDataWithModule[] = [];

    // Process each subgraph calibration table
    for (const sgCalTbl of voiceCalChunk.subgraphCalTables) {
      try {
        const result = this.processSubgraphCalTable(
          sgCalTbl,
          voiceCalChunk,
          foreignKeyMapper,
          parsedAcdb,
        );
        keyVectorInputs.push(...result.keyVectorInputs);
        kvDataWithModules.push(...result.kvDataWithModules);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger?.logWarn({
          msg: `Failed to process voice calibration for subgraph ${sgCalTbl.subgraphId}: ${errorMessage}`,
          action: 'voice_calibration_processing_failed',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
          timestamp: new Date(),
        });
      }
    }

    return {keyVectorInputs, kvDataWithModules};
  }

  /**
   * Resolve value system IDs from CKV LUT table entries
   */
  private resolveValueSystemIdsFromCKVLUT(
    ckvLutTbl: VoiceCkvLookupTable,
    masterKeyIds: number[],
    foreignKeyMapper: ForeignKeyMapper,
  ): number[] {
    const valueSystemIds: number[] = [];

    // Process each CKV LUT entry
    for (const ckvEntry of ckvLutTbl.voiceCkvLookupEntries) {
      // Resolve key-value pairs to value system IDs
      const entryValueSystemIds = this.resolveKeyValuePairs(
        masterKeyIds,
        ckvEntry.voiceCalKeyValues,
        foreignKeyMapper,
      );
      valueSystemIds.push(...entryValueSystemIds);
    }

    return valueSystemIds;
  }

  /**
   * Extract module-parameter-payloads from voice calibration DEF and DOT entries
   */
  private extractModuleParameterPayloadsVoice(
    defEntry: VoiceCalDefinitionEntry,
    dotEntry: VoiceCalDataOffsetEntry,
    parsedAcdb: ParsedAcdb,
  ): ModuleParameterPayload[] {
    const payloads: ModuleParameterPayload[] = [];

    // Get datapool chunk
    const datapoolChunk = parsedAcdb.getChunk<DatapoolChunk>(
      PARSED_CHUNK_TYPES.DATAPOOL,
    );
    if (!datapoolChunk) {
      this.logger?.logWarn({
        msg: 'Datapool chunk not found for voice calibration',
        action: 'missing_datapool_chunk',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return payloads;
    }

    // Validate counts match
    if (
      defEntry.moduleInstanceParamPairs.length !==
      dotEntry.offsetsInGlobalDataPool.length
    ) {
      this.logger?.logWarn({
        msg: `Voice DEF and DOT entry count mismatch: ${defEntry.moduleInstanceParamPairs.length} vs ${dotEntry.offsetsInGlobalDataPool.length}`,
        action: 'count_mismatch',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return payloads;
    }

    // Extract payloads
    for (let i = 0; i < defEntry.moduleInstanceParamPairs.length; i++) {
      const {moduleInstanceId, paramId} = defEntry.moduleInstanceParamPairs[i];
      const dataOffset = dotEntry.offsetsInGlobalDataPool[i];

      // Skip VCPM configuration data
      if (moduleInstanceId === VCPM_CFG_INSTANCE_ID) {
        continue;
      }

      // Extract payload from datapool
      const payload = this.extractPayloadFromDatapool(
        datapoolChunk,
        dataOffset,
      );

      if (payload) {
        payloads.push({
          moduleInstanceId: moduleInstanceId,
          parameterId: paramId,
          payload: payload,
        });
      }
    }

    return payloads;
  }

  /**
   * Extract module-parameter-payloads from DEF and DOT entries
   */
  private extractModuleParameterPayloads(
    defEntry: CalDefinitionEntry,
    dotEntry: CalDataOffsetEntry,
    parsedAcdb: ParsedAcdb,
  ): ModuleParameterPayload[] {
    const payloads: ModuleParameterPayload[] = [];

    // Get datapool chunk
    const datapoolChunk = parsedAcdb.getChunk<DatapoolChunk>(
      PARSED_CHUNK_TYPES.DATAPOOL,
    );
    if (!datapoolChunk) {
      this.logger?.logWarn({
        msg: 'Datapool chunk not found for audio calibration',
        action: 'missing_datapool_chunk',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return payloads;
    }

    // Validate counts match
    if (defEntry.calIdEntries.length !== dotEntry.calDataOffsets.length) {
      this.logger?.logWarn({
        msg: `DEF and DOT entry count mismatch: ${defEntry.calIdEntries.length} vs ${dotEntry.calDataOffsets.length}`,
        action: 'count_mismatch',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return payloads;
    }

    // Extract payloads
    for (let i = 0; i < defEntry.calIdEntries.length; i++) {
      const {moduleInstanceId, paramId} = defEntry.calIdEntries[i];
      const dataOffset = dotEntry.calDataOffsets[i];

      // Extract payload from datapool
      const payload = this.extractPayloadFromDatapool(
        datapoolChunk,
        dataOffset,
      );

      if (payload) {
        payloads.push({
          moduleInstanceId: moduleInstanceId,
          parameterId: paramId,
          payload: payload,
        });
      }
    }

    return payloads;
  }

  /**
   * Process audio calibration data (CALIBRATION_SUBGRAPH_LUT chunk)
   */
  private processAudioCalibration(
    audioCalChunk: AudioCalibrationChunk,
    foreignKeyMapper: ForeignKeyMapper,
    parsedAcdb: ParsedAcdb,
  ): {
    keyVectorInputs: KeyVectorInput[];
    kvDataWithModules: KvDataWithModule[];
  } {
    const keyVectorInputs: KeyVectorInput[] = [];
    const kvDataWithModules: KvDataWithModule[] = [];

    // Process each subgraph LUT entry
    for (const sgLutEntry of audioCalChunk.subgraphLookupEntries) {
      try {
        const result = this.processSubgraphCalKeyTableEntries(
          sgLutEntry.calKeyTableEntries,
          audioCalChunk,
          foreignKeyMapper,
          parsedAcdb,
        );
        keyVectorInputs.push(...result.keyVectorInputs);
        kvDataWithModules.push(...result.kvDataWithModules);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger?.logWarn({
          msg: `Failed to process audio calibration for subgraph ${sgLutEntry.subgraphId}: ${errorMessage}`,
          action: 'audio_calibration_processing_failed',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
          timestamp: new Date(),
        });
      }
    }

    return {keyVectorInputs, kvDataWithModules};
  }

  /**
   * Process calibration key table entries for a subgraph
   */
  private processSubgraphCalKeyTableEntries(
    calKeyTableEntries: Array<{
      offsetCalKeyTable: number;
      offsetCalLookupTable: number;
    }>,
    audioCalChunk: AudioCalibrationChunk,
    foreignKeyMapper: ForeignKeyMapper,
    parsedAcdb: ParsedAcdb,
  ): {
    keyVectorInputs: KeyVectorInput[];
    kvDataWithModules: KvDataWithModule[];
  } {
    const keyVectorInputs: KeyVectorInput[] = [];
    const kvDataWithModules: KvDataWithModule[] = [];

    for (const calKeyTableEntry of calKeyTableEntries) {
      // Get cached key table
      const keyIds = audioCalChunk.getCalKeyTable(
        calKeyTableEntry.offsetCalKeyTable,
      );
      if (!keyIds) {
        this.logger?.logWarn({
          msg: `Key table not found for offset ${calKeyTableEntry.offsetCalKeyTable}`,
          action: 'missing_key_table',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
          timestamp: new Date(),
        });
        continue;
      }

      // Get cached CKV LUT table
      const ckvLutTbl = audioCalChunk.getCkvLookupTable(
        calKeyTableEntry.offsetCalLookupTable,
      );
      if (!ckvLutTbl) {
        this.logger?.logWarn({
          msg: `CKV LUT table not found for offset ${calKeyTableEntry.offsetCalLookupTable}`,
          action: 'missing_ckv_lut_table',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
          timestamp: new Date(),
        });
        continue;
      }

      // Process each CKV LUT entry
      const result = this.processCkvLookupEntries(
        ckvLutTbl.ckvLookupEntries,
        keyIds,
        audioCalChunk,
        foreignKeyMapper,
        parsedAcdb,
      );
      keyVectorInputs.push(...result.keyVectorInputs);
      kvDataWithModules.push(...result.kvDataWithModules);
    }

    return {keyVectorInputs, kvDataWithModules};
  }

  /**
   * Process CKV LUT entries
   */
  private processCkvLookupEntries(
    ckvLookupEntries: Array<{
      calKeyValues: number[];
      offsetCalDefinition: number;
      offsetCalDataOffset: number;
      offsetDOT2: number;
    }>,
    keyIds: number[],
    audioCalChunk: AudioCalibrationChunk,
    foreignKeyMapper: ForeignKeyMapper,
    parsedAcdb: ParsedAcdb,
  ): {
    keyVectorInputs: KeyVectorInput[];
    kvDataWithModules: KvDataWithModule[];
  } {
    const keyVectorInputs: KeyVectorInput[] = [];
    const kvDataWithModules: KvDataWithModule[] = [];

    for (const ckvEntry of ckvLookupEntries) {
      // Resolve value system IDs from key IDs and cal key values
      const valueSystemIds = this.resolveValueSystemIds(
        keyIds,
        ckvEntry.calKeyValues,
        foreignKeyMapper,
      );

      if (keyIds.length > 0 && valueSystemIds.length === 0) {
        this.logger?.logWarn({
          msg: 'Failed to resolve value system IDs for audio calibration',
          action: 'value_resolution_failed',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
          timestamp: new Date(),
        });
        continue;
      }

      const keyVectorInput: KeyVectorInput = {valueSystemIds};
      keyVectorInputs.push(keyVectorInput);

      // Get cached DEF and DOT entries
      const defEntry = audioCalChunk.getCalDefinitionEntry(
        ckvEntry.offsetCalDefinition,
      );
      const dotEntry = audioCalChunk.getCalDataOffsetEntry(
        ckvEntry.offsetCalDataOffset,
      );

      if (!defEntry || !dotEntry) {
        this.logger?.logWarn({
          msg: `Missing DEF or DOT entry for offsets: DEF=${ckvEntry.offsetCalDefinition}, DOT=${ckvEntry.offsetCalDataOffset}`,
          action: 'missing_def_or_dot_entry',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
          timestamp: new Date(),
        });
        continue;
      }

      // Extract module-parameter-payloads
      const moduleParamPayloads = this.extractModuleParameterPayloads(
        defEntry,
        dotEntry,
        parsedAcdb,
      );

      // Create KvData entities
      const entryKvDataWithModules = this.createKvDataFromPayloads(
        moduleParamPayloads,
        keyVectorInput,
        foreignKeyMapper,
      );
      kvDataWithModules.push(...entryKvDataWithModules);
    }

    return {keyVectorInputs, kvDataWithModules};
  }

  /**
   * Extract payload from datapool at specified offset
   */
  private extractPayloadFromDatapool(
    datapoolChunk: DatapoolChunk,
    dataOffset: number,
  ): Uint8Array | null {
    const data = datapoolChunk.getDataAtOffset(dataOffset);
    if (!data) {
      this.logger?.logWarn({
        msg: `No data found at datapool offset ${dataOffset}`,
        action: 'datapool_offset_not_found',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
        timestamp: new Date(),
      });
      return null;
    }

    return data;
  }

  /**
   * Resolve key IDs and value IDs to value system IDs using foreign key mapper
   */
  private resolveValueSystemIds(
    keyIds: number[],
    valueIds: number[],
    foreignKeyMapper: ForeignKeyMapper,
  ): number[] {
    // If no value IDs provided, resolve keys to their default values
    if (valueIds.length === 0) {
      return this.resolveDefaultValueSystemIds(keyIds, foreignKeyMapper);
    }

    // Resolve each key-value pair
    return this.resolveKeyValuePairs(keyIds, valueIds, foreignKeyMapper);
  }

  /**
   * Resolve default value system IDs when no value IDs are provided
   */
  private resolveDefaultValueSystemIds(
    keyIds: number[],
    foreignKeyMapper: ForeignKeyMapper,
  ): number[] {
    const valueSystemIds: number[] = [];

    for (const keyId of keyIds) {
      const keySystemId = foreignKeyMapper.getKeySystemId(asNaturalId(keyId));
      if (!keySystemId) {
        continue;
      }

      // Get first value for this key (placeholder logic)
      const valueMappings = foreignKeyMapper.getValueMappingsForKey(
        asNaturalId(keyId),
      );
      if (valueMappings && valueMappings.size > 0) {
        const firstValueSystemId = [...valueMappings.values()][0];
        valueSystemIds.push(firstValueSystemId);
      }
    }

    return valueSystemIds;
  }

  /**
   * Resolve key-value pairs to value system IDs
   */
  private resolveKeyValuePairs(
    keyIds: number[],
    valueIds: number[],
    foreignKeyMapper: ForeignKeyMapper,
  ): number[] {
    const valueSystemIds: number[] = [];

    for (let i = 0; i < Math.min(keyIds.length, valueIds.length); i++) {
      const valueSystemId = foreignKeyMapper.getValueSystemId(
        asNaturalId(keyIds[i]),
        asNaturalId(valueIds[i]),
      );

      if (valueSystemId === undefined) {
        this.logger?.logWarn({
          msg: `Failed to resolve value system ID for keyId=${keyIds[i]}, valueId=${valueIds[i]}`,
          action: 'value_resolution_failed',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
          timestamp: new Date(),
        });
      } else {
        valueSystemIds.push(valueSystemId);
      }
    }

    return valueSystemIds;
  }

  /**
   * Create KvData entities from module-parameter-payloads
   */
  private createKvDataFromPayloads(
    payloads: ModuleParameterPayload[],
    keyVectorInput: KeyVectorInput,
    foreignKeyMapper: ForeignKeyMapper,
  ): KvDataWithModule[] {
    const kvDataWithModules: KvDataWithModule[] = [];

    // Group payloads by module instance
    const payloadsByModule = new Map<number, ModuleParameterPayload[]>();
    for (const payload of payloads) {
      // Skip VCPM configuration data
      if (payload.moduleInstanceId === VCPM_CFG_INSTANCE_ID) {
        continue;
      }

      if (!payloadsByModule.has(payload.moduleInstanceId)) {
        payloadsByModule.set(payload.moduleInstanceId, []);
      }
      payloadsByModule.get(payload.moduleInstanceId)!.push(payload);
    }

    // Create KvData for each module
    for (const [moduleInstanceId, modulePayloads] of payloadsByModule) {
      const moduleSystemId = foreignKeyMapper.getSpfModuleSystemId(
        asNaturalId(moduleInstanceId),
      );
      if (!moduleSystemId) {
        this.logger?.logWarn({
          msg: `Failed to resolve module system ID for instance ${moduleInstanceId}`,
          action: 'module_resolution_failed',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
          timestamp: new Date(),
        });
        continue;
      }

      // Create KvData entity (systemId and keyVectorSystemId will be assigned later)
      const kvData = new KvData({
        systemId: 0, // Will be assigned later
        valueDefinitionSystemIds: keyVectorInput.valueSystemIds,
        uiPersistence: null, // Empty for now
      });

      // Add parameter payloads as ModuleParameterData
      for (const payload of modulePayloads) {
        // TODO: Implement parameter resolution
        const parameterSystemId = foreignKeyMapper.getParamDefinitionSystemId(
          moduleSystemId,
          asNaturalId(payload.parameterId),
        );

        if (parameterSystemId === undefined) {
          this.logger?.logWarn({
            msg: `Failed to resolve parameter system ID for module ${moduleSystemId}, parameter ${payload.parameterId}`,
            action: 'parameter_resolution_failed',
            component: 'CalibrationDataBuilder',
            tag: 'calibration-building',
            timestamp: new Date(),
          });
          continue;
        }

        const moduleParamData = new ModuleParameterData(
          parameterSystemId,
          payload.payload,
        );
        kvData.addParameterPayload(moduleParamData);
      }

      kvDataWithModules.push({kvData, moduleSystemId});
    }

    return kvDataWithModules;
  }
}
