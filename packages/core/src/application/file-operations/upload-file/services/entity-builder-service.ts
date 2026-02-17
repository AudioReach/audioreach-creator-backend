/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyDefinition} from '../../../../domain/entities/definitions/key-value/aggregate/key-definition.js';
import type {SpfModuleDefinition} from '../../../../domain/entities/definitions/spf-module/aggregate/spf-module-definitions.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {Container} from '../../../../domain/entities/usecase-data/container/container.js';
import type {SpfModule} from '../../../../domain/entities/usecase-data/module/spf-module.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import type {ParsedAcdb} from '../models/parsed-acdb.js';
import type {ParsedAwsp} from '../models/parsed-awsp.js';
import {KeyDefinitionBuilder} from './entity-builders/key-definition-builder.js';
import {SpfModuleDefinitionBuilder} from './entity-builders/spf-module-definition-builder.js';
import {UsecaseBuilder} from './entity-builders/usecase-builder.js';
import {SubgraphBuilder} from './entity-builders/subgraph-builder.js';
import {ContainerBuilder} from './entity-builders/container-builder.js';
import {SpfModuleBuilder} from './entity-builders/spf-module-builder.js';
import {DataLinkBuilder} from './entity-builders/data-link-builder.js';
import {ControlLinkBuilder} from './entity-builders/control-link-builder.js';
import {CHUNK_TYPES} from '../../shared/constants/chunk-types.js';
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
    readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {
    this.keyDefinitionBuilder = new KeyDefinitionBuilder(
      this.workerPool,
      this.logger,
    );
    this.spfModuleDefinitionBuilder = new SpfModuleDefinitionBuilder(
      this.workerPool,
      this.logger,
    );
    this.subgraphBuilder = new SubgraphBuilder(this.logger);
    this.containerBuilder = new ContainerBuilder(this.logger);
    this.spfModuleBuilder = new SpfModuleBuilder(
      this.foreignKeyMapper,
      this.logger,
    );
    this.dataLinkBuilder = new DataLinkBuilder(
      this.foreignKeyMapper,
      this.logger,
    );
    this.controlLinkBuilder = new ControlLinkBuilder(
      this.foreignKeyMapper,
      this.logger,
    );
  }

  /**
   * Build subgraphs from ACDB data
   */
  buildSubgraphs(parsedAcdb: ParsedAcdb, fileSystemId: number): Subgraph[] {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logError({
        msg: 'No subgraph data chunk found in ACDB data',
        action: 'no_subgraph_data_chunk',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return [];
    }

    // Extract subgraph properties from SPF data
    const subgraphProperties = subgraphDataChunk.getAllSubgraphs();

    if (!subgraphProperties || subgraphProperties.length === 0) {
      return [];
    }

    // Build domain subgraphs
    const subgraphs = this.subgraphBuilder.buildSubgraphs(
      subgraphProperties,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${subgraphs.length} subgraphs from ACDB`,
      action: 'acdb_subgraphs_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return subgraphs;
  }

  /**
   * Build containers from ACDB data
   */
  buildContainers(parsedAcdb: ParsedAcdb, fileSystemId: number): Container[] {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logError({
        msg: 'No subgraph data chunk found for containers',
        action: 'no_subgraph_data_chunk_containers',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return [];
    }

    // Extract container properties from SPF data (deduplicated)
    const containerProperties = subgraphDataChunk.getAllContainers();

    if (!containerProperties || containerProperties.length === 0) {
      return [];
    }

    // Build domain containers
    const containers = this.containerBuilder.buildContainers(
      containerProperties,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${containers.length} containers from ACDB`,
      action: 'acdb_containers_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return containers;
  }

  /**
   * Build SPF modules from ACDB data
   */
  buildSpfModules(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
    parsedAwsp?: ParsedAwsp,
  ): SpfModule[] {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logError({
        msg: 'No subgraph data chunk found for modules',
        action: 'no_subgraph_data_chunk_modules',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return [];
    }

    // Extract module instance info from SPF data
    const moduleInstanceInfos = subgraphDataChunk.getAllModules();

    if (!moduleInstanceInfos || moduleInstanceInfos.length === 0) {
      return [];
    }

    // Extract module properties from SPF data
    const modulePropertyConfigs = subgraphDataChunk.getAllModuleProperties();

    // Get SPF module definitions from ParsedAwsp for display names
    const spfModuleDefinitions = parsedAwsp?.getSpfModuleDefinitions() || [];

    // Build domain SPF modules with module properties and definitions
    const spfModules = this.spfModuleBuilder.buildSpfModules(
      moduleInstanceInfos,
      fileSystemId,
      modulePropertyConfigs,
      spfModuleDefinitions,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${spfModules.length} SPF modules from ACDB`,
      action: 'acdb_spf_modules_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return spfModules;
  }

  /**
   * Build data links from ACDB data
   * Includes both intra-subgraph links (from SubgraphDataChunk) and inter-subgraph links (from SubgraphPairDataChunk)
   */
  buildDataLinks(parsedAcdb: ParsedAcdb, fileSystemId: number): DataLink[] {
    const allDataLinkProperties: DataLinkProperty[] = [];
    let intraSubgraphCount = 0;
    let interSubgraphCount = 0;

    // 1. Extract intra-subgraph data links from SubgraphDataChunk
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
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
      CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT,
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

    // 4. Build domain data links from all sources
    const dataLinks = this.dataLinkBuilder.buildDataLinks(
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
   * Build control links from ACDB data
   * Includes both intra-subgraph links (from SubgraphDataChunk) and inter-subgraph links (from SubgraphPairDataChunk)
   */
  buildControlLinks(parsedAcdb: ParsedAcdb): ControlLink[] {
    const allControlLinkProperties: ControlLinkProperty[] = [];
    let intraSubgraphCount = 0;
    let interSubgraphCount = 0;

    // 1. Extract intra-subgraph control links from SubgraphDataChunk
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
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
      CHUNK_TYPES.SUBGRAPH_CONNECTION_LUT,
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
      return [];
    }

    // 4. Build domain control links from all sources
    const controlLinks = this.controlLinkBuilder.buildControlLinks(
      allControlLinkProperties,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${controlLinks.length} control links from ACDB (${intraSubgraphCount} intra-subgraph, ${interSubgraphCount} inter-subgraph)`,
      action: 'acdb_control_links_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return controlLinks;
  }

  /**
   * Build usecases from ACDB data
   */
  buildUsecases(parsedAcdb: ParsedAcdb, fileSystemId: number): UseCase[] {
    // Extract usecase data from ACDB
    const usecaseChunk = parsedAcdb.getChunk<UsecaseDataChunk>(
      CHUNK_TYPES.GKV_TABLE,
    );

    if (!usecaseChunk?.usecases || usecaseChunk.usecases.length === 0) {
      return [];
    }

    // Create usecase builder with parsed ACDB data
    const usecaseBuilder = new UsecaseBuilder(
      this.foreignKeyMapper,
      parsedAcdb,
      this.logger,
    );

    // Build domain usecases
    const usecases = usecaseBuilder.buildUsecases(
      usecaseChunk.usecases,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${usecases.length} usecases from ACDB`,
      action: 'acdb_usecases_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return usecases;
  }

  /**
   * Build key definitions from AWSP data
   */
  async buildKeyDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<KeyDefinition[]> {
    // Extract key definitions from AWSP
    const awspKeyDefinitions = parsedAwsp.getKeyDefinitions();

    if (!awspKeyDefinitions || awspKeyDefinitions.length === 0) {
      return [];
    }

    // Build domain key definitions
    const keyDefinitions = await this.keyDefinitionBuilder.buildKeyDefinitions(
      awspKeyDefinitions,
      fileSystemId,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${keyDefinitions.length} key definitions from AWSP`,
      action: 'awsp_key_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return keyDefinitions;
  }

  /**
   * Build SPF module definitions from AWSP data
   */
  async buildSpfModuleDefinitions(
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<SpfModuleDefinition[]> {
    // Extract SPF module definitions from AWSP
    const awspModuleDefinitions = parsedAwsp.getSpfModuleDefinitions();

    if (!awspModuleDefinitions || awspModuleDefinitions.length === 0) {
      return [];
    }

    // Build domain SPF module definitions
    const moduleDefinitions =
      await this.spfModuleDefinitionBuilder.buildModuleDefinitions(
        awspModuleDefinitions,
        fileSystemId,
      );

    this.logger?.logInfo({
      msg: `Successfully built ${moduleDefinitions.length} SPF module definitions from AWSP`,
      action: 'awsp_spf_module_definitions_complete',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    return moduleDefinitions;
  }
}
