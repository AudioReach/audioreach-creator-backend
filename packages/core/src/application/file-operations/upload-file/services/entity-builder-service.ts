/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyDefinition} from '../../../../domain/entities/definitions/key-value/key-definition.js';
import type {TagDefinition} from '../../../../domain/entities/definitions/tag-key-value/tag-definition.js';
import type {SpfModuleDefinition} from '../../../../domain/entities/definitions/spf-module/spf-module-definition.js';
import type {DriverModuleDefinition} from '../../../../domain/entities/definitions/driver-module/driver-module-definition.js';
import {VcpmModuleDefinition} from '../../../../domain/entities/definitions/vcpm-module/vcpm-module-definition.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {Container} from '../../../../domain/entities/usecase-data/container/container.js';
import type {SpfModule} from '../../../../domain/entities/usecase-data/module/spf-module.js';
import type {DriverModule} from '../../../../domain/entities/driver-module-data/driver-module.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import {ProcessorDefinition} from '../../../../domain/entities/definitions/processor/processor-definition.js';
import {ContainerType} from '../../../../domain/entities/definitions/container/container-type-definition.js';
import {SubgraphPropertyDefinition} from '../../../../domain/entities/definitions/subgraph/subgraph-property-definitions.js';
import {
  PropertyDefinition,
  PROPERTY_TYPE,
} from '../../../../domain/entities/definitions/common/entities/property-definition.js';
import type {ParsedAcdb} from '../models/parsed-acdb.js';
import type {ParsedAwsp} from '../models/parsed-awsp.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {NaturalIdGenerationPort} from '../../../ports/id-generation/natural-id-generation.port.js';
import {NaturalIdType} from '../../../../domain/services/natural-id-generator/natural-id-type.js';
import {KeyDefinitionBuilder} from './entity-builders/key-definition-builder.js';
import {TagDefinitionBuilder} from './entity-builders/tag-definition-builder.js';
import {SpfModuleDefinitionBuilder} from './entity-builders/spf-module-definition-builder.js';
import {DriverModuleDefinitionBuilder} from './entity-builders/driver-module-definition-builder.js';
import {VcpmModuleDefinitionBuilder} from './entity-builders/vcpm-module-definition-builder.js';
import {CalibrationDataBuilder} from './entity-builders/calibration-data-builder.js';
import {UsecaseBuilder} from './entity-builders/usecase-builder.js';
import {SubgraphBuilder} from './entity-builders/subgraph-builder.js';
import {SubsystemBuilder} from './entity-builders/subsystem-builder.js';
import type {UiSubsystem} from '../../shared/awsp-serializers/v1/ui-metadata/index.js';
import {
  ContainerBuilder,
  type ContainerBuildResult,
} from './entity-builders/container-builder.js';
import {SpfModuleBuilder} from './entity-builders/spf-module-builder.js';
import {DriverModuleBuilder} from './entity-builders/driver-module-builder.js';
import {DataLinkBuilder} from './entity-builders/data-link-builder.js';
import {ControlLinkBuilder} from './entity-builders/control-link-builder.js';
import type {SubsystemBuildResult} from './entity-builders/subsystem-builder.js';
import {PARSED_CHUNK_TYPES} from '../../shared/constants/chunk-types.js';
import {asNaturalId, asSystemId} from '../../../../shared/types/branded-ids.js';
import {KvData} from '../../../../domain/entities/common/entities/kv-data.js';
import type {UsecaseDataChunk} from '../../shared/acdb-chunks/usecase-data-chunk.js';
import type {SubgraphDataChunk} from '../../shared/acdb-chunks/subgraph-data-chunk.js';
import type {SubgraphPairDataChunk} from '../../shared/acdb-chunks/subgraph-pair-data-chunk.js';
import type {DriverCalibrationChunk} from '../../shared/acdb-chunks/driver-calibration-chunk.js';
import type {GkvAliasChunk} from '../../shared/acdb-chunks/gkv-alias-chunk.js';
import type {
  DataLink as DataLinkProperty,
  ControlLink as ControlLinkProperty,
} from '../../shared/acdb-chunks/spf-properties/types.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {ForeignKeyMapper} from './foreign-key-mapper.js';
import type {BootUpLoadingChunk} from './acdb-chunk-parsers/bootup-loading-chunk-parser.js';
import type {ModuleManagerChunk} from './acdb-chunk-parsers/module-manager-chunk-parser.js';
import type {ActiveControlPortInfo} from './entity-builders/spf-module-builder.js';
import {
  ModuleManagerData,
  type ModuleTypeValue,
  type InterfaceTypeValue,
  type InterfaceVersionValue,
} from '../../../../domain/entities/module-manager/module-manager-data.js';
import type {
  NaturalId,
  SystemId,
} from '../../../../shared/types/branded-ids.js';
import type {BuildResult} from '../types/issue-collection.js';

