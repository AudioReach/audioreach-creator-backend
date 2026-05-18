/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyDefinition} from '../../../../domain/entities/definitions/key-value/key-definition.js';
import type {SpfModuleDefinition} from '../../../../domain/entities/definitions/spf-module/spf-module-definition.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {Container} from '../../../../domain/entities/usecase-data/container/container.js';
import type {SpfModule} from '../../../../domain/entities/usecase-data/module/spf-module.js';
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
import {KeyDefinitionBuilder} from './entity-builders/key-definition-builder.js';
import {SpfModuleDefinitionBuilder} from './entity-builders/spf-module-definition-builder.js';
import {UsecaseBuilder} from './entity-builders/usecase-builder.js';
import {SubgraphBuilder} from './entity-builders/subgraph-builder.js';
import {ContainerBuilder} from './entity-builders/container-builder.js';
import {SpfModuleBuilder} from './entity-builders/spf-module-builder.js';
import {DataLinkBuilder} from './entity-builders/data-link-builder.js';
import {ControlLinkBuilder} from './entity-builders/control-link-builder.js';
import {PARSED_CHUNK_TYPES} from '../../shared/constants/chunk-types.js';
import type {UsecaseDataChunk} from '../../shared/acdb-chunks/usecase-data-chunk.js';
import type {SubgraphDataChunk} from '../../shared/acdb-chunks/subgraph-data-chunk.js';
import type {SubgraphPairDataChunk} from '../../shared/acdb-chunks/subgraph-pair-data-chunk.js';
import type {
  DataLink as DataLinkProperty,
  ControlLink as ControlLinkProperty,
} from '../../shared/acdb-chunks/spf-properties/types.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {ForeignKeyMapper} from './foreign-key-mapper.js';
import type {DynamicControlPortInfo} from './entity-builders/spf-module-builder.js';
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
  private spfModuleDefinitionBuilder: SpfModuleDefinitionBuilder;
  private subgraphBuilder: SubgraphBuilder;
  private containerBuilder: ContainerBuilder;
  private spfModuleBuilder: SpfModuleBuilder;
  private dataLinkBuilder: DataLinkBuilder;
  private controlLinkBuilder: ControlLinkBuilder;

  constructor(
    private readonly idGenerator: IdGenerationPort,
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
    this.spfModuleDefinitionBuilder = new SpfModuleDefinitionBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      this.workerPool,
      this.logger,
    );
    this.subgraphBuilder = new SubgraphBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
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
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Extract subgraph properties from SPF data
    const subgraphs = subgraphDataChunk.getAllSubgraphs();

    if (!subgraphs || subgraphs.length === 0) {
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Build domain subgraphs with system IDs assigned
    const result = await this.subgraphBuilder.buildSubgraphs(
      subgraphs,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} subgraphs from ACDB with system IDs assigned (${result.successCount} successful, ${result.errorCount} errors, ${result.warningCount} warnings)`,
      action: 'acdb_subgraphs_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return result;
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
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Extract container properties from SPF data (deduplicated)
    const containers = subgraphDataChunk.getAllContainers();

    if (!containers || containers.length === 0) {
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Build domain containers with system IDs assigned
    const result = await this.containerBuilder.buildContainers(
      containers,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} containers from ACDB with system IDs assigned (${result.successCount} successful, ${result.errorCount} errors, ${result.warningCount} warnings)`,
      action: 'acdb_containers_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Analyze control links to determine dynamic control port usage per module
   */
  private analyzeDynamicControlPorts(
    parsedAcdb: ParsedAcdb,
  ): DynamicControlPortInfo {
    const allControlLinks = this.collectAllControlLinks(parsedAcdb);
    const maxDynamicPortIdPerModule =
      this.analyzeControlLinkPorts(allControlLinks);

    this.logDynamicPortAnalysisResults(
      allControlLinks.length,
      maxDynamicPortIdPerModule.size,
    );

    return {maxDynamicPortIdPerModule};
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
   * Analyze control links to find max dynamic port ID per module
   */
  private analyzeControlLinkPorts(
    links: ControlLinkProperty[],
  ): Map<number, number> {
    const DYNAMIC_CONTROL_PORT_ID_START = 0x80_00_00_00;
    const maxDynamicPortIdPerModule = new Map<number, number>();

    for (const link of links) {
      this.updateMaxPortIdIfDynamic(
        link.peer1InstanceId,
        link.peer1PortId,
        maxDynamicPortIdPerModule,
        DYNAMIC_CONTROL_PORT_ID_START,
      );
      this.updateMaxPortIdIfDynamic(
        link.peer2InstanceId,
        link.peer2PortId,
        maxDynamicPortIdPerModule,
        DYNAMIC_CONTROL_PORT_ID_START,
      );
    }

    return maxDynamicPortIdPerModule;
  }

  /**
   * Update max port ID for a module instance if the port is dynamic
   */
  private updateMaxPortIdIfDynamic(
    instanceId: number,
    portId: number,
    maxPortIdMap: Map<number, number>,
    dynamicPortThreshold: number,
  ): void {
    if (portId < dynamicPortThreshold) {
      return;
    }

    const currentMax = maxPortIdMap.get(instanceId) || 0;
    if (portId > currentMax) {
      maxPortIdMap.set(instanceId, portId);
    }
  }

  /**
   * Log the results of dynamic port analysis
   */
  private logDynamicPortAnalysisResults(
    totalLinks: number,
    modulesWithDynamicPorts: number,
  ): void {
    this.logger?.logInfo({
      msg: `Analyzed ${totalLinks} control links, found ${modulesWithDynamicPorts} modules with dynamic control ports`,
      action: 'dynamic_control_ports_analyzed',
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
    parsedAwsp?: ParsedAwsp,
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
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Extract module instance info from SPF data
    const spfModuleInfos = subgraphDataChunk.getAllModules();

    if (!spfModuleInfos || spfModuleInfos.length === 0) {
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Extract module properties from SPF data
    const modulePropertyConfigs = subgraphDataChunk.getAllModuleProperties();

    // Get SPF module definitions from ParsedAwsp for display names
    const spfModuleDefinitions = parsedAwsp?.getSpfModuleDefinitions() || [];

    // Get port strategy from configuration (required)
    const configuration = parsedAwsp?.getConfiguration();
    if (!configuration?.portStrategy) {
      throw new Error(
        'Port strategy not found in configuration. Please ensure configuration.json exists in the AWSP file with a valid portStrategy.',
      );
    }

    const portStrategy = configuration.portStrategy;

    // Analyze control links to determine dynamic control port usage
    const dynamicControlPortInfo = this.analyzeDynamicControlPorts(parsedAcdb);

    // Build domain SPF modules with module properties, definitions, calibration data, and system IDs assigned
    const result = await this.spfModuleBuilder.buildSpfModules(
      spfModuleInfos,
      fileSystemId,
      portStrategy,
      modulePropertyConfigs,
      spfModuleDefinitions,
      dynamicControlPortInfo,
      parsedAcdb, // Pass parsedAcdb for calibration data attachment
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.entities.length} SPF modules from ACDB with system IDs and calibration data assigned (${result.successCount} successful, ${result.errorCount} errors, ${result.warningCount} warnings)`,
      action: 'acdb_spf_modules_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return result;
  }

  /**
   * Build data links from ACDB data with system IDs assigned
   * Includes both intra-subgraph links (from SubgraphDataChunk) and inter-subgraph links (from SubgraphPairDataChunk)
   */
  async buildDataLinks(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
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
  ): Promise<UseCase[]> {
    // Extract usecase data from ACDB
    const usecaseChunk = parsedAcdb.getChunk<UsecaseDataChunk>(
      PARSED_CHUNK_TYPES.USECASE_DATA,
    );

    if (!usecaseChunk?.usecases || usecaseChunk.usecases.length === 0) {
      return [];
    }

    // Create usecase builder with parsed ACDB data
    const usecaseBuilder = new UsecaseBuilder(
      this.idGenerator,
      this.foreignKeyMapper,
      parsedAcdb,
      this.logger,
    );

    // Build domain usecases with system IDs assigned
    const usecases = await usecaseBuilder.buildUsecases(
      usecaseChunk.usecases,
      fileSystemId,
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
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Build domain key definitions with system IDs assigned
    const result = await this.keyDefinitionBuilder.buildKeyDefinitions(
      awspKeyDefinitions,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.successCount} key definitions from AWSP with system IDs assigned, ${result.errorCount} failures`,
      action: 'awsp_key_definitions_complete',
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
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
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
      successCount: entities.length,
      errorCount: 0,
      warningCount: 0,
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
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
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
      successCount: entities.length,
      errorCount: 0,
      warningCount: 0,
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
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
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
      successCount: entities.length,
      errorCount: 0,
      warningCount: 0,
    };
  }

  /**
   * Build SPF module definitions from AWSP data with system IDs assigned
   * @param parsedAwsp - Parsed AWSP data
   * @param fileSystemId - File system ID for the module definitions
   */
  async buildSpfModuleDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<BuildResult<SpfModuleDefinition>> {
    // Extract SPF module definitions from AWSP
    const awspModuleDefinitions = parsedAwsp.getSpfModuleDefinitions();

    if (!awspModuleDefinitions || awspModuleDefinitions.length === 0) {
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    // Build domain SPF module definitions with system IDs assigned
    const result = await this.spfModuleDefinitionBuilder.buildModuleDefinitions(
      awspModuleDefinitions,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${result.successCount} SPF module definitions from AWSP with system IDs assigned, ${result.errorCount} failures`,
      action: 'awsp_spf_module_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return result;
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
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
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
      successCount: entities.length,
      errorCount: 0,
      warningCount: 0,
    };
  }
}
