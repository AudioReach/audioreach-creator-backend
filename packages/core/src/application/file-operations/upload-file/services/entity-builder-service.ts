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
    this.usecaseBuilder = new UsecaseBuilder(
      this.foreignKeyMapper,
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
  async buildSubgraphs(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<Subgraph[]> {
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
      return [];
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
      return [];
    }

    // Build domain subgraphs
    const subgraphs = await this.subgraphBuilder.buildSubgraphs(
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
  async buildContainers(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<Container[]> {
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
      return [];
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
      return [];
    }

    // Build domain containers
    const containers = await this.containerBuilder.buildContainers(
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
  async buildSpfModules(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<SpfModule[]> {
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
      return [];
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
      return [];
    }

    // Build domain SPF modules
    const spfModules = await this.spfModuleBuilder.buildSpfModules(
      moduleInstanceInfos,
      fileSystemId,
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
   */
  async buildDataLinks(parsedAcdb: ParsedAcdb): Promise<DataLink[]> {
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
      return [];
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
      return [];
    }

    // Build domain data links
    const dataLinks =
      await this.dataLinkBuilder.buildDataLinks(dataLinkProperties);

    this.logger?.logInfo({
      msg: `Successfully built ${dataLinks.length} data links from ACDB`,
      action: 'acdb_data_links_complete',
      component: 'EntityBuilderService',
      tag: 'acdb-processing',
      timestamp: new Date(),
    });

    return dataLinks;
  }

  /**
   * Build control links from ACDB data
   */
  async buildControlLinks(parsedAcdb: ParsedAcdb): Promise<ControlLink[]> {
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
      return [];
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
      return [];
    }

    // Build domain control links
    const controlLinks = await this.controlLinkBuilder.buildControlLinks(
      controlLinkProperties,
    );

    this.logger?.logInfo({
      msg: `Successfully built ${controlLinks.length} control links from ACDB`,
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
  async buildUsecases(
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<UseCase[]> {
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
      return [];
    }

    // Build domain usecases
    const usecases = await this.usecaseBuilder.buildUsecases(
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
  async buildKeyDefinitions(parsedAwsp: ParsedAwsp): Promise<KeyDefinition[]> {
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
      return [];
    }

    // Build domain key definitions
    const keyDefinitions =
      await this.keyDefinitionBuilder.buildKeyDefinitions(awspKeyDefinitions);

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
  ): Promise<SpfModuleDefinition[]> {
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
      return [];
    }

    // Build domain SPF module definitions
    const moduleDefinitions =
      await this.spfModuleDefinitionBuilder.buildModuleDefinitions(
        awspModuleDefinitions,
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
