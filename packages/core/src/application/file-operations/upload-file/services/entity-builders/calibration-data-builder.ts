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
  type SystemId,
} from '../../../../../shared/types/branded-ids.js';
import type {KeyVectorInput} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {UiMetadata} from '../../../shared/awsp-serializers/v1/ui-metadata/index.js';
import {parseKeyValueString} from '../../../shared/awsp-serializers/v1/ui-metadata/index.js';
import {PARSED_CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import {SPF_VCPM_MODULE_ID} from '../../../shared/constants/spf-ids.js';
import type {
  VoiceCalibrationChunk,
  VoiceSubgraphCalTable,
  VoiceCkvDataTable,
  VoiceCalDataObject,
  VoiceCkvLookupTable,
} from '../../../shared/acdb-chunks/voice-calibration-chunk.js';
import type {AudioCalibrationChunk} from '../../../shared/acdb-chunks/audio-calibration-chunk.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import {VcpmInstance} from '../../../../../domain/entities/usecase-data/subgraph/entities/vcpm-module-instance.js';
import type {Subgraph} from '../../../../../domain/entities/usecase-data/subgraph/subgraph.js';

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

/** Normalised shape for DEF+DOT data — shared across voice and audio extract paths */
interface CalDefAndOffset {
  pairs: Array<{moduleInstanceId: number; paramId: number}>;
  offsets: number[];
}

/**
 * Builder for creating calibration data (KvData) entities from parsed ACDB chunks.
 * Handles voice SPF calibration, voice VCPM calibration, and audio calibration.
 * Uses ForeignKeyMapper for KeyVector deduplication.
 */
export class CalibrationDataBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly logger?: Logger,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // SPF Calibration path (voice + audio → KvData grouped by SPF module)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Build calibration data with KeyVector deduplication.
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
      msg: 'calibration_data_built',
      description: `Built calibration data: ${kvDataWithModules.length} KvData entries for ${kvDataByModule.size} modules`,
      component: 'CalibrationDataBuilder',
      tag: 'calibration-building',
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
    fileSystemId: number,
  ): Promise<KvDataWithModule[]> {
    for (const {kvData} of rawKvDataWithModules) {
      // Assign keyVectorSystemId
      kvData.systemId = asSystemId(
        await this.idGenerator.getNextId(fileSystemId),
      );
    }

    return rawKvDataWithModules;
  }

  /**
   * Process a single calibration data object
   */
  private processCalDataObject(
    calDataObj: VoiceCalDataObject,
    keyIds: number[],
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
        msg: 'missing_ckv_lut_table',
        description: `CKV LUT table not found for offset ${calDataObj.offsetVoiceCkvLookupTable}`,
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
      });
      return null;
    }

    // Get cached DEF entry
    const defEntry = voiceCalChunk.getCalDefinitionEntry(
      calDataObj.offsetVoiceCalDefinitionTable,
    );
    if (!defEntry) {
      this.logger?.logWarn({
        msg: 'missing_def_entry',
        description: `DEF entry not found for offset ${calDataObj.offsetVoiceCalDefinitionTable}`,
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
      });
      return null;
    }

    // Get cached DOT entry
    const dotEntry = voiceCalChunk.getCalDataOffsetEntry(
      calDataObj.offsetVoiceCalDefinitionTable,
    );
    if (!dotEntry) {
      this.logger?.logWarn({
        msg: 'missing_dot_entry',
        description: `DOT entry not found for offset ${calDataObj.offsetVoiceCalDefinitionTable}`,
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
      });
      return null;
    }

    // Resolve value system IDs from CKV LUT entries
    const valueSystemIds = this.resolveValueSystemIdsFromCKVLUT(
      ckvLutTbl,
      keyIds,
      foreignKeyMapper,
    );

    if (keyIds.length > 0 && valueSystemIds.length === 0) {
      this.logger?.logWarn({
        msg: 'value_resolution_failed',
        description: 'Failed to resolve value system IDs for voice calibration',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
      });
      return null;
    }

    const keyVectorInput: KeyVectorInput = {valueSystemIds};

    const moduleParamPayloads = this.extractModuleParameterPayloads(
      {
        pairs: defEntry.moduleInstanceParamPairs,
        offsets: dotEntry.offsetsInGlobalDataPool,
      },
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
        msg: 'missing_cal_key_table',
        description: `Calibration key table not found for offset ${ckvDataTbl.offsetVoiceCalKeyTable}`,
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
      });
      return {keyVectorInputs, kvDataWithModules};
    }

    // Extract key IDs from calibration key table
    const keyIds = calKeyTbl.voiceKeyIds;

    // Process each calibration data object
    for (const calDataObj of ckvDataTbl.calDataObjects) {
      try {
        const result = this.processCalDataObject(
          calDataObj,
          keyIds,
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
          msg: 'cal_data_obj_processing_failed',
          description: `Failed to process calibration data object: ${errorMessage}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
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

    // Process each CKV data table
    for (const ckvDataTbl of sgCalTbl.voiceCkvDataTables) {
      try {
        const result = this.processVoiceCkvDataTable(
          ckvDataTbl,
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
          msg: 'voice_ckv_data_tbl_processing_failed',
          description: `Failed to process voice CKV data table: ${errorMessage}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
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
          msg: 'voice_calibration_processing_failed',
          description: `Failed to process voice calibration for subgraph ${sgCalTbl.subgraphId}: ${errorMessage}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
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
    keyIds: number[],
    foreignKeyMapper: ForeignKeyMapper,
  ): number[] {
    const valueSystemIds: number[] = [];

    // Process each CKV LUT entry
    for (const ckvEntry of ckvLutTbl.voiceCkvLookupEntries) {
      // Resolve key-value pairs to value system IDs
      const entryValueSystemIds = this.resolveKeyValuePairs(
        keyIds,
        ckvEntry.voiceCalKeyValues,
        foreignKeyMapper,
      );
      valueSystemIds.push(...entryValueSystemIds);
    }
    return valueSystemIds;
  }

  /**
   * Extract module-parameter-payloads from a normalised DEF+DOT pair.
   * Shared by the voice-SPF and audio-SPF paths.
   * Skips VCPM_CFG_INSTANCE_ID entries (no-op for audio — that ID never appears).
   */
  private extractModuleParameterPayloads(
    defAndOffset: CalDefAndOffset,
    parsedAcdb: ParsedAcdb,
  ): ModuleParameterPayload[] {
    const payloads: ModuleParameterPayload[] = [];

    const datapoolChunk = parsedAcdb.getChunk<DatapoolChunk>(
      PARSED_CHUNK_TYPES.DATAPOOL,
    );
    if (!datapoolChunk) {
      this.logger?.logWarn({
        msg: 'missing_datapool_chunk',
        description: 'Datapool chunk not found for calibration',
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
      });
      return payloads;
    }

    if (defAndOffset.pairs.length !== defAndOffset.offsets.length) {
      this.logger?.logWarn({
        msg: 'count_mismatch',
        description: `DEF and DOT entry count mismatch: ${defAndOffset.pairs.length} vs ${defAndOffset.offsets.length}`,
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
      });
      return payloads;
    }

    for (let i = 0; i < defAndOffset.pairs.length; i++) {
      const {moduleInstanceId, paramId} = defAndOffset.pairs[i];
      const dataOffset = defAndOffset.offsets[i];

      if (moduleInstanceId === SPF_VCPM_MODULE_ID) {
        continue;
      }

      const payload = this.extractPayloadFromDatapool(
        datapoolChunk,
        dataOffset,
      );
      if (payload) {
        payloads.push({moduleInstanceId, parameterId: paramId, payload});
      }
    }

    return payloads;
  }

  // ─── audio SPF traversal ────────────────────────────────────────────────────

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
          msg: 'audio_calibration_processing_failed',
          description: `Failed to process audio calibration for subgraph ${sgLutEntry.subgraphId}: ${errorMessage}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
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
          msg: 'missing_key_table',
          description: `Key table not found for offset ${calKeyTableEntry.offsetCalKeyTable}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
        });
        continue;
      }

      // Get cached CKV LUT table
      const ckvLutTbl = audioCalChunk.getCkvLookupTable(
        calKeyTableEntry.offsetCalLookupTable,
      );
      if (!ckvLutTbl) {
        this.logger?.logWarn({
          msg: 'missing_ckv_lut_table',
          description: `CKV LUT table not found for offset ${calKeyTableEntry.offsetCalLookupTable}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
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
          msg: 'value_resolution_failed',
          description:
            'Failed to resolve value system IDs for audio calibration',
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
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
          msg: 'missing_def_or_dot_entry',
          description: `Missing DEF or DOT entry for offsets: DEF=${ckvEntry.offsetCalDefinition}, DOT=${ckvEntry.offsetCalDataOffset}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
        });
        continue;
      }

      const moduleParamPayloads = this.extractModuleParameterPayloads(
        {
          pairs: defEntry.calIdEntries,
          offsets: dotEntry.calDataOffsets,
        },
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

  // ────────────────────────────────────────────────────────────────────────────
  // VCPM Calibration path (voice → VcpmInstance attached to Subgraph)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Builds VcpmInstance entities from the VCPM_CALDATA chunk and attaches them
   * to the matching Subgraph entities by subgraphId.
   */
  async attachVcpmDataToSubgraphs(
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper,
    subgraphs: Subgraph[],
    fileSystemId: number,
  ): Promise<void> {
    const voiceCalChunk = parsedAcdb.getChunk<VoiceCalibrationChunk>(
      PARSED_CHUNK_TYPES.VOICE_CALIBRATION_DATA,
    );

    if (!voiceCalChunk || voiceCalChunk.subgraphCalTables.length === 0) {
      return;
    }

    const datapoolChunk = parsedAcdb.getChunk<DatapoolChunk>(
      PARSED_CHUNK_TYPES.DATAPOOL,
    );

    if (!datapoolChunk) {
      this.logger?.logWarn({
        msg: 'vcpm_missing_datapool',
        description: 'Datapool chunk not found — skipping VCPM data attachment',
        component: 'CalibrationDataBuilder',
        tag: 'vcpm-building',
      });
      return;
    }

    const vcpmDefinitionSystemId =
      foreignKeyMapper.getVcpmModuleDefinitionSystemId(
        asNaturalId(voiceCalChunk.voiceModuleInstanceId),
      );

    if (vcpmDefinitionSystemId === undefined) {
      this.logger?.logWarn({
        msg: 'vcpm_definition_not_found',
        description: `VCPM module definition not found for voiceModuleInstanceId=${voiceCalChunk.voiceModuleInstanceId} — skipping VCPM data attachment`,
        component: 'CalibrationDataBuilder',
        tag: 'vcpm-building',
      });
      return;
    }

    const subgraphByNaturalId = new Map(subgraphs.map(s => [s.subgraphId, s]));

    for (const sgCalTbl of voiceCalChunk.subgraphCalTables) {
      const subgraph = subgraphByNaturalId.get(sgCalTbl.subgraphId);
      if (!subgraph) {
        this.logger?.logWarn({
          msg: 'vcpm_subgraph_not_found',
          description: `Subgraph not found for subgraphId=${sgCalTbl.subgraphId} — skipping VCPM data for this subgraph`,
          component: 'CalibrationDataBuilder',
          tag: 'vcpm-building',
        });
        continue;
      }

      try {
        const vcpmInstance = await this.buildVcpmInstance(
          sgCalTbl,
          subgraph.systemId,
          vcpmDefinitionSystemId,
          voiceCalChunk,
          datapoolChunk,
          foreignKeyMapper,
          fileSystemId,
        );
        subgraph.setVcpmDataInstance(vcpmInstance);
      } catch (error) {
        this.logger?.logWarn({
          msg: 'vcpm_instance_build_failed',
          description: `Failed to build VCPM instance for subgraphId=${sgCalTbl.subgraphId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          component: 'CalibrationDataBuilder',
          tag: 'vcpm-building',
        });
      }
    }

    this.logger?.logInfo({
      msg: 'vcpm_data_attached',
      description: `Attached VCPM data to ${subgraphs.filter(s => s.vcpmDataInstance !== null).length} subgraphs`,
      component: 'CalibrationDataBuilder',
      tag: 'vcpm-building',
    });
  }

  private async buildVcpmInstance(
    sgCalTbl: VoiceSubgraphCalTable,
    subgraphSystemId: number,
    vcpmDefinitionSystemId: number,
    voiceCalChunk: VoiceCalibrationChunk,
    datapoolChunk: DatapoolChunk,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
  ): Promise<VcpmInstance> {
    const instanceSystemId = await this.idGenerator.getNextId(fileSystemId);

    const vcpmInstance = new VcpmInstance({
      systemId: instanceSystemId,
      subgraphSystemId,
      vcpmDefinitionId: vcpmDefinitionSystemId,
    });

    const masterKeyTbl = voiceCalChunk.getMasterKeyTable(
      sgCalTbl.offsetVoiceMasterKeyTable,
    );
    const masterKeyIds = masterKeyTbl?.keyInfos.map(k => k.voiceKeyId) ?? [];

    for (const ckvDataTbl of sgCalTbl.voiceCkvDataTables) {
      await this.processVcpmCkvDataTable(
        ckvDataTbl,
        masterKeyIds,
        voiceCalChunk,
        datapoolChunk,
        vcpmInstance,
        vcpmDefinitionSystemId,
        foreignKeyMapper,
        fileSystemId,
      );
    }

    return vcpmInstance;
  }

  private async processVcpmCkvDataTable(
    ckvDataTbl: VoiceCkvDataTable,
    masterKeyIds: number[],
    voiceCalChunk: VoiceCalibrationChunk,
    datapoolChunk: DatapoolChunk,
    vcpmInstance: VcpmInstance,
    vcpmDefinitionSystemId: number,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
  ): Promise<void> {
    const calKeyTbl = voiceCalChunk.getCalKeyTable(
      ckvDataTbl.offsetVoiceCalKeyTable,
    );
    if (!calKeyTbl) {
      return;
    }

    for (const calDataObj of ckvDataTbl.calDataObjects) {
      try {
        await this.processVcpmCalDataObject(
          calDataObj,
          masterKeyIds,
          voiceCalChunk,
          datapoolChunk,
          vcpmInstance,
          vcpmDefinitionSystemId,
          foreignKeyMapper,
          fileSystemId,
        );
      } catch (error) {
        this.logger?.logWarn({
          msg: 'vcpm_cal_data_obj_failed',
          description: `Failed to process VCPM cal data object: ${error instanceof Error ? error.message : 'Unknown error'}`,
          component: 'CalibrationDataBuilder',
          tag: 'vcpm-building',
        });
      }
    }
  }

  private async processVcpmCalDataObject(
    calDataObj: VoiceCalDataObject,
    masterKeyIds: number[],
    voiceCalChunk: VoiceCalibrationChunk,
    datapoolChunk: DatapoolChunk,
    vcpmInstance: VcpmInstance,
    vcpmDefinitionSystemId: number,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
  ): Promise<void> {
    const ckvLutTbl = voiceCalChunk.getCkvLookupTable(
      calDataObj.offsetVoiceCkvLookupTable,
    );
    const defEntry = voiceCalChunk.getCalDefinitionEntry(
      calDataObj.offsetVoiceCalDefinitionTable,
    );
    const dotEntry = voiceCalChunk.getCalDataOffsetEntry(
      calDataObj.offsetVoiceCalDefinitionTable,
    );

    if (!ckvLutTbl || !defEntry || !dotEntry) {
      return;
    }

    if (
      defEntry.moduleInstanceParamPairs.length !==
      dotEntry.offsetsInGlobalDataPool.length
    ) {
      return;
    }

    // Resolve parameter payloads once — shared by all CKV entries for this CalDataObj
    const paramPayloads = this.resolveVcpmParamPayloads(
      defEntry,
      dotEntry,
      datapoolChunk,
      vcpmDefinitionSystemId,
      foreignKeyMapper,
    );

    if (paramPayloads.length === 0) return;

    // One KvData per CKV LUT entry (each entry has its own key-value combination)
    for (const ckvEntry of ckvLutTbl.voiceCkvLookupEntries) {
      const valueDefinitionSystemIds: number[] = [];
      for (
        let i = 0;
        i < Math.min(masterKeyIds.length, ckvEntry.voiceCalKeyValues.length);
        i++
      ) {
        const valueSystemId = foreignKeyMapper.getValueSystemId(
          asNaturalId(masterKeyIds[i]),
          asNaturalId(ckvEntry.voiceCalKeyValues[i]),
        );
        if (valueSystemId !== undefined) {
          valueDefinitionSystemIds.push(valueSystemId);
        }
      }

      const kvDataSystemId = await this.idGenerator.getNextId(fileSystemId);
      const kvData = new KvData({
        systemId: kvDataSystemId,
        valueDefinitionSystemIds,
        uiPersistence: null,
      });

      for (const {paramSystemId, payload} of paramPayloads) {
        kvData.addParameterPayload(
          new ModuleParameterData(paramSystemId, payload),
        );
      }

      vcpmInstance.addCkv(kvData);
    }
  }

  private resolveVcpmParamPayloads(
    defEntry: {
      moduleInstanceParamPairs: Array<{
        moduleInstanceId: number;
        paramId: number;
      }>;
    },
    dotEntry: {offsetsInGlobalDataPool: number[]},
    datapoolChunk: DatapoolChunk,
    vcpmDefinitionSystemId: number,
    foreignKeyMapper: ForeignKeyMapper,
  ): Array<{paramSystemId: SystemId; payload: Uint8Array}> {
    const results: Array<{paramSystemId: SystemId; payload: Uint8Array}> = [];

    for (const [
      i,
      {moduleInstanceId, paramId},
    ] of defEntry.moduleInstanceParamPairs.entries()) {
      const dataOffset = dotEntry.offsetsInGlobalDataPool[i];

      if (moduleInstanceId !== SPF_VCPM_MODULE_ID) {
        continue;
      }

      const paramSystemId = foreignKeyMapper.getVcpmParamDefinitionSystemId(
        asSystemId(vcpmDefinitionSystemId),
        asNaturalId(paramId),
      );

      if (paramSystemId === undefined) {
        this.logger?.logWarn({
          msg: 'vcpm_param_not_found',
          description: `VCPM param definition not found for paramId=${paramId}`,
          component: 'CalibrationDataBuilder',
          tag: 'vcpm-building',
        });
        continue;
      }

      const payload = datapoolChunk.getDataAtOffset(dataOffset);
      if (!payload) {
        continue;
      }

      results.push({paramSystemId, payload});
    }

    return results;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Shared helpers
  // ────────────────────────────────────────────────────────────────────────────

  private extractPayloadFromDatapool(
    datapoolChunk: DatapoolChunk,
    dataOffset: number,
  ): Uint8Array | null {
    const data = datapoolChunk.getDataAtOffset(dataOffset);
    if (!data) {
      this.logger?.logWarn({
        msg: 'datapool_offset_not_found',
        description: `No data found at datapool offset ${dataOffset}`,
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
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
          msg: 'value_resolution_failed',
          description: `Failed to resolve value system ID for keyId=${keyIds[i]}, valueId=${valueIds[i]}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
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
    const payloadsByModule = this.groupPayloadsByModule(payloads);

    // Create KvData for each module
    for (const [moduleInstanceId, modulePayloads] of payloadsByModule) {
      const kvDataWithModule = this.createKvDataForModule(
        moduleInstanceId,
        modulePayloads,
        keyVectorInput,
        foreignKeyMapper,
      );
      if (kvDataWithModule) {
        kvDataWithModules.push(kvDataWithModule);
      }
    }

    return kvDataWithModules;
  }

  /**
   * Group payloads by module instance ID
   */
  private groupPayloadsByModule(
    payloads: ModuleParameterPayload[],
  ): Map<number, ModuleParameterPayload[]> {
    const payloadsByModule = new Map<number, ModuleParameterPayload[]>();
    for (const payload of payloads) {
      // Skip APM config and VCPM module housekeeping entries
      if (payload.moduleInstanceId === SPF_VCPM_MODULE_ID) {
        continue;
      }

      if (!payloadsByModule.has(payload.moduleInstanceId)) {
        payloadsByModule.set(payload.moduleInstanceId, []);
      }
      payloadsByModule.get(payload.moduleInstanceId)!.push(payload);
    }
    return payloadsByModule;
  }

  /**
   * Create KvData for a single module
   */
  private createKvDataForModule(
    moduleInstanceId: number,
    modulePayloads: ModuleParameterPayload[],
    keyVectorInput: KeyVectorInput,
    foreignKeyMapper: ForeignKeyMapper,
  ): KvDataWithModule | null {
    const moduleSystemId = foreignKeyMapper.getSpfModuleSystemId(
      asNaturalId(moduleInstanceId),
    );
    if (!moduleSystemId) {
      this.logger?.logWarn({
        msg: 'module_resolution_failed',
        description: `Failed to resolve module system ID for instance ${moduleInstanceId}`,
        component: 'CalibrationDataBuilder',
        tag: 'calibration-building',
      });
      return null;
    }

    // Create KvData entity (systemId will be assigned later)
    const kvData = new KvData({
      systemId: asSystemId(0), // Will be assigned later
      valueDefinitionSystemIds: keyVectorInput.valueSystemIds,
      uiPersistence: null, // Empty for now
    });

    // Add parameter payloads as ModuleParameterData
    this.addParameterPayloadsToKvData(
      kvData,
      modulePayloads,
      moduleInstanceId,
      moduleSystemId,
      foreignKeyMapper,
    );

    return {kvData, moduleSystemId};
  }

  /**
   * Add parameter payloads to KvData entity
   */
  private addParameterPayloadsToKvData(
    kvData: KvData,
    modulePayloads: ModuleParameterPayload[],
    moduleInstanceId: number,
    moduleSystemId: number,
    foreignKeyMapper: ForeignKeyMapper,
  ): void {
    for (const payload of modulePayloads) {
      const moduleDefinitionSystemId =
        foreignKeyMapper.getModuleDefinitionSystemIdFromInstance(
          asSystemId(moduleSystemId),
        );

      if (!moduleDefinitionSystemId) {
        this.logger?.logWarn({
          msg: 'module_definition_resolution_failed',
          description: `Failed to resolve module definition system ID for instance ${moduleInstanceId} (systemId: ${moduleSystemId})`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
        });
        continue;
      }

      const parameterSystemId = foreignKeyMapper.getParamDefinitionSystemId(
        moduleDefinitionSystemId,
        asNaturalId(payload.parameterId),
      );

      if (parameterSystemId === undefined) {
        this.logger?.logWarn({
          msg: 'parameter_resolution_failed',
          description: `Failed to resolve parameter system ID for param ${payload.parameterId} in module definition ${moduleDefinitionSystemId}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
        });
        continue;
      }

      const moduleParamData = new ModuleParameterData(
        parameterSystemId,
        payload.payload,
      );
      kvData.addParameterPayload(moduleParamData);
    }
  }

  applyUiMetadataToCkvs(
    ckvList: KvData[],
    instanceId: number,
    uiMetadata: UiMetadata,
    foreignKeyMapper: ForeignKeyMapper,
  ): void {
    const moduleEntry = uiMetadata.modules.find(
      m => m.instanceId === instanceId,
    );
    if (!moduleEntry || moduleEntry.calViewUiPersistences.length === 0) return;

    const payloadByUuid = new Map<string, Uint8Array>(
      uiMetadata.payloadMap.map(p => [
        p.id,
        Uint8Array.from(Buffer.from(p.data, 'base64')),
      ]),
    );

    for (const persistence of moduleEntry.calViewUiPersistences) {
      const payload = payloadByUuid.get(persistence.payloadId);
      if (!payload) {
        this.logger?.logError({
          msg: 'ckv_payload_not_found',
          description: `payloadId ${persistence.payloadId} not found in payloadMap for module 0x${instanceId.toString(16)}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
        });
        continue;
      }

      let targetValueSystemIds: number[];
      if (persistence.calKeyValue) {
        const pairs = parseKeyValueString(persistence.calKeyValue);
        targetValueSystemIds = pairs
          .map(({keyId, valueId}) =>
            foreignKeyMapper.getValueSystemId(
              asNaturalId(keyId),
              asNaturalId(valueId),
            ),
          )
          .filter(id => id !== undefined)
          .map(id => id as number)
          .sort((a, b) => a - b);
      } else {
        targetValueSystemIds = [];
      }

      const match = ckvList.find(ckv => {
        const sorted = [...ckv.valueDefinitionSystemIds].sort((a, b) => a - b);
        if (sorted.length !== targetValueSystemIds.length) return false;
        return sorted.every((v, i) => v === targetValueSystemIds[i]);
      });

      if (match) {
        match.uiPersistence = payload;
      } else {
        this.logger?.logError({
          msg: 'ckv_match_not_found',
          description: `No matching CKV for module 0x${instanceId.toString(16)} payloadId=${persistence.payloadId} calKeyValue=${persistence.calKeyValue ?? '(zero-CKV)'}`,
          component: 'CalibrationDataBuilder',
          tag: 'calibration-building',
        });
      }
    }
  }
}
