import type {KeyDefinition} from '../../../../domain/entities/definitions/key-value/aggregate/key-definition.js';
import type {SpfModuleDefinition} from '../../../../domain/entities/definitions/spf-module/aggregate/spf-module-definitions.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
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
  private entities = new Map<string, any>();

  addEntity(type: EntityModelKey | string, entity: any): void {
    this.entities.set(type, entity);
  }

  getEntity<T>(type: EntityModelKey | string): T | undefined {
    return this.entities.get(type) as T | undefined;
  }

  getAllEntities(): Map<string, any> {
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
  private usecaseBuilder: UsecaseBuilder;
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
    this.usecaseBuilder = new UsecaseBuilder(foreignKeyMapper, this.logger);
    this.subgraphBuilder = new SubgraphBuilder(this.logger);
    this.containerBuilder = new ContainerBuilder(this.logger);
    this.spfModuleBuilder = new SpfModuleBuilder(foreignKeyMapper, this.logger);
    this.dataLinkBuilder = new DataLinkBuilder(foreignKeyMapper, this.logger);
    this.controlLinkBuilder = new ControlLinkBuilder(
      foreignKeyMapper,
      this.logger,
    );
  }

  /**
   * Build all entities from parsed data using direct processing
   */
  async buildAll(
    parsedAcdb: ParsedAcdb,
    parsedAwsp: ParsedAwsp,
    fileSystemId: number,
  ): Promise<{success: boolean; entityModel: EntityModel}> {
    const startTime = Date.now();

    this.logger?.logInfo({
      msg: 'Entity building started',
      action: 'build_entities_start',
      component: 'EntityBuilderService',
      tag: 'entity-building',
      timestamp: new Date(),
    });

    try {
      // Create entity model to store assembled entities
      const entityModel = new EntityModel();

      // Process ACDB data directly (similar to AWSP processing)
      await this.processAcdbData(parsedAcdb, entityModel, fileSystemId);

      // Process AWSP data if needed
      if (parsedAwsp) {
        await this.processAwspData(parsedAwsp, entityModel);
      }

      const duration = Date.now() - startTime;
      this.logger?.logInfo({
        msg: `Entity building completed in ${duration}ms. Built ${entityModel.getEntityCount()} entities.`,
        action: 'build_entities_complete',
        component: 'EntityBuilderService',
        tag: 'entity-building',
        timestamp: new Date(),
      });

      return {success: true, entityModel};
    } catch (error) {
      this.logger?.logError({
        msg: 'Entity building failed',
        action: 'build_entities_failed',
        component: 'EntityBuilderService',
        tag: 'entity-building',
        error: error as Error,
        timestamp: new Date(),
      });
      return {success: false, entityModel: new EntityModel()};
    }
  }

  /**
   * Process ACDB data in hierarchical dependency order:
   * 1. Subgraphs (no dependencies)
   * 2. Containers (no dependencies)
   * 3. Modules (depend on subgraphs, containers, definitions)
   * 4. Data Links (depend on modules)
   * 5. Control Links (depend on modules)
   * 6. Usecases (final processing)
   */
  private async processAcdbData(
    parsedAcdb: ParsedAcdb,
    entityModel: EntityModel,
    fileSystemId: number,
  ): Promise<void> {
    this.logger?.logDebug({
      msg: 'Processing ACDB data in hierarchical order',
      action: 'acdb_processing_start',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    try {
      // 1. Process subgraphs first (no dependencies)
      await this.processAcdbSubgraphs(parsedAcdb, entityModel, fileSystemId);

      // 2. Process containers (no dependencies)
      await this.processAcdbContainers(parsedAcdb, entityModel, fileSystemId);

      // 3. Process modules (depend on subgraphs, containers, definitions)
      await this.processAcdbModules(parsedAcdb, entityModel, fileSystemId);

      // 4. Process data links (depend on modules)
      await this.processAcdbDataLinks(parsedAcdb, entityModel);

      // 5. Process control links (depend on modules)
      await this.processAcdbControlLinks(parsedAcdb, entityModel);

      // 6. Process usecases last
      await this.processAcdbUsecases(parsedAcdb, entityModel, fileSystemId);
    } catch (error) {
      this.logger?.logError({
        msg: 'Failed to process ACDB data',
        action: 'acdb_processing_failed',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        error: error as Error,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Process ACDB subgraphs from SubgraphDataChunk
   */
  private async processAcdbSubgraphs(
    parsedAcdb: ParsedAcdb,
    entityModel: EntityModel,
    fileSystemId: number,
  ): Promise<void> {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logDebug({
        msg: 'No subgraph data chunk found in ACDB data',
        action: 'no_subgraph_data_chunk',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Extract subgraph properties from SPF data
    const subgraphProperties = subgraphDataChunk.getAllSubgraphs();

    if (!subgraphProperties || subgraphProperties.length === 0) {
      this.logger?.logDebug({
        msg: 'No subgraphs found in subgraph data chunk',
        action: 'no_subgraphs',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Build domain subgraphs
    const subgraphs = await this.subgraphBuilder.buildSubgraphs(
      subgraphProperties,
      fileSystemId,
    );

    // Add subgraphs to entity model
    if (subgraphs.length > 0) {
      entityModel.addEntity(ENTITY_MODEL_KEYS.SUBGRAPHS, subgraphs);

      this.logger?.logInfo({
        msg: `Successfully processed ${subgraphs.length} subgraphs from ACDB`,
        action: 'acdb_subgraphs_complete',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Process ACDB containers from SubgraphDataChunk
   */
  private async processAcdbContainers(
    parsedAcdb: ParsedAcdb,
    entityModel: EntityModel,
    fileSystemId: number,
  ): Promise<void> {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logDebug({
        msg: 'No subgraph data chunk found for containers',
        action: 'no_subgraph_data_chunk_containers',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Extract container properties from SPF data (deduplicated)
    const containerProperties = subgraphDataChunk.getAllContainers();

    if (!containerProperties || containerProperties.length === 0) {
      this.logger?.logDebug({
        msg: 'No containers found in subgraph data chunk',
        action: 'no_containers',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Build domain containers
    const containers = await this.containerBuilder.buildContainers(
      containerProperties,
      fileSystemId,
    );

    // Add containers to entity model
    if (containers.length > 0) {
      entityModel.addEntity(ENTITY_MODEL_KEYS.CONTAINERS, containers);

      this.logger?.logInfo({
        msg: `Successfully processed ${containers.length} containers from ACDB`,
        action: 'acdb_containers_complete',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Process ACDB modules from SubgraphDataChunk
   */
  private async processAcdbModules(
    parsedAcdb: ParsedAcdb,
    entityModel: EntityModel,
    fileSystemId: number,
  ): Promise<void> {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logDebug({
        msg: 'No subgraph data chunk found for modules',
        action: 'no_subgraph_data_chunk_modules',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Extract module instance info from SPF data
    const moduleInstanceInfos = subgraphDataChunk.getAllModules();

    if (!moduleInstanceInfos || moduleInstanceInfos.length === 0) {
      this.logger?.logDebug({
        msg: 'No modules found in subgraph data chunk',
        action: 'no_modules',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Build domain SPF modules
    const spfModules = await this.spfModuleBuilder.buildSpfModules(
      moduleInstanceInfos,
      fileSystemId,
    );

    // Add SPF modules to entity model
    if (spfModules.length > 0) {
      entityModel.addEntity(ENTITY_MODEL_KEYS.SPF_MODULES, spfModules);

      this.logger?.logInfo({
        msg: `Successfully processed ${spfModules.length} SPF modules from ACDB`,
        action: 'acdb_spf_modules_complete',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Process ACDB data links from SubgraphDataChunk
   */
  private async processAcdbDataLinks(
    parsedAcdb: ParsedAcdb,
    entityModel: EntityModel,
  ): Promise<void> {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logDebug({
        msg: 'No subgraph data chunk found for data links',
        action: 'no_subgraph_data_chunk_data_links',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Extract data link properties from SPF data
    const dataLinkProperties = subgraphDataChunk.getAllDataLinks();

    if (!dataLinkProperties || dataLinkProperties.length === 0) {
      this.logger?.logDebug({
        msg: 'No data links found in subgraph data chunk',
        action: 'no_data_links',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Build domain data links
    const dataLinks =
      await this.dataLinkBuilder.buildDataLinks(dataLinkProperties);

    // Add data links to entity model
    if (dataLinks.length > 0) {
      entityModel.addEntity(ENTITY_MODEL_KEYS.DATA_LINKS, dataLinks);

      this.logger?.logInfo({
        msg: `Successfully processed ${dataLinks.length} data links from ACDB`,
        action: 'acdb_data_links_complete',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Process ACDB control links from SubgraphDataChunk
   */
  private async processAcdbControlLinks(
    parsedAcdb: ParsedAcdb,
    entityModel: EntityModel,
  ): Promise<void> {
    // Extract subgraph data from ACDB
    const subgraphDataChunk = parsedAcdb.getChunk<SubgraphDataChunk>(
      CHUNK_TYPES.SUBGRAPH_DATA,
    );

    if (!subgraphDataChunk) {
      this.logger?.logDebug({
        msg: 'No subgraph data chunk found for control links',
        action: 'no_subgraph_data_chunk_control_links',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Extract control link properties from SPF data
    const controlLinkProperties = subgraphDataChunk.getAllControlLinks();

    if (!controlLinkProperties || controlLinkProperties.length === 0) {
      this.logger?.logDebug({
        msg: 'No control links found in subgraph data chunk',
        action: 'no_control_links',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Build domain control links
    const controlLinks = await this.controlLinkBuilder.buildControlLinks(
      controlLinkProperties,
    );

    // Add control links to entity model
    if (controlLinks.length > 0) {
      entityModel.addEntity(ENTITY_MODEL_KEYS.CONTROL_LINKS, controlLinks);

      this.logger?.logInfo({
        msg: `Successfully processed ${controlLinks.length} control links from ACDB`,
        action: 'acdb_control_links_complete',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Process ACDB usecases
   */
  private async processAcdbUsecases(
    parsedAcdb: ParsedAcdb,
    entityModel: EntityModel,
    fileSystemId: number,
  ): Promise<void> {
    // Extract usecase data from ACDB
    const usecaseChunk = parsedAcdb.getChunk<UsecaseDataChunk>(
      CHUNK_TYPES.GKV_TABLE,
    );

    if (!usecaseChunk?.usecases || usecaseChunk.usecases.length === 0) {
      this.logger?.logDebug({
        msg: 'No usecases found in ACDB data',
        action: 'no_usecases',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Build domain usecases
    const usecases = await this.usecaseBuilder.buildUsecases(
      usecaseChunk.usecases,
      fileSystemId,
    );

    // Add usecases to entity model
    if (usecases.length > 0) {
      entityModel.addEntity(ENTITY_MODEL_KEYS.USECASES, usecases);

      this.logger?.logInfo({
        msg: `Successfully processed ${usecases.length} usecases from ACDB`,
        action: 'acdb_usecases_complete',
        component: 'EntityBuilderService',
        tag: 'acdb-processing',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Process AWSP data and build key definitions and SPF module definitions
   */
  private async processAwspData(
    parsedAwsp: ParsedAwsp,
    entityModel: EntityModel,
  ): Promise<void> {
    this.logger?.logDebug({
      msg: 'Processing AWSP data for definitions',
      action: 'awsp_processing_start',
      component: 'EntityBuilderService',
      tag: 'awsp-processing',
      timestamp: new Date(),
    });

    try {
      // Process key definitions
      await this.processAwspKeyDefinitions(parsedAwsp, entityModel);

      // Process SPF module definitions
      await this.processAwspModuleDefinitions(parsedAwsp, entityModel);
    } catch (error) {
      this.logger?.logError({
        msg: 'Failed to process AWSP data',
        action: 'awsp_processing_failed',
        component: 'EntityBuilderService',
        tag: 'awsp-processing',
        error: error as Error,
        timestamp: new Date(),
      });
      throw error;
    }
  }

  /**
   * Process AWSP key definitions
   */
  private async processAwspKeyDefinitions(
    parsedAwsp: ParsedAwsp,
    entityModel: EntityModel,
  ): Promise<void> {
    // Extract key definitions from AWSP
    const awspKeyDefinitions = parsedAwsp.getKeyDefinitions();

    if (!awspKeyDefinitions || awspKeyDefinitions.length === 0) {
      this.logger?.logDebug({
        msg: 'No key definitions found in AWSP data',
        action: 'no_key_definitions',
        component: 'EntityBuilderService',
        tag: 'awsp-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Build domain key definitions
    const keyDefinitions =
      await this.keyDefinitionBuilder.buildKeyDefinitions(awspKeyDefinitions);

    // Add key definitions to entity model
    if (keyDefinitions.length > 0) {
      entityModel.addEntity(ENTITY_MODEL_KEYS.KEY_DEFINITIONS, keyDefinitions);

      this.logger?.logInfo({
        msg: `Successfully processed ${keyDefinitions.length} key definitions from AWSP`,
        action: 'awsp_key_definitions_complete',
        component: 'EntityBuilderService',
        tag: 'awsp-processing',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Process AWSP SPF module definitions
   */
  private async processAwspModuleDefinitions(
    parsedAwsp: ParsedAwsp,
    entityModel: EntityModel,
  ): Promise<void> {
    // Extract SPF module definitions from AWSP
    const awspModuleDefinitions = parsedAwsp.getSpfModuleDefinitions();

    if (!awspModuleDefinitions || awspModuleDefinitions.length === 0) {
      this.logger?.logDebug({
        msg: 'No SPF module definitions found in AWSP data',
        action: 'no_spf_module_definitions',
        component: 'EntityBuilderService',
        tag: 'awsp-processing',
        timestamp: new Date(),
      });
      return;
    }

    // Build domain SPF module definitions
    const moduleDefinitions =
      await this.spfModuleDefinitionBuilder.buildModuleDefinitions(
        awspModuleDefinitions,
      );

    // Add SPF module definitions to entity model
    if (moduleDefinitions.length > 0) {
      entityModel.addEntity(
        ENTITY_MODEL_KEYS.SPF_MODULE_DEFINITIONS,
        moduleDefinitions,
      );

      this.logger?.logInfo({
        msg: `Successfully processed ${moduleDefinitions.length} SPF module definitions from AWSP`,
        action: 'awsp_spf_module_definitions_complete',
        component: 'EntityBuilderService',
        tag: 'awsp-processing',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Get built key definitions from entity model
   */
  getBuiltKeyDefinitions(entityModel: EntityModel): KeyDefinition[] {
    return (
      entityModel.getEntity<KeyDefinition[]>(
        ENTITY_MODEL_KEYS.KEY_DEFINITIONS,
      ) || []
    );
  }

  /**
   * Get built SPF module definitions from entity model
   */
  getBuiltSpfModuleDefinitions(
    entityModel: EntityModel,
  ): SpfModuleDefinition[] {
    return (
      entityModel.getEntity<SpfModuleDefinition[]>(
        ENTITY_MODEL_KEYS.SPF_MODULE_DEFINITIONS,
      ) || []
    );
  }

  /**
   * Get built usecases from entity model
   */
  getBuiltUsecases(entityModel: EntityModel): UseCase[] {
    return entityModel.getEntity<UseCase[]>(ENTITY_MODEL_KEYS.USECASES) || [];
  }
}
