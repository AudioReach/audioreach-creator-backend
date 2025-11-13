import type {Container} from '../../../../domain/entities/usecase-data/container/container.js';
import type {SpfModule} from '../../../../domain/entities/usecase-data/module/spf-module.js';
import type {ParsedAcdb} from './parsers/models/parsed-acdb.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {WorkerTask} from '../../../ports/worker/worker-types.js';
import type {EntityBuilderInput} from '../types/entity-builder.types.js';
import type {
  BaseEntityBuilder,
  EntityBuilderContext,
} from '../entity-builders/base-entity-builder.js';
import {HeaderEntityBuilder} from '../entity-builders/header-entity.builder.js';

/**
 * Container for all domain entities created from parsed chunks
 */
export class EntityModel {
  private entities = new Map<string, any>();

  addEntity(type: string, entity: any): void {
    this.entities.set(type, entity);
  }

  getEntity<T>(type: string): T | undefined {
    return this.entities.get(type) as T | undefined;
  }

  getAllEntities(): Map<string, any> {
    return new Map(this.entities);
  }

  getEntityCount(): number {
    return this.entities.size;
  }
}

export interface EntitiesReferenceIndexer {
  moduleById: Map<number, SpfModule>;
  containerById: Map<number, Container>;
}

export class EntityBuilderService {
  constructor(
    private entitiesReferenceIndexer: EntitiesReferenceIndexer,
    private readonly workerPool?: WorkerPoolPort,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build all entities from parsed data
   */
  async buildAll(parsedAcdb: ParsedAcdb, awspParsed: any): Promise<boolean> {
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
      const entityModel = await this.assembleEntities(parsedAcdb);

      // Process AWSP data if needed
      if (awspParsed) {
        // Process AWSP data here
      }

      // Process the assembled entities and populate the reference indexer
      this.processAssembledEntities(entityModel);

      const duration = Date.now() - startTime;
      this.logger?.logInfo({
        msg: `Entity building completed in ${duration}ms. Built ${entityModel.getEntityCount()} entities.`,
        action: 'build_entities_complete',
        component: 'EntityBuilderService',
        tag: 'entity-building',
        timestamp: new Date(),
      });

      return true;
    } catch (error) {
      this.logger?.logError({
        msg: 'Entity building failed',
        action: 'build_entities_failed',
        component: 'EntityBuilderService',
        tag: 'entity-building',
        error: error as Error,
        timestamp: new Date(),
      });
      return false;
    }
  }

  /**
   * Assemble domain entities from parsed chunks using hybrid approach
   * Strategy 1: Simple entities direct, complex entities with worker fallback
   */
  private async assembleEntities(parsedAcdb: ParsedAcdb): Promise<EntityModel> {
    const entityModel = new EntityModel();

    // Step 1: Discover available builders
    const builders = this.discoverAvailableBuilders();
    if (builders.length === 0) {
      this.logger?.logWarn({
        msg: 'No entity builders available, skipping entity building',
        action: 'no_builders_available',
        component: 'EntityBuilderService',
        tag: 'entity-building',
        timestamp: new Date(),
      });
      return entityModel;
    }

    // Step 2: Create and validate chunk context
    const context = this.createChunkContext(parsedAcdb);
    const validBuilders = this.validateBuilders(builders, context);

    if (validBuilders.length === 0) {
      this.logger?.logWarn({
        msg: 'No builders have required chunks available',
        action: 'no_valid_builders',
        component: 'EntityBuilderService',
        tag: 'entity-building',
        timestamp: new Date(),
      });
      return entityModel;
    }

    // Step 3: Separate simple vs complex entities
    const simpleBuilders = validBuilders.filter(builder => builder.isSimple);
    const complexBuilders = validBuilders.filter(builder => !builder.isSimple);

    this.logger?.logDebug({
      msg: `Found ${simpleBuilders.length} simple and ${complexBuilders.length} complex entity builders`,
      action: 'builders_categorized',
      component: 'EntityBuilderService',
      tag: 'entity-building',
      timestamp: new Date(),
    });

    // Step 4: Process simple entities directly (fast path)
    await this.assembleSimpleEntities(simpleBuilders, context, entityModel);

    // Step 5: Process complex entities (worker-based with fallback)
    if (complexBuilders.length > 0) {
      await this.assembleComplexEntities(complexBuilders, context, entityModel);
    }

    return entityModel;
  }