/**
 * Constants for entity model keys used by EntityBuilderService
 */
export const ENTITY_MODEL_KEYS = {
  KEY_DEFINITIONS: 'KEY_DEFINITIONS',
  SPF_MODULE_DEFINITIONS: 'SPF_MODULE_DEFINITIONS',
  USECASES: 'USECASES',
  SUBGRAPHS: 'SUBGRAPHS',
  CONTAINERS: 'CONTAINERS',
  SPF_MODULES: 'SPF_MODULES',
  DATA_LINKS: 'DATA_LINKS',
  CONTROL_LINKS: 'CONTROL_LINKS',
} as const;

export type EntityModelKey =
  (typeof ENTITY_MODEL_KEYS)[keyof typeof ENTITY_MODEL_KEYS];

/**
 * Container for all domain entities created from parsed chunks
 */
export class EntityModel {
  private entities = new Map<string, unknown>();

  addEntity(type: string, entity: unknown): void {
    this.entities.set(type, entity);
  }

  getEntity<T>(type: string): T | undefined {
    return this.entities.get(type) as T | undefined;
  }

  getAllEntities(): Map<string, unknown> {
    return new Map(this.entities);
  }

  getEntityCount(): number {
    return this.entities.size;
  }
}

/**
 * Simplified EntityBuilderService with direct processing similar to AWSP pattern
 */
