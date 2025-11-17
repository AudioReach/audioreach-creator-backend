import type {UnitOfWork} from 'application/ports/persistence/unit-of-work.js';
import {
  EntityBuilderService,
  EntityModel,
  ENTITY_MODEL_KEYS,
} from './entity-builder-service.js';
import type {KeyDefinition} from '../../../../domain/entities/definitions/key-value/aggregate/key-definition.js';
import type {SpfModuleDefinition} from '../../../../domain/entities/definitions/spf-module/aggregate/spf-module-definitions.js';
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
    this.builderService = new EntityBuilderService(workerPool, logger);

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

  async orchestrate(acdbPath: PathRef, awspPath: PathRef): Promise<boolean> {
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

      //TODO: enable once repo implementation is complete.
      //await this.persistEntities();

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
      await this.uow.executeInTransaction(async () => {
        const bulkRepo = this.uow.getBulkImportRepository();

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

            const successfulInserts = keyDefResult.results.filter(
              r => r.success,
            ).length;
            this.logger?.logInfo({
              msg: `Inserted ${successfulInserts} key definitions (${keyDefResult.results.length} total)`,
              action: 'key_definitions_persisted',
              component: 'UploadFileOrchestrator',
              tag: 'database-persistence',
              timestamp: new Date(),
            });
          }

          // Insert SPF module definitions if available
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
          }
        }

        // Add other repositories as needed
      });
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
}