  /**
   * Discover available entity builders from registry
   */
  private discoverAvailableBuilders(): BaseEntityBuilder<any>[] {
    // For now, return the known builders. In the future, this could be
    // dynamically loaded from the registry or configuration
    return [
      new HeaderEntityBuilder(),
      // Add more builders here as they are created
    ];
  }

  /**
   * Create chunk context from parsed ACDB data
   */
  private createChunkContext(parsedAcdb: ParsedAcdb): EntityBuilderContext {
    return {
      chunks: parsedAcdb.getAllChunks(),
    };
  }

  /**
   * Validate that builders have their required chunks available
   */
  private validateBuilders(
    builders: BaseEntityBuilder<any>[],
    context: EntityBuilderContext,
  ): BaseEntityBuilder<any>[] {
    const validBuilders: BaseEntityBuilder<any>[] = [];

    for (const builder of builders) {
      const hasRequiredChunks = builder.requiredChunks.every(chunkType =>
        context.chunks.has(chunkType),
      );

      if (hasRequiredChunks) {
        validBuilders.push(builder);
        this.logger?.logDebug({
          msg: `Builder ${builder.entityType} has all required chunks: [${builder.requiredChunks.join(', ')}]`,
          action: 'builder_validated',
          component: 'EntityBuilderService',
          tag: 'entity-building',
          timestamp: new Date(),
        });
      } else {
        const missingChunks = builder.requiredChunks.filter(
          chunkType => !context.chunks.has(chunkType),
        );
        this.logger?.logDebug({
          msg: `Builder ${builder.entityType} missing required chunks: [${missingChunks.join(', ')}]`,
          action: 'builder_invalid',
          component: 'EntityBuilderService',
          tag: 'entity-building',
          timestamp: new Date(),
        });
      }
    }

    return validBuilders;
  }

  /**
   * Assemble simple entities directly (synchronous, no worker overhead)
   */
  private async assembleSimpleEntities(
    builders: BaseEntityBuilder<any>[],
    context: EntityBuilderContext,
    entityModel: EntityModel,
  ): Promise<void> {
    if (builders.length === 0) return;

    this.logger?.logDebug({
      msg: `Creating ${builders.length} simple entities directly`,
      action: 'simple_entities_start',
      component: 'EntityBuilderService',
      tag: 'entity-building',
      timestamp: new Date(),
    });

    for (const builder of builders) {
      try {
        const entity = builder.create(context);
        entityModel.addEntity(builder.entityType, entity);

        this.logger?.logDebug({
          msg: `Created simple entity: ${builder.entityType}`,
          action: 'simple_entity_created',
          component: 'EntityBuilderService',
          tag: 'entity-building',
          timestamp: new Date(),
        });
      } catch (error) {
        this.logger?.logError({
          msg: `Failed to create simple entity: ${builder.entityType}`,
          action: 'simple_entity_failed',
          component: 'EntityBuilderService',
          tag: 'entity-building',
          error: error as Error,
          timestamp: new Date(),
        });
        throw error;
      }
    }
  }

  /**
   * Assemble complex entities using workers with sequential fallback
   */
  private async assembleComplexEntities(
    builders: BaseEntityBuilder<any>[],
    context: EntityBuilderContext,
    entityModel: EntityModel,
  ): Promise<void> {
    if (builders.length === 0) return;

    const useParallel = this.shouldUseParallelAssembly(builders);

    if (useParallel) {
      try {
        await this.assembleComplexParallel(builders, context, entityModel);
        return;
      } catch (error) {
        this.logger?.logWarn({
          msg: 'Parallel assembly failed, falling back to sequential',
          action: 'parallel_fallback',
          component: 'EntityBuilderService',
          tag: 'entity-building',
          error: error as Error,
          timestamp: new Date(),
        });
      }
    }

    // Fallback to sequential assembly
    await this.assembleComplexSequential(builders, context, entityModel);
  }

  /**
   * Determine if parallel assembly should be used
   */
  private shouldUseParallelAssembly(
    builders: BaseEntityBuilder<any>[],
  ): boolean {
    return (
      this.workerPool !== undefined &&
      this.workerPool.isThreadingSupported() &&
      builders.length > 1
    );
  }

