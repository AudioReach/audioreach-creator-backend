/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {ParsedAcdb} from '../../models/parsed-acdb.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import {DkvData} from '../../../../../domain/entities/driver-module-data/dkv-data.js';
import {ModuleParameterData} from '../../../../../domain/entities/common/value-objects/module-parameter-data.js';
import {
  asSystemId,
  asNaturalId,
} from '../../../../../shared/types/branded-ids.js';
import type {KeyVectorInput} from '../../../../../domain/entities/usecase-data/usecase/usecase.js';
import {PARSED_CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import type {
  DriverCalibrationChunk,
  ModuleLookupEntry,
  CalDefinitionEntry,
  CalDataOffsetEntry,
} from '../../../shared/acdb-chunks/driver-calibration-chunk.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';

/**
 * Intermediate structure for module-parameter-payload extraction
 * Stores system IDs (not natural IDs) for database insertion
 */
interface ModuleParameterPayload {
  moduleDefinitionSystemId: number;
  parameterDefinitionSystemId: number;
  payload: Uint8Array;
}

/**
 * Intermediate structure to track DkvData with its associated module during building
 */
interface DkvDataWithModule {
  dkvData: DkvData;
  moduleSystemId: number;
}

/**
 * Builder for creating driver calibration data (DkvData) entities from parsed ACDB chunks.
 * Handles driver calibration data processing.
 * Uses ForeignKeyMapper for KeyVector deduplication.
 */
export class DriverCalibrationDataBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly logger?: Logger,
  ) {}

  /**
   * Main API: Build driver calibration data with KeyVector deduplication.
   * Returns DkvData entities grouped by module systemId, ready for attachment to DriverModules.
   */
  async buildCalibrationDataByModule(
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
  ): Promise<Map<number, DkvData[]>> {
    // Step 1: Build raw DkvData with module associations (systemId = 0, no KeyVector systemId yet)
    const rawDkvDataWithModules = this.buildDriverCalibrationData(
      parsedAcdb,
      foreignKeyMapper,
    );

    // Step 2: Assign systemIds to KeyVectors and DkvData entities
    const dkvDataWithModules = await this.assignSystemIds(
      rawDkvDataWithModules,
      fileSystemId,
    );

    // Step 3: Group DkvData by module systemId
    const dkvDataByModule = new Map<number, DkvData[]>();
    for (const {dkvData, moduleSystemId} of dkvDataWithModules) {
      const moduleDkvData = dkvDataByModule.get(moduleSystemId) || [];
      moduleDkvData.push(dkvData);
      dkvDataByModule.set(moduleSystemId, moduleDkvData);
    }

    this.logger?.logInfo({
      msg: `Built driver calibration data: ${dkvDataWithModules.length} DkvData entries for ${dkvDataByModule.size} modules`,
      action: 'driver_calibration_data_built',
      component: 'DriverCalibrationDataBuilder',
      tag: 'driver-calibration-building',
      timestamp: new Date(),
    });

    return dkvDataByModule;
  }

  /**
   * Internal: Build raw driver calibration data (systemId = 0, keyVectorSystemId = 0)
   */
  private buildDriverCalibrationData(
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper,
  ): DkvDataWithModule[] {
    const dkvDataWithModules: DkvDataWithModule[] = [];

    // Process driver calibration if available
    const driverCalChunk = parsedAcdb.getChunk<DriverCalibrationChunk>(
      PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
    );

    if (driverCalChunk) {
      const driverResult = this.processDriverCalibration(
        driverCalChunk,
        foreignKeyMapper,
        parsedAcdb,
      );
      dkvDataWithModules.push(...driverResult);
    }

    return dkvDataWithModules;
  }

  /**
   * Assign systemIds to KeyVectors and DkvData entities.
   * Handles KeyVector deduplication via ForeignKeyMapper.
   * Mutates the DkvData objects in place.
   */
  private async assignSystemIds(
    rawDkvDataWithModules: DkvDataWithModule[],
    fileSystemId: number,
  ): Promise<DkvDataWithModule[]> {
    for (const {dkvData} of rawDkvDataWithModules) {
      // Assign systemId to DkvData
      dkvData.systemId = await this.idGenerator.getNextId(fileSystemId);
    }

    return rawDkvDataWithModules;
  }

  /**
   * Process driver calibration chunk
   */
  private processDriverCalibration(
    driverCalChunk: DriverCalibrationChunk,
    foreignKeyMapper: ForeignKeyMapper,
    parsedAcdb: ParsedAcdb,
  ): DkvDataWithModule[] {
    const dkvDataWithModules: DkvDataWithModule[] = [];

    // Iterate through all module lookup entries
    for (const moduleLookup of driverCalChunk.moduleLookupEntries) {
      try {
        const result = this.processModuleLookupEntry(
          moduleLookup,
          driverCalChunk,
          foreignKeyMapper,
          parsedAcdb,
        );
        dkvDataWithModules.push(...result);
      } catch (error) {
        this.logger?.logWarn({
          msg: `Failed to process module ${moduleLookup.moduleDefinitionId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'module_processing_failed',
          component: 'DriverCalibrationDataBuilder',
          tag: 'driver-calibration-building',
          timestamp: new Date(),
        });
      }
    }

    return dkvDataWithModules;
  }

  /**
   * Process a single module lookup entry with its calibration key table entries
   */
  private processModuleLookupEntry(
    moduleLookup: ModuleLookupEntry,
    driverCalChunk: DriverCalibrationChunk,
    foreignKeyMapper: ForeignKeyMapper,
    parsedAcdb: ParsedAcdb,
  ): DkvDataWithModule[] {
    const dkvDataWithModules: DkvDataWithModule[] = [];

    // Process each calibration key table entry
    for (const calKeyEntry of moduleLookup.calKeyTableEntries) {
      // Get calibration key table (key IDs)
      const keyIds = driverCalChunk.getCalKeyTable(
        calKeyEntry.offsetCalKeyTable,
      );

      if (!keyIds) {
        this.logger?.logWarn({
          msg: `Calibration key table not found for module ${moduleLookup.moduleDefinitionId}`,
          action: 'missing_cal_key_table',
          component: 'DriverCalibrationDataBuilder',
          tag: 'driver-calibration-building',
          timestamp: new Date(),
        });
        continue;
      }

      // Get CKV lookup table for this entry
      const ckvLutTbl = driverCalChunk.getCkvLookupTable(
        calKeyEntry.offsetCalLookupTable,
      );

      if (!ckvLutTbl) {
        this.logger?.logWarn({
          msg: `CKV LUT table not found for module ${moduleLookup.moduleDefinitionId}`,
          action: 'missing_ckv_lut_table',
          component: 'DriverCalibrationDataBuilder',
          tag: 'driver-calibration-building',
          timestamp: new Date(),
        });
        continue;
      }

      // Process each CKV lookup entry
      for (const ckvEntry of ckvLutTbl.ckvLookupEntries) {
        const result = this.processCkvLookupEntry(
          ckvEntry.calKeyValues,
          keyIds,
          ckvEntry.offsetCalDefinition,
          ckvEntry.offsetCalDataOffset,
          moduleLookup.moduleDefinitionId,
          driverCalChunk,
          foreignKeyMapper,
          parsedAcdb,
        );

        if (result) {
          dkvDataWithModules.push(...result);
        }
      }
    }

    return dkvDataWithModules;
  }

  /**
   * Process a single CKV lookup entry
   */
  private processCkvLookupEntry(
    calKeyValues: number[],
    keyIds: number[],
    offsetCalDefTable: number,
    offsetCalDataOffset: number,
    moduleDefinitionId: number,
    driverCalChunk: DriverCalibrationChunk,
    foreignKeyMapper: ForeignKeyMapper,
    parsedAcdb: ParsedAcdb,
  ): DkvDataWithModule[] | null {
    // Get cached DEF entry
    const defEntry = driverCalChunk.getCalDefinitionEntry(offsetCalDefTable);
    if (!defEntry) {
      this.logger?.logWarn({
        msg: `DEF entry not found for offset ${offsetCalDefTable}`,
        action: 'missing_def_entry',
        component: 'DriverCalibrationDataBuilder',
        tag: 'driver-calibration-building',
        timestamp: new Date(),
      });
      return null;
    }

    // Get cached DOT entry
    const dotEntry = driverCalChunk.getCalDataOffsetEntry(offsetCalDataOffset);
    if (!dotEntry) {
      this.logger?.logWarn({
        msg: `DOT entry not found for offset ${offsetCalDataOffset}`,
        action: 'missing_dot_entry',
        component: 'DriverCalibrationDataBuilder',
        tag: 'driver-calibration-building',
        timestamp: new Date(),
      });
      return null;
    }

    // Resolve calibration key-value pairs to value system IDs
    const valueSystemIds = this.resolveKeyValuePairs(
      keyIds,
      calKeyValues,
      foreignKeyMapper,
    );

    if (keyIds.length > 0 && valueSystemIds.length === 0) {
      this.logger?.logWarn({
        msg: 'Failed to resolve value system IDs for driver calibration',
        action: 'value_resolution_failed',
        component: 'DriverCalibrationDataBuilder',
        tag: 'driver-calibration-building',
        timestamp: new Date(),
      });
      return null;
    }

    const keyVectorInput: KeyVectorInput = {valueSystemIds};

    // Extract module-parameter-payloads
    const moduleParamPayloads = this.extractModuleParameterPayloads(
      defEntry,
      dotEntry,
      moduleDefinitionId,
      parsedAcdb,
      foreignKeyMapper,
    );

    // Create DkvData entities
    const dkvDataWithModules = this.createDkvDataFromPayloads(
      moduleParamPayloads,
      keyVectorInput,
      foreignKeyMapper,
      moduleDefinitionId,
    );

    return dkvDataWithModules;
  }

  /**
   * Extract module-parameter-payloads from DEF and DOT entries
   * Looks up systemIds from foreignKeyMapper and stores them in payloads
   */
  private extractModuleParameterPayloads(
    defEntry: CalDefinitionEntry,
    dotEntry: CalDataOffsetEntry,
    moduleDefinitionId: number,
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper,
  ): ModuleParameterPayload[] {
    const payloads: ModuleParameterPayload[] = [];
    const datapoolChunk = parsedAcdb.getChunk<DatapoolChunk>(
      PARSED_CHUNK_TYPES.DATAPOOL,
    );

    if (!datapoolChunk) {
      this.logger?.logWarn({
        msg: 'DATAPOOL chunk not found',
        action: 'missing_datapool',
        component: 'DriverCalibrationDataBuilder',
        tag: 'driver-calibration-building',
        timestamp: new Date(),
      });
      return payloads;
    }

    // Look up module definition systemId
    const moduleDefinitionSystemId =
      foreignKeyMapper.getDriverModuleDefinitionSystemId(
        asNaturalId(moduleDefinitionId),
      );

    if (!moduleDefinitionSystemId) {
      this.logger?.logWarn({
        msg: `No driver module definition systemId mapping found for moduleDefinitionId ${moduleDefinitionId}`,
        action: 'module_definition_mapping_not_found',
        component: 'DriverCalibrationDataBuilder',
        tag: 'driver-calibration-building',
        timestamp: new Date(),
      });
      return payloads;
    }

    // Iterate through parameter IDs
    for (let i = 0; i < defEntry.calIdEntries.length; i++) {
      const calIdEntry = defEntry.calIdEntries[i];
      const dataOffset = dotEntry.calDataOffsets[i];

      // Look up parameter definition systemId
      const paramDefSystemId =
        foreignKeyMapper.getDriverParamDefinitionSystemId(
          asSystemId(moduleDefinitionSystemId),
          asNaturalId(calIdEntry.paramId),
        );

      if (!paramDefSystemId) {
        this.logger?.logWarn({
          msg: `No parameter definition systemId mapping found for moduleDefinitionId ${moduleDefinitionId}, parameterId ${calIdEntry.paramId}`,
          action: 'param_mapping_not_found',
          component: 'DriverCalibrationDataBuilder',
          tag: 'driver-calibration-building',
          timestamp: new Date(),
        });
        continue;
      }

      // Extract payload from DATAPOOL using the offset
      const payload = datapoolChunk.getDataAtOffset(dataOffset);

      if (payload && payload.length > 0) {
        payloads.push({
          moduleDefinitionSystemId,
          parameterDefinitionSystemId: paramDefSystemId,
          payload,
        });
      }
    }

    return payloads;
  }

  /**
   * Create DkvData entities from module-parameter-payloads
   * Payloads already contain systemIds, so we can use them directly
   */
  private createDkvDataFromPayloads(
    moduleParamPayloads: ModuleParameterPayload[],
    keyVectorInput: KeyVectorInput,
    foreignKeyMapper: ForeignKeyMapper,
    moduleDefinitionId: number,
  ): DkvDataWithModule[] {
    const dkvDataWithModules: DkvDataWithModule[] = [];

    // All payloads are for the same module, so look up module systemId once
    const moduleSystemId = foreignKeyMapper.getDriverModuleSystemId(
      asNaturalId(moduleDefinitionId),
    );

    if (!moduleSystemId) {
      this.logger?.logWarn({
        msg: `No driver module systemId mapping found for moduleDefinitionId ${moduleDefinitionId}`,
        action: 'module_mapping_not_found',
        component: 'DriverCalibrationDataBuilder',
        tag: 'driver-calibration-building',
        timestamp: new Date(),
      });
      return dkvDataWithModules;
    }

    // Create DkvData entity
    const dkvData = new DkvData({
      systemId: 0, // Will be assigned later
      valueDefinitionSystemIds: keyVectorInput.valueSystemIds,
    });

    // Add parameter payloads (systemIds already resolved in extractModuleParameterPayloads)
    for (const payload of moduleParamPayloads) {
      try {
        const paramData = new ModuleParameterData(
          asSystemId(payload.parameterDefinitionSystemId),
          payload.payload,
        );

        dkvData.addParameterPayload(paramData);
      } catch (error) {
        this.logger?.logWarn({
          msg: `Failed to add parameter payload: ${error instanceof Error ? error.message : 'Unknown error'}`,
          action: 'param_payload_add_failed',
          component: 'DriverCalibrationDataBuilder',
          tag: 'driver-calibration-building',
          timestamp: new Date(),
        });
      }
    }

    // Only add DkvData if it has parameter payloads
    if (dkvData.parameterPayloads.length > 0) {
      dkvDataWithModules.push({dkvData, moduleSystemId});
    }

    return dkvDataWithModules;
  }

  /**
   * Resolve key-value pairs to value system IDs using foreign key mapper
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
          component: 'DriverCalibrationDataBuilder',
          tag: 'driver-calibration-building',
          timestamp: new Date(),
        });
      } else {
        valueSystemIds.push(valueSystemId);
      }
    }

    return valueSystemIds;
  }
}
