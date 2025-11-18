import type {UnitOfWork} from 'application/ports/persistence/unit-of-work.js';
import {
  EntityBuilderService,
  EntityModel,
  ENTITY_MODEL_KEYS,
} from './entity-builder-service.js';
import type {KeyDefinition} from '../../../../domain/entities/definitions/key-value/aggregate/key-definition.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {Container} from '../../../../domain/entities/usecase-data/container/container.js';
import type {SpfModule} from '../../../../domain/entities/usecase-data/module/spf-module.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import {ForeignKeyMapper} from './foreign-key-mapper.js';
//import type {SpfModuleDefinition} from '../../../../domain/entities/definitions/spf-module/aggregate/spf-module-definitions.js';
import {AcdbFileOrchestrator} from './acdb-file-orchestrator.js';
import {AwspFileOrchestrator} from './awsp-file-orchestrator.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {PathRef} from '../../shared/utils/file-ref.js';
import type {FileReaderPort} from '../../../ports/file-system/file-reader.port.js';
import type {ProfilerPort} from '../../../ports/profiling/profiler.port.js';
import {
  PROFILER_OPERATIONS,
  MEMORY_SNAPSHOTS,
  type PerformanceMetrics,
  type MemorySnapshot,
} from '../../../../shared/profiling/profiler-types.js';

export class UploadFileOrchestrator {
  private builderService: EntityBuilderService;
  private acdbParser: AcdbFileOrchestrator;
  private awspParser: AwspFileOrchestrator;
  private foreignKeyMapper: ForeignKeyMapper;

  // Storage for built entities
  private entityModel: EntityModel | null = null;

  /* -------------------------------------*/

  constructor(
    private filereader: FileReaderPort,
    private uow: UnitOfWork,
    workerPool?: WorkerPoolPort,
    private logger?: Logger,
    private profiler?: ProfilerPort,
  ) {
    // Pass worker pool to both services
    this.foreignKeyMapper = new ForeignKeyMapper(logger);
    this.builderService = new EntityBuilderService(
      this.foreignKeyMapper,
      workerPool,
      logger,
    );

    this.acdbParser = new AcdbFileOrchestrator(
      this.filereader,
      //workerPool,
      logger,
    );

    this.acdbParser = new AcdbFileOrchestrator(
      this.filereader,
      //workerPool,
      logger,
    );
    this.awspParser = new AwspFileOrchestrator(
      this.filereader,
      workerPool,
      logger,
    );
  }

  /**
   * Log performance metrics from profiler operations
   */
  private async logPerformanceMetrics(
    metrics: PerformanceMetrics | undefined,
  ): Promise<void> {
    if (!metrics) return;

    const memoryDelta =
      metrics.endMemory.heapUsed - metrics.startMemory.heapUsed;
    const memoryDeltaMB = (memoryDelta / 1024 / 1024).toFixed(2);

    await this.logger?.logInfo({
      msg: `Performance: ${metrics.operation} completed in ${metrics.duration.toFixed(2)}ms (memory delta: ${memoryDeltaMB}MB)`,
      timestamp: new Date(),
      action: 'performance-monitoring',
      component: 'UploadFileOrchestrator',
      tag: 'profiling-metrics',
    });
  }

  /**
   * Log memory snapshots from profiler
   */
  private async logMemorySnapshot(
    snapshot: MemorySnapshot | undefined,
  ): Promise<void> {
    if (!snapshot) return;

    const heapUsedMB = (snapshot.memory.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (snapshot.memory.heapTotal / 1024 / 1024).toFixed(2);

    await this.logger?.logInfo({
      msg: `Memory snapshot at ${snapshot.point}: ${heapUsedMB}MB used / ${heapTotalMB}MB total heap`,
      timestamp: new Date(),
      action: 'memory-monitoring',
      component: 'UploadFileOrchestrator',
      tag: 'profiling-snapshots',
    });
  }

  async orchestrate(
    acdbPath: PathRef,
    awspPath: PathRef,
    fileId: number,
  ): Promise<boolean> {
    this.profiler?.start(PROFILER_OPERATIONS.FILE_ORCHESTRATION);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.BEFORE_PARSING),
    );