  /**
   * Assemble complex entities in parallel using worker pool
   */
  private async assembleComplexParallel(
    builders: BaseEntityBuilder<any>[],
    context: EntityBuilderContext,
    entityModel: EntityModel,
  ): Promise<void> {
    this.logger?.logDebug({
      msg: `Assembling ${builders.length} complex entities in parallel`,
      action: 'parallel_assembly_start',
      component: 'EntityBuilderService',
      tag: 'entity-building',
      timestamp: new Date(),
    });

    const tasks: WorkerTask<EntityBuilderInput>[] = builders.map(builder => ({
      handlerKey: 'buildEntity',
      input: {
        entityType: builder.entityType,
        requiredData: builder.extractRequiredData(context),
      },
    }));

    const results = await this.workerPool!.executeParallel<
      EntityBuilderInput,
      unknown,
      {entityType: string; entityData: any}
    >(tasks);

    const errors: Array<{entityType: string; error: string}> = [];
    const successfulEntities: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const builder = builders[i];

      if (!result.success || result.error) {
        errors.push({
          entityType: builder.entityType,
          error: result.error || 'Unknown error',
        });
        continue;
      }

      try {
        const assembledData = result.data!;
        entityModel.addEntity(
          assembledData.entityType,
          assembledData.entityData,
        );
        successfulEntities.push(assembledData.entityType);
      } catch (error) {
        errors.push({
          entityType: builder.entityType,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (errors.length > 0) {
      const errorSummary = errors
        .map(e => `${e.entityType}: ${e.error}`)
        .join('; ');
      this.logger?.logError({
        msg: `Failed to create ${errors.length} entities. Successful: ${successfulEntities.join(', ')}`,
        action: 'parallel_entity_creation_failed',
        component: 'EntityBuilderService',
        tag: 'entity-building',
        error: new Error(errorSummary),
        timestamp: new Date(),
      });
      throw new Error(
        `Failed to create ${errors.length} of ${builders.length} entities: ${errorSummary}`,
      );
    }

    this.logger?.logDebug({
      msg: `Successfully created ${successfulEntities.length} complex entities in parallel`,
      action: 'parallel_assembly_complete',
      component: 'EntityBuilderService',
      tag: 'entity-building',
      timestamp: new Date(),
    });
  }

  /**
   * Assemble complex entities sequentially (fallback method)
   */
  private async assembleComplexSequential(
    builders: BaseEntityBuilder<any>[],
    context: EntityBuilderContext,
    entityModel: EntityModel,
  ): Promise<void> {
    this.logger?.logDebug({
      msg: `Assembling ${builders.length} complex entities sequentially`,
      action: 'sequential_assembly_start',
      component: 'EntityBuilderService',
      tag: 'entity-building',
      timestamp: new Date(),
    });

    for (const builder of builders) {
      try {
        const entity = builder.create(context);
        entityModel.addEntity(builder.entityType, entity);

        this.logger?.logDebug({
          msg: `Created complex entity: ${builder.entityType}`,
          action: 'sequential_entity_created',
          component: 'EntityBuilderService',
          tag: 'entity-building',
          timestamp: new Date(),
        });
      } catch (error) {
        this.logger?.logError({
          msg: `Failed to create complex entity: ${builder.entityType}`,
          action: 'sequential_entity_failed',
          component: 'EntityBuilderService',
          tag: 'entity-building',
          error: error as Error,
          timestamp: new Date(),
        });
        throw error;
      }
    }
  }

  /**
   * Process assembled entities and populate the reference indexer
   */
  private processAssembledEntities(entityModel: EntityModel): void {
    // Process entities and populate the reference indexer
    const entities = entityModel.getAllEntities();

    for (const [type, entity] of entities.entries()) {
      // Process each entity based on its type
      if (
        type.includes('MODULE') &&
        this.entitiesReferenceIndexer &&
        entity.id
      ) {
        // Example: Add module to the reference indexer
        this.entitiesReferenceIndexer.moduleById.set(entity.id, entity);
      } else if (
        type.includes('CONTAINER') &&
        this.entitiesReferenceIndexer &&
        entity.id
      ) {
        // Example: Add container to the reference indexer
        this.entitiesReferenceIndexer.containerById.set(entity.id, entity);
      }

      // Use idReservationService if needed
      if (this.idReservationService && entity.needsId) {
        // Example: Reserve an ID for the entity
        //const id = this.idReservationService.reserveId(type);
        //console.log(`Reserved ID ${id} for entity type ${type}`);
      }
    }
  }
}
