/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {ParsedAcdb} from '../../models/parsed-acdb.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {AwspTagDefinition} from '../../../shared/awsp-serializers/v1/definitions/index.js';
import {KvData} from '../../../../../domain/entities/common/entities/kv-data.js';
import {TagData} from '../../../../../domain/entities/usecase-data/module/entities/spf-module-tag-data.js';
import {ModuleParameterData} from '../../../../../domain/entities/common/value-objects/module-parameter-data.js';
import {
  asSystemId,
  asNaturalId,
  type NaturalId,
  type SystemId,
} from '../../../../../shared/types/branded-ids.js';
import {PARSED_CHUNK_TYPES} from '../../../shared/constants/chunk-types.js';
import type {
  TagDataChunk,
  TagIndexEntry,
  TagKeyVectorEntry,
} from '../../../shared/acdb-chunks/tag-data-chunk.js';
import type {DatapoolChunk} from '../../../shared/acdb-chunks/datapool-chunk.js';
import {
  TaggedModuleMapChunk,
  type TaggedModuleEntry,
} from '../../../shared/acdb-chunks/tagged-module-map-chunk.js';

/**
 * Builder for creating TagData entities from parsed tag data chunks.
 * Follows the same pattern as CalibrationDataBuilder.
 */
export class TagDataBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build TagData entities grouped by module system ID.
   * Returns Map<moduleSystemId, TagData[]>
   */
  async buildTagDataByModule(
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
    awspTagDefinitions: AwspTagDefinition[],
    instanceToDefinitionMap: Map<NaturalId, SystemId>,
  ): Promise<Map<number, TagData[]>> {
    const tagDataChunk = parsedAcdb.getChunk<TagDataChunk>(
      PARSED_CHUNK_TYPES.TAG_DATA,
    );
    if (!tagDataChunk) {
      return new Map();
    }

    // Validate AWSP tag definitions are provided
    if (!awspTagDefinitions || awspTagDefinitions.length === 0) {
      this.logger?.logWarn({
        msg: 'missing_awsp_tag_definitions',
        description:
          'No AWSP tag definitions provided - cannot resolve tag key values',
        component: 'TagDataBuilder',
        tag: 'tag-data-building',
      });
      return new Map();
    }

    const datapoolChunk = parsedAcdb.getChunk<DatapoolChunk>(
      PARSED_CHUNK_TYPES.DATAPOOL,
    );
    if (!datapoolChunk) {
      this.logger?.logWarn({
        msg: 'missing_datapool_chunk',
        description:
          'Datapool chunk not found - cannot extract tag data payloads',
        component: 'TagDataBuilder',
        tag: 'tag-data-building',
      });
      return new Map();
    }

    const tagDataByModule = new Map<number, TagData[]>();

    // Process each tag index entry
    for (const tagIndexEntry of tagDataChunk.tagIndexEntries) {
      try {
        const result = await this.processTagDataForOneEntry(
          tagIndexEntry,
          tagDataChunk,
          foreignKeyMapper,
          fileSystemId,
          datapoolChunk,
          awspTagDefinitions,
          instanceToDefinitionMap,
        );

        // Merge results into tagDataByModule
        for (const [moduleSystemId, tagDataList] of result.entries()) {
          const existing = tagDataByModule.get(moduleSystemId) || [];
          existing.push(...tagDataList);
          tagDataByModule.set(moduleSystemId, existing);
        }
      } catch (error) {
        this.logger?.logWarn({
          msg: 'tag_data_processing_failed',
          description: `Failed to process tag data for subgraph ${tagIndexEntry.subgraphId}, tag ${tagIndexEntry.tagId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          component: 'TagDataBuilder',
          tag: 'tag-data-building',
        });
      }
    }

    this.logger?.logInfo({
      msg: 'tag_data_built',
      description: `Built tag data for ${tagDataByModule.size} modules`,
      component: 'TagDataBuilder',
      tag: 'tag-data-building',
    });

    return tagDataByModule;
  }

  /**
   * Process tag data for a single subgraph-tag combination
   */
  private async processTagDataForOneEntry(
    tagIndexEntry: TagIndexEntry,
    tagDataChunk: TagDataChunk,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
    datapoolChunk: DatapoolChunk,
    awspTagDefinitions: AwspTagDefinition[],
    instanceToDefinitionMap: Map<NaturalId, SystemId>,
  ): Promise<Map<number, TagData[]>> {
    const tagDataByModule = new Map<number, TagData[]>();

    // Resolve tag definition system ID
    const tagDefinitionSystemId = this.resolveTagDefinitionSystemId(
      tagIndexEntry.tagId,
      foreignKeyMapper,
    );
    if (!tagDefinitionSystemId) {
      return new Map();
    }

    // Get tag LUT data table
    const tagLutTable = tagDataChunk.getTagLutDataTable(
      tagIndexEntry.offsetTagDataTable,
    );
    if (!tagLutTable) {
      return new Map();
    }

    // Process each tag key vector entry
    for (const tagKeyVectorEntry of tagLutTable.tagKeyVectorEntries) {
      await this.processTagKeyVectorEntry(
        tagKeyVectorEntry,
        tagIndexEntry,
        tagDataChunk,
        tagDefinitionSystemId,
        foreignKeyMapper,
        fileSystemId,
        datapoolChunk,
        tagDataByModule,
        awspTagDefinitions,
        instanceToDefinitionMap,
      );
    }

    return tagDataByModule;
  }

  /**
   * Resolve tag definition system ID with logging
   */
  private resolveTagDefinitionSystemId(
    tagId: number,
    foreignKeyMapper: ForeignKeyMapper,
  ): number | undefined {
    const tagDefinitionSystemId = foreignKeyMapper.getTagDefinitionSystemId(
      asNaturalId(tagId),
    );
    if (!tagDefinitionSystemId) {
      this.logger?.logWarn({
        msg: 'tag_definition_resolution_failed',
        description: `Tag definition system ID not found for tag ${tagId}`,
        component: 'TagDataBuilder',
        tag: 'tag-data-building',
      });
    }
    return tagDefinitionSystemId;
  }

  /**
   * Get or create TagData for a module-tag combination.
   * Ensures one TagData per (module, tag) combination.
   */
  private async getOrCreateTagData(
    moduleSystemId: number,
    tagDefinitionSystemId: number,
    fileSystemId: number,
    tagDataByModule: Map<number, TagData[]>,
  ): Promise<TagData> {
    // Get existing TagData list for this module
    let moduleTagDataList = tagDataByModule.get(moduleSystemId);
    if (!moduleTagDataList) {
      moduleTagDataList = [];
      tagDataByModule.set(moduleSystemId, moduleTagDataList);
    }

    // Check if TagData for this tag already exists
    let tagData = moduleTagDataList.find(
      td => td.tagDefinitionSystemId === tagDefinitionSystemId,
    );

    if (!tagData) {
      // Create new TagData
      const tagDataSystemId = asSystemId(
        await this.idGenerator.getNextId(fileSystemId),
      );

      tagData = new TagData({
        systemId: tagDataSystemId,
        tagDefinitionSystemId,
      });

      moduleTagDataList.push(tagData);
    }

    return tagData;
  }

  /**
   * Resolve tag key values to value system IDs using tag definition.
   * Matches tagKeyValues[i] with keys[i] by position.
   *
   * @param tagKeyValues - Array of value natural IDs from ACDB tag data
   * @param tagId - Natural tag ID to find the AWSP tag definition
   * @param foreignKeyMapper - Mapper to resolve value system IDs
   * @param awspTagDefinitions - AWSP tag definitions from parsed AWSP file
   * @returns Array of resolved value system IDs
   */
  private resolveTagKeyValuesToValueSystemIds(
    tagKeyValues: number[],
    tagId: number,
    foreignKeyMapper: ForeignKeyMapper,
    tagDefinition: AwspTagDefinition,
  ): number[] {
    if (!tagDefinition || !tagDefinition.keys) {
      this.logger?.logWarn({
        msg: 'tag_definition_not_found',
        description: `Tag definition not found or has no supported keys for tagId ${tagId}`,
        component: 'TagDataBuilder',
        tag: 'tag-data-building',
      });
      return [];
    }

    const valueSystemIds: number[] = [];

    // Match tagKeyValues[i] with keys[i] by position
    for (const [i, valueNaturalId] of tagKeyValues.entries()) {
      const supportedKey = tagDefinition.keys[i];

      if (!supportedKey) {
        this.logger?.logWarn({
          msg: 'supported_key_missing',
          description: `No supported key at position ${i} for tag ${tagId}`,
          component: 'TagDataBuilder',
          tag: 'tag-data-building',
        });
        continue;
      }

      // Resolve value system ID using key natural ID and value natural ID
      const valueSystemId = foreignKeyMapper.getValueSystemId(
        asNaturalId(supportedKey.id), // Key natural ID from AWSP
        asNaturalId(valueNaturalId), // Value natural ID from ACDB
      );

      if (valueSystemId === undefined) {
        this.logger?.logWarn({
          msg: 'value_resolution_failed',
          description: `Value system ID not found for value ${valueNaturalId} in key ${supportedKey.id} for tag ${tagId}`,
          component: 'TagDataBuilder',
          tag: 'tag-data-building',
        });
        continue;
      }

      valueSystemIds.push(valueSystemId);
    }

    return valueSystemIds;
  }

  /**
   * Process tag data for all parameter entries belonging to one module instance.
   * Creates a single KvData (shared key vector) and attaches one parameterPayload per entry.
   */
  private async processModuleTagData(
    moduleInstanceId: number,
    entries: Array<{paramId: number; dataOffset: number}>,
    valueSystemIds: number[],
    tagDefinitionSystemId: number,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
    datapoolChunk: DatapoolChunk,
    tagDataByModule: Map<number, TagData[]>,
    instanceToDefinitionMap: Map<NaturalId, SystemId>,
  ): Promise<void> {
    // 1. Resolve module system ID
    const moduleSystemId = foreignKeyMapper.getSpfModuleSystemId(
      asNaturalId(moduleInstanceId),
    );
    if (!moduleSystemId) {
      this.logger?.logWarn({
        msg: 'module_resolution_failed',
        description: `Module system ID not found for instance ${moduleInstanceId}`,
        component: 'TagDataBuilder',
        tag: 'tag-data-building',
      });
      return;
    }

    // 2. Resolve module definition system ID from instance ID
    const moduleDefinitionSystemId = instanceToDefinitionMap.get(
      asNaturalId(moduleInstanceId),
    );
    if (!moduleDefinitionSystemId) {
      this.logger?.logWarn({
        msg: 'module_definition_resolution_failed',
        description: `Module definition system ID not found for instance ${moduleInstanceId}`,
        component: 'TagDataBuilder',
        tag: 'tag-data-building',
      });
      return;
    }

    // 3. Generate system ID for KvData (one per module+keyVector combination)
    const kvDataSystemId = asSystemId(
      await this.idGenerator.getNextId(fileSystemId),
    );

    // 4. Create KvData with resolved values
    const kvData = new KvData({
      systemId: kvDataSystemId,
      valueDefinitionSystemIds: valueSystemIds,
      uiPersistence: null,
    });

    // 5. Attach one parameterPayload per (paramId, dataOffset) entry
    for (const {paramId, dataOffset} of entries) {
      const parameterSystemId = foreignKeyMapper.getParamDefinitionSystemId(
        moduleDefinitionSystemId,
        asNaturalId(paramId),
      );
      if (parameterSystemId === undefined) {
        this.logger?.logWarn({
          msg: 'parameter_resolution_failed',
          description: `Parameter system ID not found for module ${moduleInstanceId}, param ${paramId}`,
          component: 'TagDataBuilder',
          tag: 'tag-data-building',
        });
        continue;
      }

      const payloadData = datapoolChunk.getDataAtOffset(dataOffset);
      if (!payloadData) {
        this.logger?.logWarn({
          msg: 'datapool_offset_not_found',
          description: `No data found at datapool offset ${dataOffset}`,
          component: 'TagDataBuilder',
          tag: 'tag-data-building',
        });
        continue;
      }

      kvData.addParameterPayload(
        new ModuleParameterData(parameterSystemId, payloadData),
      );
    }

    if (kvData.parameterPayloads.length === 0) {
      this.logger?.logWarn({
        msg: 'no_valid_payloads',
        description: `No valid parameter payloads for module instance ${moduleInstanceId}`,
        component: 'TagDataBuilder',
        tag: 'tag-data-building',
      });
      return;
    }

    // 6. Get or create TagData for this module-tag combination
    const tagData = await this.getOrCreateTagData(
      moduleSystemId,
      tagDefinitionSystemId,
      fileSystemId,
      tagDataByModule,
    );

    // 7. Add KvData to TagData
    tagData.addTkv(kvData);
  }

  /**
   * Process a single tag key vector entry.
   * Creates separate KvData for each module with this entry's tag key values.
   */
  private async processTagKeyVectorEntry(
    tagKeyVectorEntry: TagKeyVectorEntry,
    tagIndexEntry: TagIndexEntry,
    tagDataChunk: TagDataChunk,
    tagDefinitionSystemId: number,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
    datapoolChunk: DatapoolChunk,
    tagDataByModule: Map<number, TagData[]>,
    awspTagDefinitions: AwspTagDefinition[],
    instanceToDefinitionMap: Map<NaturalId, SystemId>,
  ): Promise<void> {
    // Get tagged ID entries and offsets
    const tagDataDefEntry = tagDataChunk.getTagDataDefEntry(
      tagKeyVectorEntry.offsetTagDataDEF,
    );
    const tagDataDotEntry = tagDataChunk.getTagDataDotEntry(
      tagKeyVectorEntry.offsetTagDataDOT,
    );

    if (!tagDataDefEntry || !tagDataDotEntry) {
      return;
    }

    // Validate counts match
    if (!this.validateEntryCountsMatch(tagDataDefEntry, tagDataDotEntry)) {
      return;
    }

    // Find the AWSP tag definition by natural tagId
    const tagDefinition = awspTagDefinitions.find(
      def => def.id === tagIndexEntry.tagId,
    );

    if (!tagDefinition || !tagDefinition.keys) {
      this.logger?.logWarn({
        msg: 'tag_definition_not_found',
        description: `Tag definition not found or has no supported keys for tagId ${tagIndexEntry.tagId}`,
        component: 'TagDataBuilder',
        tag: 'tag-data-building',
      });
      return;
    }

    // Resolve value system IDs from tag key values
    const valueSystemIds = this.resolveTagKeyValuesToValueSystemIds(
      tagKeyVectorEntry.tagKeyValues,
      tagIndexEntry.tagId,
      foreignKeyMapper,
      tagDefinition,
    );

    // Group (paramId, dataOffset) pairs by module so each module gets one KvData
    const entriesByModule = new Map<
      number,
      Array<{paramId: number; dataOffset: number}>
    >();
    for (let i = 0; i < tagDataDefEntry.taggedIdEntries.length; i++) {
      const {moduleInstanceId, paramId} = tagDataDefEntry.taggedIdEntries[i];
      const dataOffset = tagDataDotEntry.taggedDataOffsets[i];
      if (!entriesByModule.has(moduleInstanceId)) {
        entriesByModule.set(moduleInstanceId, []);
      }
      entriesByModule.get(moduleInstanceId)!.push({paramId, dataOffset});
    }

    for (const [moduleInstanceId, entries] of entriesByModule) {
      try {
        await this.processModuleTagData(
          moduleInstanceId,
          entries,
          valueSystemIds,
          tagDefinitionSystemId,
          foreignKeyMapper,
          fileSystemId,
          datapoolChunk,
          tagDataByModule,
          instanceToDefinitionMap,
        );
      } catch (error) {
        this.logger?.logError({
          msg: 'process_module_tag_data_failed',
          description: `Failed to process tag data for module instance ${moduleInstanceId}, tagId ${tagIndexEntry.tagId}, valueSystemIds [${valueSystemIds.join(', ')}], tagKeyValues [${tagKeyVectorEntry.tagKeyValues.join(', ')}]: ${error instanceof Error ? error.message : String(error)}`,
          component: 'TagDataBuilder',
          tag: 'tag-data-building',
        });
      }
    }
  }

  /**
   * Validate that DEF and DOT entry counts match
   */
  private validateEntryCountsMatch(
    tagDataDefEntry: {taggedIdEntries: Array<unknown>},
    tagDataDotEntry: {taggedDataOffsets: Array<unknown>},
  ): boolean {
    if (
      tagDataDefEntry.taggedIdEntries.length !==
      tagDataDotEntry.taggedDataOffsets.length
    ) {
      this.logger?.logWarn({
        msg: 'count_mismatch',
        description: `Tag DEF and DOT entry count mismatch: ${tagDataDefEntry.taggedIdEntries.length} vs ${tagDataDotEntry.taggedDataOffsets.length}`,
        component: 'TagDataBuilder',
        tag: 'tag-data-building',
      });
      return false;
    }
    return true;
  }

  /**
   * Build TagData entities from tagged module map (TMLU/TMDE chunks).
   * Creates TagData with empty tkvs array for simple module-tag associations.
   *
   * @returns Map<moduleSystemId, TagData[]>
   */
  async buildTagDataFromTaggedModuleMap(
    parsedAcdb: ParsedAcdb,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
  ): Promise<Map<number, TagData[]>> {
    const taggedModuleMapChunk = parsedAcdb.getChunk<TaggedModuleMapChunk>(
      PARSED_CHUNK_TYPES.TAGGED_MODULE_MAP,
    );

    if (!taggedModuleMapChunk) {
      return new Map();
    }

    const tagDataByModule = new Map<number, TagData[]>();

    // Process each tagged module entry
    for (const entry of taggedModuleMapChunk.taggedModuleEntries) {
      try {
        await this.processTaggedModuleEntry(
          entry,
          taggedModuleMapChunk,
          foreignKeyMapper,
          fileSystemId,
          tagDataByModule,
        );
      } catch (error) {
        this.logger?.logWarn({
          msg: 'tagged_module_processing_failed',
          description: `Failed to process tagged module entry for subgraph ${entry.subgraphId}, tag ${entry.tagId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          component: 'TagDataBuilder',
          tag: 'tagged-module-building',
        });
      }
    }

    return tagDataByModule;
  }

  /**
   * Process a single tagged module entry
   */
  private async processTaggedModuleEntry(
    entry: TaggedModuleEntry,
    chunk: TaggedModuleMapChunk,
    foreignKeyMapper: ForeignKeyMapper,
    fileSystemId: number,
    tagDataByModule: Map<number, TagData[]>,
  ): Promise<void> {
    // Resolve tag definition system ID
    const tagDefinitionSystemId = foreignKeyMapper.getTagDefinitionSystemId(
      asNaturalId(entry.tagId),
    );

    if (!tagDefinitionSystemId) {
      this.logger?.logWarn({
        msg: 'tag_definition_resolution_failed',
        description: `Tag definition system ID not found for tag ${entry.tagId}`,
        component: 'TagDataBuilder',
        tag: 'tagged-module-building',
      });
      return;
    }

    // Get module-instance pairs
    const defEntry = chunk.getTaggedModuleDef(entry.offsetTaggedModuleDef);
    if (!defEntry) return;

    // Process each module-instance pair
    for (const pair of defEntry.moduleInstancePairs) {
      // Resolve module instance system ID
      const moduleSystemId = foreignKeyMapper.getSpfModuleSystemId(
        asNaturalId(pair.instanceId),
      );

      if (!moduleSystemId) {
        this.logger?.logWarn({
          msg: 'module_resolution_failed',
          description: `Module system ID not found for instance ${pair.instanceId}`,
          component: 'TagDataBuilder',
          tag: 'tagged-module-building',
        });
        continue;
      }

      // Generate system ID for TagData
      const tagDataSystemId = asSystemId(
        await this.idGenerator.getNextId(fileSystemId),
      );

      // Create TagData with empty tkvs array
      const tagData = new TagData({
        systemId: tagDataSystemId,
        tagDefinitionSystemId,
      });

      // Add to result map
      const moduleTagDataList = tagDataByModule.get(moduleSystemId) || [];
      moduleTagDataList.push(tagData);
      tagDataByModule.set(moduleSystemId, moduleTagDataList);
    }
  }
}