    try {
      // Parse files into chunks
      this.profiler?.start(PROFILER_OPERATIONS.ACDB_PARSING);
      const parsedAcdb = await this.acdbParser.parseACDB(acdbPath);
      this.logPerformanceMetrics(
        this.profiler?.end(PROFILER_OPERATIONS.ACDB_PARSING),
      );

      this.profiler?.start(PROFILER_OPERATIONS.AWSP_PARSING);
      const parsedAwsp = await this.awspParser.parseAWSP(awspPath);
      this.logPerformanceMetrics(
        this.profiler?.end(PROFILER_OPERATIONS.AWSP_PARSING),
      );

      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_PARSING),
      );

      // Call buildAll with the parsed data
      this.profiler?.start(PROFILER_OPERATIONS.ENTITY_BUILDING);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.BEFORE_ENTITY_BUILDING),
      );
      const buildResult = await this.builderService.buildAll(
        parsedAcdb,
        parsedAwsp,
        fileId,
      );

      // Store the entity model for persistence
      if (buildResult.success) {
        this.entityModel = buildResult.entityModel;

        const keyDefinitions = this.builderService.getBuiltKeyDefinitions(
          buildResult.entityModel,
        );
        const spfModuleDefinitions =
          this.builderService.getBuiltSpfModuleDefinitions(
            buildResult.entityModel,
          );

        if (keyDefinitions.length > 0 || spfModuleDefinitions.length > 0) {
          this.logger?.logInfo({
            msg: `Built entity model with ${keyDefinitions.length} key definitions, ${spfModuleDefinitions.length} SPF module definitions, and ${buildResult.entityModel.getEntityCount()} total entities`,
            action: 'entity_model_built',
            component: 'UploadFileOrchestrator',
            tag: 'entity-extraction',
            timestamp: new Date(),
          });
        }
      }

      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_ENTITY_BUILDING),
      );
      this.logPerformanceMetrics(
        this.profiler?.end(PROFILER_OPERATIONS.ENTITY_BUILDING),
      );

      // Persist entities
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.BEFORE_PERSISTENCE),
      );

      await this.persistEntities();

      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_PERSISTENCE),
      );

      return buildResult.success;
    } catch (error) {
      // Log the error using the proper LogData structure
      await this.logger?.logError({
        msg: 'File orchestration failed during processing',
        timestamp: new Date(),
        action: 'file-orchestration',
        component: 'UploadFileOrchestrator',
        tag: 'file-processing',
        error: error instanceof Error ? error : new Error(String(error)),
      });

      // Re-throw the error to maintain existing error handling behavior
      throw error;
    } finally {
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_CLEANUP),
      );
      this.logPerformanceMetrics(
        this.profiler?.end(PROFILER_OPERATIONS.FILE_ORCHESTRATION),
      );
    }
  }

  async persistEntities(): Promise<void> {
    this.profiler?.start(PROFILER_OPERATIONS.DATABASE_TRANSACTION);

    try {
      // Transactional DB updates
      //await this.uow.executeInTransaction(async () => {
      const bulkRepo = this.uow.getBulkImportRepository();

      await this.processDefinitionsWithMappings(bulkRepo);

      // Phase 2: Process all usecase data (SPF entities + usecases) with foreign key mappings
      await this.processUsecaseDataWithMappings(bulkRepo);

      // Add other repositories as needed
      //});
    } catch (error) {
      // Log persistence errors
      await this.logger?.logError({
        msg: 'Entity persistence failed during database transaction',
        timestamp: new Date(),
        action: 'entity-persistence',
        component: 'UploadFileOrchestrator',
        tag: 'database-transaction',
        error: error instanceof Error ? error : new Error(String(error)),
      });

      // Re-throw the error to maintain existing error handling behavior
      throw error;
    } finally {
      this.logPerformanceMetrics(
        this.profiler?.end(PROFILER_OPERATIONS.DATABASE_TRANSACTION),
      );
    }
  }

  private async processDefinitionsWithMappings(bulkRepo: any): Promise<void> {
    if (!this.entityModel) {
      return;
    }
    // Insert key definitions if available
    if (this.entityModel) {
      const keyDefinitions = this.entityModel.getEntity<KeyDefinition[]>(
        ENTITY_MODEL_KEYS.KEY_DEFINITIONS,
      );

      if (keyDefinitions && keyDefinitions.length > 0) {
        const keyDefResult = await bulkRepo.insertKeyDefinitions(
          keyDefinitions.map((kd: KeyDefinition) => ({
            ...kd,
            systemId: undefined,
          })) as any,
        );

        // Store foreign key mappings for usecase processing
        this.foreignKeyMapper.setKeyDefinitionMappings(keyDefResult);

        const successfulInserts = keyDefResult.results.filter(
          (r: any) => r.success,
        ).length;
        this.logger?.logInfo({
          msg: `Inserted ${successfulInserts} key definitions (${keyDefResult.results.length} total)`,
          action: 'key_definitions_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      }

      /*// Insert SPF module definitions if available
          const spfModuleDefinitions = this.entityModel.getEntity<
            SpfModuleDefinition[]
          >(ENTITY_MODEL_KEYS.SPF_MODULE_DEFINITIONS);

          if (spfModuleDefinitions && spfModuleDefinitions.length > 0) {
            const moduleDefResult = await bulkRepo.insertModuleDefinitions(
              spfModuleDefinitions.map((md: SpfModuleDefinition) => ({
                ...md,
                systemId: undefined,
              })) as any,
            );

            const successfulInserts = moduleDefResult.results.filter(
              r => r.success,
            ).length;
            this.logger?.logInfo({
              msg: `Inserted ${successfulInserts} SPF module definitions (${moduleDefResult.results.length} total)`,
              action: 'spf_module_definitions_persisted',
              component: 'UploadFileOrchestrator',
              tag: 'database-persistence',
              timestamp: new Date(),
            });
          }*/
    }
  }

  /**
   * Process all usecase data (SPF entities + usecases) in hierarchical order with foreign key mappings
   */
  private async processUsecaseDataWithMappings(bulkRepo: any): Promise<void> {
    if (!this.entityModel) {
      return;
    }

    // ============================================
    // Phase 1: Insert Subgraphs (no dependencies)
    // ============================================
    const subgraphs = this.entityModel.getEntity<Subgraph[]>(
      ENTITY_MODEL_KEYS.SUBGRAPHS,
    );

    if (subgraphs && subgraphs.length > 0) {
      const subgraphResult = await bulkRepo.insertSubgraphs(
        subgraphs.map((sg: Subgraph) => ({
          ...sg,
          systemId: undefined,
        })) as any,
      );

      // Extract and store subgraph mappings
      const subgraphMappings = subgraphResult.results
        .filter((r: any) => r.success && r.idMapping)
        .map((r: any) => r.idMapping);

      this.foreignKeyMapper.setSubgraphMappings(subgraphMappings);

      const successfulInserts = subgraphResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Inserted ${successfulInserts} subgraphs (${subgraphResult.results.length} total)`,
        action: 'subgraphs_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }

    // ============================================
    // Phase 2: Insert Containers (no dependencies)
    // ============================================
    const containers = this.entityModel.getEntity<Container[]>(
      ENTITY_MODEL_KEYS.CONTAINERS,
    );

    if (containers && containers.length > 0) {
      const containerResult = await bulkRepo.insertContainers(
        containers.map((c: Container) => ({
          ...c,
          systemId: undefined,
        })) as any,
      );

      // Extract and store container mappings
      const containerMappings = containerResult.results
        .filter((r: any) => r.success && r.idMapping)
        .map((r: any) => r.idMapping);

      this.foreignKeyMapper.setContainerMappings(containerMappings);

      const successfulInserts = containerResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Inserted ${successfulInserts} containers (${containerResult.results.length} total)`,
        action: 'containers_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }

    // ============================================
    // Phase 3: Insert SPF Modules (depend on subgraphs, containers, definitions)
    // ============================================
    const spfModules = this.entityModel.getEntity<SpfModule[]>(
      ENTITY_MODEL_KEYS.SPF_MODULES,
    );

    if (spfModules && spfModules.length > 0) {
      const spfModuleResult = await bulkRepo.insertSpfModules(
        spfModules.map((sm: SpfModule) => ({
          ...sm,
          systemId: undefined,
        })) as any,
      );

      // Extract and store module instance mappings
      const moduleInstanceMappings = spfModuleResult.results
        .filter((r: any) => r.success && r.idMapping)
        .map((r: any) => r.idMapping);

      this.foreignKeyMapper.setModuleInstanceMappings(moduleInstanceMappings);

      const successfulInserts = spfModuleResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Inserted ${successfulInserts} SPF modules (${spfModuleResult.results.length} total)`,
        action: 'spf_modules_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }

    // ============================================
    // Phase 4: Insert Data Links (depend on modules)
    // ============================================
    const dataLinks = this.entityModel.getEntity<DataLink[]>(
      ENTITY_MODEL_KEYS.DATA_LINKS,
    );

    if (dataLinks && dataLinks.length > 0) {
      const dataLinkResult = await bulkRepo.insertDataLinks(
        dataLinks.map((dl: DataLink) => ({
          ...dl,
          systemId: undefined,
        })) as any,
      );

      const successfulInserts = dataLinkResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Inserted ${successfulInserts} data links (${dataLinkResult.results.length} total)`,
        action: 'data_links_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }

    // ============================================
    // Phase 5: Insert Control Links (depend on modules)
    // ============================================
    const controlLinks = this.entityModel.getEntity<ControlLink[]>(
      ENTITY_MODEL_KEYS.CONTROL_LINKS,
    );

    if (controlLinks && controlLinks.length > 0) {
      const controlLinkResult = await bulkRepo.insertControlLinks(
        controlLinks.map((cl: ControlLink) => ({
          ...cl,
          systemId: undefined,
        })) as any,
      );

      const successfulInserts = controlLinkResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Inserted ${successfulInserts} control links (${controlLinkResult.results.length} total)`,
        action: 'control_links_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }

    // ============================================
    // Phase 6: Insert Usecases (final processing)
    // ============================================
    const usecases = this.builderService.getBuiltUsecases(this.entityModel);

    if (usecases && usecases.length > 0) {
      // Usecases are already built with correct foreign key mappings
      // since they are processed after key definitions are inserted
      const usecaseResult = await bulkRepo.insertUseCases(
        usecases.map((uc: UseCase) => ({
          ...uc,
          systemId: undefined,
        })) as any,
      );

      const successfulInserts = usecaseResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Inserted ${successfulInserts} usecases (${usecaseResult.results.length} total)`,
        action: 'usecases_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    } else {
      this.logger?.logDebug({
        msg: 'No usecases found to process',
        action: 'no_usecases_found',
        component: 'UploadFileOrchestrator',
        tag: 'usecase-processing',
        timestamp: new Date(),
      });
    }
  }
}