export class EntityBuilderService {
  private keyDefinitionBuilder: KeyDefinitionBuilder;
  private tagDefinitionBuilder: TagDefinitionBuilder;
  private spfModuleDefinitionBuilder: SpfModuleDefinitionBuilder;
  private driverModuleDefinitionBuilder: DriverModuleDefinitionBuilder;
  private vcpmModuleDefinitionBuilder: VcpmModuleDefinitionBuilder;
  private subgraphBuilder: SubgraphBuilder;
  private subsystemBuilder: SubsystemBuilder;
  private containerBuilder: ContainerBuilder;
  private spfModuleBuilder: SpfModuleBuilder;
  private driverModuleBuilder: DriverModuleBuilder;
  private dataLinkBuilder: DataLinkBuilder;
  private controlLinkBuilder: ControlLinkBuilder;
  private containerProcessorMap: Map<number, number> = new Map();

  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly naturalIdPort: NaturalIdGenerationPort,
    readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {
    this.keyDefinitionBuilder = new KeyDefinitionBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.workerPool,
      this.logger,
    );
    this.tagDefinitionBuilder = new TagDefinitionBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger,
    );
    this.spfModuleDefinitionBuilder = new SpfModuleDefinitionBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.workerPool,
      this.logger,
    );
    this.driverModuleDefinitionBuilder = new DriverModuleDefinitionBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger,
    );
    this.vcpmModuleDefinitionBuilder = new VcpmModuleDefinitionBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger,
    );
    this.subgraphBuilder = new SubgraphBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger,
    );
    this.subsystemBuilder = new SubsystemBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.workerPool,
      this.logger,
    );
    this.containerBuilder = new ContainerBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger,
    );
    this.spfModuleBuilder = new SpfModuleBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger,
    );
    this.driverModuleBuilder = new DriverModuleBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger,
    );
    this.dataLinkBuilder = new DataLinkBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger,
    );
    this.controlLinkBuilder = new ControlLinkBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger,
    );
  }

  /**
   * Build subgraphs from ACDB data with system IDs assigned
   */
  async buildSubgraphs(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
    parsedAwsp: ParsedAwsp,
  ): Promise<BuildResult<Subgraph>> {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      PARSED_CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logError({
        msg: 'No subgraph data chunk found in ACDB data',
        action: 'no_subgraph_data_chunk',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return {entities: [], issues: []};
    }

    // Extract subgraph properties from SPF data
    const subgraphs = subgraphDataChunk.getAllSubgraphs();

    if (!subgraphs || subgraphs.length === 0) {
      return {entities: [], issues: []};
    }

    // Build domain subgraphs with system IDs assigned
    const result = await this.subgraphBuilder.buildSubgraphs(
      subgraphs,
      fileSystemId,
      parsedAwsp.getUiMetadata(),
    );

    // Attach VCPM data to subgraphs that have voice calibration entries
    if (result.entities.length > 0) {
      const calibrationDataBuilder = new CalibrationDataBuilder(
        this.idGenerator,
        this.logger,
      );
      await calibrationDataBuilder.attachVcpmDataToSubgraphs(
        parsedAcdb,
        this.foreignKeyMapper,
        result.entities,
        fileSystemId,
      );
    }

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} subgraphs from ACDB with system IDs assigned (${result.issues.length} issues)`,
      action: 'acdb_subgraphs_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return result;
  }

  async buildSubsystems(
    uiSubsystems: UiSubsystem[],
    fileSystemId: number,
    dataLinks: DataLink[],
    controlLinks: ControlLink[],
  ): Promise<SubsystemBuildResult> {
    return this.subsystemBuilder.build(
      uiSubsystems,
      fileSystemId,
      dataLinks,
      controlLinks,
    );
  }

  /**
   * Build containers from ACDB data with system IDs assigned
   */
  async buildContainers(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<BuildResult<Container>> {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      PARSED_CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logError({
        msg: 'No subgraph data chunk found for containers',
        action: 'no_subgraph_data_chunk_containers',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return {entities: [], issues: []};
    }

    // Extract container properties from SPF data (deduplicated)
    const containers = subgraphDataChunk.getAllContainers();

    if (!containers || containers.length === 0) {
      return {entities: [], issues: []};
    }

    // Build domain containers with system IDs assigned and extract processor mappings
    const result: ContainerBuildResult =
      await this.containerBuilder.buildContainers(containers, fileSystemId);

    // Store the container-to-processor map for later use in module building
    this.containerProcessorMap = result.containerProcessorMap;

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} containers from ACDB with system IDs assigned (${result.issues.length} issues)`,
      action: 'acdb_containers_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Analyze control links to collect all active control port IDs per module
   */
  private analyzeActiveControlPorts(
    parsedAcdb: ParsedAcdb,
  ): ActiveControlPortInfo {
    const allControlLinks = this.collectAllControlLinks(parsedAcdb);
    const activePortIdsPerModule = this.collectActivePortIds(allControlLinks);

    this.logActivePortAnalysisResults(
      allControlLinks.length,
      activePortIdsPerModule.size,
    );

    return {activePortIdsPerModule};
  }

  /**
   * Collect all control links from both intra-subgraph and inter-subgraph sources
   */
  private collectAllControlLinks(
    parsedAcdb: ParsedAcdb,
  ): ControlLinkProperty[] {
    const links: ControlLinkProperty[] = [];

    this.collectIntraSubgraphControlLinks(parsedAcdb, links);
    this.collectInterSubgraphControlLinks(parsedAcdb, links);

    return links;
  }

  /**
   * Extract intra-subgraph control links from SubgraphDataChunk
   */
  private collectIntraSubgraphControlLinks(
    parsedAcdb: ParsedAcdb,
    links: ControlLinkProperty[],
  ): void {
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      PARSED_CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      return;
    }

    const intraSubgraphLinks = subgraphDataChunk.getAllControlLinks();
    if (intraSubgraphLinks && intraSubgraphLinks.length > 0) {
      links.push(...intraSubgraphLinks);
    }
  }

  /**
   * Extract inter-subgraph control links from SubgraphPairDataChunk
   */
  private collectInterSubgraphControlLinks(
    parsedAcdb: ParsedAcdb,
    links: ControlLinkProperty[],
  ): void {
    const subgraphPairChunk = parsedAcdb.getChunk<SubgraphPairDataChunk>(
      PARSED_CHUNK_TYPES.SUBGRAPH_PAIR_DATA,
    );

    if (!subgraphPairChunk) {
      return;
    }

    for (const pair of subgraphPairChunk.subgraphPairs) {
      if (pair.controlLinks && pair.controlLinks.length > 0) {
        links.push(...pair.controlLinks);
      }
    }
  }

  /**
   * Collect all active control port IDs from control links
   * No filtering - collects all port IDs regardless of static/dynamic classification
   */
  private collectActivePortIds(
    links: ControlLinkProperty[],
  ): Map<number, Set<number>> {
    const activePortIdsPerModule = new Map<number, Set<number>>();

    for (const link of links) {
      this.addActivePort(
        link.peer1InstanceId,
        link.peer1PortId,
        activePortIdsPerModule,
      );
      this.addActivePort(
        link.peer2InstanceId,
        link.peer2PortId,
        activePortIdsPerModule,
      );
    }

    return activePortIdsPerModule;
  }

  /**
   * Add a port ID to the active ports set for a module instance
   */
  private addActivePort(
    instanceId: number,
    portId: number,
    portIdsMap: Map<number, Set<number>>,
  ): void {
    if (!portIdsMap.has(instanceId)) {
      portIdsMap.set(instanceId, new Set<number>());
    }
    portIdsMap.get(instanceId)!.add(portId);
  }

  /**
   * Log the results of active port analysis
   */
  private logActivePortAnalysisResults(
    totalLinks: number,
    modulesWithActivePorts: number,
  ): void {
    this.logger?.logInfo({
      msg: `Analyzed ${totalLinks} control links, found ${modulesWithActivePorts} modules with active control ports`,
      action: 'active_control_ports_analyzed',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });
  }

  /**
   * Build SPF modules from ACDB data with system IDs assigned.
   * Calibration data (CKVs) are automatically attached to modules during this process.
   */
  async buildSpfModules(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
    parsedAwsp: ParsedAwsp,
  ): Promise<BuildResult<SpfModule>> {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      PARSED_CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logError({
        msg: 'No subgraph data chunk found for modules',
        action: 'no_subgraph_data_chunk_modules',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return {entities: [], issues: []};
    }

    // Extract module instance info from SPF data
    const spfModuleInfos = subgraphDataChunk.getAllModules();

    if (!spfModuleInfos || spfModuleInfos.length === 0) {
      return {entities: [], issues: []};
    }

    // Extract module properties from SPF data
    const modulePropertyConfigs = subgraphDataChunk.getAllModuleProperties();

    // Get SPF module definitions from ParsedAwsp for display names
    const spfModuleDefinitions = parsedAwsp.getSpfModuleDefinitions() || [];

    // Get tag definitions from ParsedAwsp for tag data value resolution
    const awspTagDefinitions = parsedAwsp.getTagDefinitions() || [];

    // Get port strategy from configuration (required)
    const configuration = parsedAwsp.getConfiguration();
    if (!configuration?.portStrategy) {
      throw new Error(
        'Port strategy not found in configuration. Please ensure configuration.json exists in the AWSP file with a valid portStrategy.',
      );
    }

    const portStrategy = configuration.portStrategy;

    // Analyze control links to collect active control port IDs
    const activeControlPortInfo = this.analyzeActiveControlPorts(parsedAcdb);

    // Build domain SPF modules with module properties, definitions, calibration data, and system IDs assigned
    const result = await this.spfModuleBuilder.buildSpfModules(
      spfModuleInfos,
      fileSystemId,
      portStrategy,
      modulePropertyConfigs,
      spfModuleDefinitions,
      awspTagDefinitions, // Pass AWSP tag definitions for tag data value resolution
      this.containerProcessorMap, // Pass container-to-processor map
      activeControlPortInfo,
      parsedAcdb, // Pass parsedAcdb for calibration data attachment
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} SPF modules from ACDB with system IDs and calibration data assigned (${result.issues.length} issues)`,
      action: 'acdb_spf_modules_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    const uiMetadata = parsedAwsp.getUiMetadata();
    if (uiMetadata) {
      const calBuilder = new CalibrationDataBuilder(
        this.idGenerator,
        this.logger,
      );
      for (const module of result.entities) {
        calBuilder.applyUiMetadataToCkvs(
          module.ckvs as KvData[],
          module.instanceId,
          uiMetadata,
          this.foreignKeyMapper,
        );
      }
    }

    for (const module of result.entities) {
      this.foreignKeyMapper.addModuleInstanceSubgraphMapping(
        asNaturalId(module.instanceId),
        asSystemId(module.subgraphSystemId),
      );
    }

    return result;
  }

  /**
   * Build data links from ACDB data with system IDs assigned
   * Includes both intra-subgraph links (from SubgraphDataChunk) and inter-subgraph links (from SubgraphPairDataChunk)
   */
  async buildDataLinks(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
    parsedAwsp: ParsedAwsp,
  ): Promise<DataLink[]> {
    const allDataLinkProperties: DataLinkProperty[] = [];
    let intraSubgraphCount = 0;
    let interSubgraphCount = 0;

    // 1. Extract intra-subgraph data links from SubgraphDataChunk
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      PARSED_CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (subgraphDataChunk) {
      const intraSubgraphLinks = subgraphDataChunk.getAllDataLinks();
      if (intraSubgraphLinks && intraSubgraphLinks.length > 0) {
        allDataLinkProperties.push(...intraSubgraphLinks);
        intraSubgraphCount = intraSubgraphLinks.length;
      }
    }

    // 2. Extract inter-subgraph data links from SubgraphPairDataChunk
    const subgraphPairChunk = parsedAcdb.getChunk<SubgraphPairDataChunk>(
      PARSED_CHUNK_TYPES.SUBGRAPH_PAIR_DATA,
    );

    if (subgraphPairChunk) {
      for (const pair of subgraphPairChunk.subgraphPairs) {
        if (pair.dataLinks && pair.dataLinks.length > 0) {
          allDataLinkProperties.push(...pair.dataLinks);
          interSubgraphCount += pair.dataLinks.length;
        }
      }
    }

    // 3. Check if we have any data links to process
    if (allDataLinkProperties.length === 0) {
      return [];
    }

    // 4. Build domain data links from all sources with system IDs assigned
    const dataLinks = await this.dataLinkBuilder.buildDataLinks(
      allDataLinkProperties,
      fileSystemId,
      parsedAwsp.getUiMetadata(),
    );

    this.logger?.logInfo({
      msg: `Successfully built ${dataLinks.length} data links from ACDB (${intraSubgraphCount} intra-subgraph, ${interSubgraphCount} inter-subgraph)`,
      action: 'acdb_data_links_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return dataLinks;
  }

  /**
   * Build control links from ACDB data with system IDs assigned
   * Includes both intra-subgraph links (from SubgraphDataChunk) and inter-subgraph links (from SubgraphPairDataChunk)
   * @returns Object containing control links and extracted intents for control ports
   */
  async buildControlLinks(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<{
    controlLinks: ControlLink[];
    controlPortIntents: Map<number, number[]>;
  }> {
    const allControlLinkProperties: ControlLinkProperty[] = [];
    let intraSubgraphCount = 0;
    let interSubgraphCount = 0;

    // 1. Extract intra-subgraph control links from SubgraphDataChunk
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      PARSED_CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (subgraphDataChunk) {
      const intraSubgraphLinks = subgraphDataChunk.getAllControlLinks();
      if (intraSubgraphLinks && intraSubgraphLinks.length > 0) {
        allControlLinkProperties.push(...intraSubgraphLinks);
        intraSubgraphCount = intraSubgraphLinks.length;
      }
    }

    // 2. Extract inter-subgraph control links from SubgraphPairDataChunk
    const subgraphPairChunk = parsedAcdb.getChunk<SubgraphPairDataChunk>(
      PARSED_CHUNK_TYPES.SUBGRAPH_PAIR_DATA,
    );

    if (subgraphPairChunk) {
      for (const pair of subgraphPairChunk.subgraphPairs) {
        if (pair.controlLinks && pair.controlLinks.length > 0) {
          allControlLinkProperties.push(...pair.controlLinks);
          interSubgraphCount += pair.controlLinks.length;
        }
      }
    }

    // 3. Check if we have any control links to process
    if (allControlLinkProperties.length === 0) {
      return {
        controlLinks: [],
        controlPortIntents: new Map(),
      };
    }

    // 4. Build domain control links from all sources with system IDs assigned and extract intents
    const result = await this.controlLinkBuilder.buildControlLinks(
      allControlLinkProperties,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.controlLinks.length} control links from ACDB (${intraSubgraphCount} intra-subgraph, ${interSubgraphCount} inter-subgraph), extracted intents for ${result.controlPortIntents.size} control ports`,
      action: 'acdb_control_links_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Build usecases from ACDB data with system IDs assigned
   */
  async buildUsecases(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
    parsedAwsp: ParsedAwsp,
  ): Promise<UseCase[]> {
    // Extract usecase data from ACDB
    const usecaseChunk = parsedAcdb.getChunk<UsecaseDataChunk>(
      PARSED_CHUNK_TYPES.USECASE_DATA,
    );

    if (!usecaseChunk?.usecases || usecaseChunk.usecases.length === 0) {
      return [];
    }

    // Create usecase builder
    const usecaseBuilder = new UsecaseBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.logger,
    );

    // Build domain usecases with system IDs assigned
    const gkvAliasChunk = parsedAcdb.getChunk<GkvAliasChunk>(
      PARSED_CHUNK_TYPES.GKV_ALIAS_DATA,
    );
    const usecases = await usecaseBuilder.buildUsecases(
      usecaseChunk.usecases,
      fileSystemId,
      gkvAliasChunk,
      parsedAwsp.getUiMetadata(),
    );

    this.logger?.logInfo({
      msg: `Successfully built ${usecases.length} usecases from ACDB with system IDs assigned`,
      action: 'acdb_usecases_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return usecases;
  }

  /**
   * Build key definitions from AWSP data with system IDs assigned
   */
  async buildKeyDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<BuildResult<KeyDefinition>> {
    // Extract key definitions from AWSP
    const awspKeyDefinitions = parsedAwsp.getKeyDefinitions();

    if (!awspKeyDefinitions || awspKeyDefinitions.length === 0) {
      return {entities: [], issues: []};
    }

    // Build domain key definitions with system IDs assigned
    const result = await this.keyDefinitionBuilder.buildKeyDefinitions(
      awspKeyDefinitions,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} key definitions from AWSP with system IDs assigned, ${result.issues.length} issues`,
      action: 'awsp_key_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Build tag definitions from AWSP data with system IDs assigned
   */
  async buildTagDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<BuildResult<TagDefinition>> {
    // Extract tag definitions from AWSP
    const awspTagDefinitions = parsedAwsp.getTagDefinitions();

    if (!awspTagDefinitions || awspTagDefinitions.length === 0) {
      return {entities: [], issues: []};
    }

    // Build domain tag definitions with system IDs assigned
    const result = await this.tagDefinitionBuilder.buildTagDefinitions(
      awspTagDefinitions,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} tag definitions from AWSP with system IDs assigned, ${result.issues.length} issues`,
      action: 'awsp_tag_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Build processor definitions from AWSP data with system IDs assigned
   * Extracts processor definitions directly from AWSP file
   */
  async buildProcessorDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<BuildResult<ProcessorDefinition>> {
    // Extract processor definitions from AWSP
    const awspProcessorDefs = parsedAwsp.getProcessorDefinitions();

    if (!awspProcessorDefs || awspProcessorDefs.length === 0) {
      return {entities: [], issues: []};
    }

    const entities: ProcessorDefinition[] = [];

    // Build domain processor definitions with system IDs assigned
    for (const awspProcessor of awspProcessorDefs) {
      const systemId = await this.idGenerator.getNextId(fileSystemId);

      const processor = new ProcessorDefinition({
        systemId,
        processorDefinitionId: awspProcessor.id,
        name: awspProcessor.name,
      });

      entities.push(processor);

      // Store mapping for foreign key resolution
      this.foreignKeyMapper.addProcessorDefinitionMapping(
        awspProcessor.id as NaturalId,
        systemId as SystemId,
      );
    }

    this.logger?.logInfo({
      msg: `Successfully built ${entities.length} processor definitions from AWSP with system IDs assigned`,
      action: 'awsp_processor_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return {
      entities,
      issues: [],
    };
  }

  /**
   * Build container type definitions from AWSP data with system IDs assigned
   * Extracts container type definitions directly from AWSP file
   */
  async buildContainerTypeDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<BuildResult<ContainerType>> {
    // Extract container type definitions from AWSP
    const awspContainerTypes = parsedAwsp.getContainerTypes();

    if (!awspContainerTypes || awspContainerTypes.length === 0) {
      return {entities: [], issues: []};
    }

    const entities: ContainerType[] = [];

    // Build domain container type definitions with system IDs assigned
    for (const awspContainerType of awspContainerTypes) {
      const systemId = await this.idGenerator.getNextId(fileSystemId);

      const containerType = new ContainerType({
        systemId,
        value: awspContainerType.id,
        name: awspContainerType.name,
      });

      entities.push(containerType);

      // Store mapping for foreign key resolution
      this.foreignKeyMapper.addContainerTypeMapping(
        awspContainerType.id as NaturalId,
        systemId as SystemId,
      );
    }

    this.logger?.logInfo({
      msg: `Successfully built ${entities.length} container type definitions from AWSP with system IDs assigned`,
      action: 'awsp_container_type_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return {
      entities,
      issues: [],
    };
  }

  /**
   * Build subgraph property definitions from AWSP data with system IDs assigned
   * @param parsedAwsp - Parsed AWSP data
   * @param fileSystemId - File system ID for the property definitions
   */
  async buildSubgraphPropertyDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<BuildResult<SubgraphPropertyDefinition>> {
    // Extract SPF property definitions from AWSP and filter for SG_CFG category (subgraph properties)
    const allSpfProperties = parsedAwsp.getSpfPropertyDefinitions();
    const awspPropertyDefinitions = allSpfProperties?.filter(
      prop => prop.categoryName === 'SG_CFG',
    );

    if (!awspPropertyDefinitions || awspPropertyDefinitions.length === 0) {
      return {entities: [], issues: []};
    }

    const entities: SubgraphPropertyDefinition[] = [];

    // Build domain subgraph property definitions with system IDs assigned
    for (const awspProperty of awspPropertyDefinitions) {
      const systemId = await this.idGenerator.getNextId(fileSystemId);

      const propertyDef = new SubgraphPropertyDefinition({
        systemId,
        propertyId: awspProperty.id,
        name: awspProperty.name,
        type: PROPERTY_TYPE.Spf,
        description: awspProperty.description,
        maxSize: awspProperty.maxSize,
        elementsStructure: JSON.stringify(awspProperty.elements),
        isVoice: awspProperty.isVoice || false,
      });

      entities.push(propertyDef);

      // Store mapping for foreign key resolution
      this.foreignKeyMapper.addSubgraphPropertyDefinitionMapping(
        awspProperty.id as NaturalId,
        systemId as SystemId,
      );
    }

    this.logger?.logInfo({
      msg: `Successfully built ${entities.length} subgraph property definitions from AWSP with system IDs assigned`,
      action: 'awsp_subgraph_property_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return {
      entities,
      issues: [],
    };
  }

  /**
   * Extract boot-up module IDs from BTUP chunk
   */
  private extractBootUpModuleIds(parsedAcdb: ParsedAcdb): Set<number> {
    const bootUpChunk = parsedAcdb.getChunk<BootUpLoadingChunk>(
      PARSED_CHUNK_TYPES.BOOTUP_LOADING,
    );

    if (!bootUpChunk) {
      return new Set<number>();
    }

    const bootUpModuleIds = new Set<number>();

    // Collect all module IDs from all processors
    for (const moduleIds of bootUpChunk.bootUpModules.values()) {
      for (const moduleId of moduleIds) {
        bootUpModuleIds.add(moduleId);
      }
    }

    return bootUpModuleIds;
  }

  /**
   * Build SPF module definitions from AWSP data with system IDs assigned
   * @param parsedAwsp - Parsed AWSP data
   * @param parsedAcdb - Parsed ACDB data (for boot-up flag)
   * @param fileSystemId - File system ID for the module definitions
   */
  async buildSpfModuleDefinitions(
    parsedAwsp: ParsedAwsp,
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<BuildResult<SpfModuleDefinition>> {
    // Extract SPF module definitions from AWSP
    const awspModuleDefinitions = parsedAwsp.getSpfModuleDefinitions();

    if (!awspModuleDefinitions || awspModuleDefinitions.length === 0) {
      return {entities: [], issues: []};
    }

    // Extract boot-up module IDs
    const bootUpModuleIds = this.extractBootUpModuleIds(parsedAcdb);

    // Build domain SPF module definitions with system IDs assigned
    const result = await this.spfModuleDefinitionBuilder.buildModuleDefinitions(
      awspModuleDefinitions,
      fileSystemId,
      bootUpModuleIds,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} SPF module definitions from AWSP with system IDs assigned, ${result.issues.length} issues`,
      action: 'awsp_spf_module_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Build driver module definitions from AWSP data with system IDs assigned
   * @param parsedAwsp - Parsed AWSP data
   * @param fileSystemId - File system ID for the module definitions
   */
  async buildDriverModuleDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<BuildResult<DriverModuleDefinition>> {
    // Extract driver module definitions from AWSP
    const awspModuleDefinitions = parsedAwsp.getDriverModuleDefinitions();

    if (!awspModuleDefinitions || awspModuleDefinitions.length === 0) {
      return {entities: [], issues: []};
    }

    // Build domain driver module definitions with system IDs assigned
    const result =
      await this.driverModuleDefinitionBuilder.buildDriverModuleDefinitions(
        awspModuleDefinitions,
        fileSystemId,
      );

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} driver module definitions from AWSP with system IDs assigned, ${result.issues.length} issues`,
      action: 'awsp_driver_module_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Build VCPM module definitions from AWSP data with system IDs assigned
   * @param parsedAwsp - Parsed AWSP data
   * @param fileSystemId - File system ID for the module definitions
   */
  async buildVcpmModuleDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<BuildResult<VcpmModuleDefinition>> {
    const awspModuleDefinitions = parsedAwsp.getVcpmModuleDefinitions();

    if (!awspModuleDefinitions || awspModuleDefinitions.length === 0) {
      return {entities: [], issues: []};
    }

    const result =
      await this.vcpmModuleDefinitionBuilder.buildVcpmModuleDefinitions(
        awspModuleDefinitions,
        fileSystemId,
      );

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} VCPM module definitions from AWSP with system IDs assigned, ${result.issues.length} issues`,
      action: 'awsp_vcpm_module_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Build driver modules from ACDB data with system IDs assigned
   * @param parsedAcdb - Parsed ACDB data
   * @param fileSystemId - File system ID for the modules
   */
  async buildDriverModules(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<BuildResult<DriverModule>> {
    // Extract driver module definition IDs from driver calibration chunk
    const driverCalChunk = parsedAcdb.getChunk<DriverCalibrationChunk>(
      PARSED_CHUNK_TYPES.DRIVER_CALIBRATION_DATA,
    );

    if (!driverCalChunk) {
      return {entities: [], issues: []};
    }

    // Extract module definition IDs from the chunk
    const moduleDefinitionIds: number[] =
      driverCalChunk.moduleLookupEntries.map(entry => entry.moduleDefinitionId);

    if (moduleDefinitionIds.length === 0) {
      return {entities: [], issues: []};
    }

    // Build domain driver modules with system IDs assigned and calibration data attached
    const result = await this.driverModuleBuilder.buildDriverModules(
      moduleDefinitionIds,
      fileSystemId,
      parsedAcdb,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} driver modules from ACDB with system IDs assigned, ${result.issues.length} issues`,
      action: 'acdb_driver_modules_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Build module manager data from ACDB data with system IDs assigned
   * @param parsedAcdb - Parsed ACDB data
   * @param fileSystemId - File system ID for the module manager data
   * @returns Promise resolving to array of ModuleManagerData entities
   */
  async buildModuleManagerData(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<ModuleManagerData[]> {
    // Extract module manager chunk
    const mmgrChunk = parsedAcdb.getChunk<ModuleManagerChunk>(
      PARSED_CHUNK_TYPES.MODULE_MANAGER,
    );

    if (!mmgrChunk || mmgrChunk.registrations.size === 0) {
      return [];
    }

    const entities: ModuleManagerData[] = [];

    // Build domain module manager data with system IDs and foreign key resolution
    // Iterate through all processors and their module registrations
    for (const [processorId, moduleMap] of mmgrChunk.registrations) {
      // Resolve processor definition system ID
      const processorSystemId =
        this.foreignKeyMapper.getProcessorDefinitionSystemId(
          asNaturalId(processorId),
        );

      if (processorSystemId === undefined) {
        this.logger?.logWarn({
          msg: `Processor definition ID ${processorId} not found in foreign key mapper for module manager entry`,
          action: 'processor_mapping_not_found_mmgr',
          component: 'EntityBuilderService',
          tag: 'acdb-processing',
          timestamp: new Date(),
        });
        continue; // Skip this processor if not found
      }

      // Iterate through all module registrations for this processor
      for (const [moduleId, registration] of moduleMap) {
        // Resolve module definition system ID
        const moduleDefinitionSystemId =
          this.foreignKeyMapper.getModuleDefinitionSystemId(
            asNaturalId(processorId),
            asNaturalId(moduleId),
          );

        if (moduleDefinitionSystemId === undefined) {
          this.logger?.logWarn({
            msg: `Module definition ID ${moduleId} not found in foreign key mapper for module manager entry`,
            action: 'module_definition_mapping_not_found_mmgr',
            component: 'EntityBuilderService',
            tag: 'acdb-processing',
            timestamp: new Date(),
          });
          continue; // Skip this module if not found
        }

        const systemId = await this.idGenerator.getNextId(fileSystemId);

        const moduleManagerData = new ModuleManagerData({
          systemId,
          moduleDefinitionSystemId,
          moduleType: registration.capi.moduleType as ModuleTypeValue,
          interfaceType: registration.interfaceType as InterfaceTypeValue,
          interfaceVersion:
            registration.interfaceVersion as InterfaceVersionValue,
          fileName: registration.capi.fileName,
          tag: registration.capi.tag,
          fileSystemId,
        });

        entities.push(moduleManagerData);
      }
    }

    this.logger?.logInfo({
      msg: `Successfully built ${entities.length} module manager data entries from ACDB with system IDs assigned`,
      action: 'acdb_module_manager_data_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return entities;
  }

  /**
   * Build container property definitions from AWSP data with system IDs assigned
   * @param parsedAwsp - Parsed AWSP data
   * @param fileSystemId - File system ID for the property definitions
   */
  async buildContainerPropertyDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<BuildResult<PropertyDefinition>> {
    // Extract SPF property definitions from AWSP and filter for CONTAINER_CFG category (container properties)
    const allSpfProperties = parsedAwsp.getSpfPropertyDefinitions();
    const awspPropertyDefinitions = allSpfProperties?.filter(
      prop => prop.categoryName === 'CONTAINTER_CFG', //TODO: fix in awsp file.
    );

    if (!awspPropertyDefinitions || awspPropertyDefinitions.length === 0) {
      return {entities: [], issues: []};
    }

    const entities: PropertyDefinition[] = [];

    // Build domain container property definitions with system IDs assigned
    for (const awspProperty of awspPropertyDefinitions) {
      const systemId = await this.idGenerator.getNextId(fileSystemId);

      const propertyDef = new PropertyDefinition({
        systemId,
        propertyId: awspProperty.id,
        name: awspProperty.name,
        type: PROPERTY_TYPE.Spf,
        description: awspProperty.description,
        maxSize: awspProperty.maxSize,
        elementsStructure: JSON.stringify(awspProperty.elements),
      });

      entities.push(propertyDef);

      // Store mapping for foreign key resolution
      this.foreignKeyMapper.addContainerPropertyDefinitionMapping(
        awspProperty.id as NaturalId,
        systemId as SystemId,
      );
    }

    this.logger?.logInfo({
      msg: `Successfully built ${entities.length} container property definitions from AWSP with system IDs assigned`,
      action: 'awsp_container_property_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return {
      entities,
      issues: [],
    };
  }

  //TODO: Call this API during upload.
  registerNaturalIds(
    fileSystemId: number,
    subgraphs: Array<{subgraphId: number}>,
    containers: Array<{containerId: number}>,
    modules: Array<{instanceId: number}>,
  ): void {
    this.naturalIdPort.registerBatch(fileSystemId, [
      ...subgraphs.map(s => ({type: NaturalIdType.SUBGRAPH, id: s.subgraphId})),
      ...containers.map(c => ({
        type: NaturalIdType.CONTAINER,
        id: c.containerId,
      })),
      ...modules.map(m => ({
        type: NaturalIdType.MODINSTANCE,
        id: m.instanceId,
      })),
    ]);
  }
}
