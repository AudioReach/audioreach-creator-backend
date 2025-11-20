import type {UnitOfWork} from 'application/ports/persistence/unit-of-work.js';
import {EntityBuilderService} from './entity-builder-service.js';
import type {KeyDefinition} from '../../../../domain/entities/definitions/key-value/aggregate/key-definition.js';
import type {SpfModuleDefinition} from '../../../../domain/entities/definitions/spf-module/aggregate/spf-module-definitions.js';
import type {UseCase} from '../../../../domain/entities/usecase-data/usecase/usecase.js';
import type {Subgraph} from '../../../../domain/entities/usecase-data/subgraph/subgraph.js';
import type {Container} from '../../../../domain/entities/usecase-data/container/container.js';
import type {SpfModule} from '../../../../domain/entities/usecase-data/module/spf-module.js';
import type {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import {ForeignKeyMapper} from './foreign-key-mapper.js';
import {AcdbFileOrchestrator} from './acdb-file-orchestrator.js';
import {AwspFileOrchestrator} from './awsp-file-orchestrator.js';
import {ParsedAcdb} from '../models/parsed-acdb.js';
import {ParsedAwsp} from '../models/parsed-awsp.js';
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

  // Storage for parsed data to enable build-insert-build pattern
  private parsedAcdb: ParsedAcdb | null = null;
  private parsedAwsp: ParsedAwsp | null = null;
  private currentFileId: number = 0;

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
      // Parse files into chunks and store for build-insert-build pattern
      this.profiler?.start(PROFILER_OPERATIONS.ACDB_PARSING);
      this.parsedAcdb = await this.acdbParser.parseACDB(acdbPath);
      this.logPerformanceMetrics(
        this.profiler?.end(PROFILER_OPERATIONS.ACDB_PARSING),
      );

      this.profiler?.start(PROFILER_OPERATIONS.AWSP_PARSING);
      this.parsedAwsp = await this.awspParser.parseAWSP(awspPath);
      this.logPerformanceMetrics(
        this.profiler?.end(PROFILER_OPERATIONS.AWSP_PARSING),
      );

      // Store file ID for use in build phases
      this.currentFileId = fileId;

      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_PARSING),
      );

      // Implement build-insert-build pattern
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.BEFORE_PERSISTENCE),
      );

      await this.persistEntitiesInHierarchicalOrder();

      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_PERSISTENCE),
      );

      return true;
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

  /**
   * Implement build-insert-build pattern for hierarchical entity processing
   */
  private async persistEntitiesInHierarchicalOrder(): Promise<void> {
    this.profiler?.start(PROFILER_OPERATIONS.DATABASE_TRANSACTION);

    try {
      const bulkRepo = this.uow.getBulkImportRepository();

      // Phase 1a: Build and Insert Key Definitions (no dependencies)
      await this.buildAndInsertKeyDefinitions(bulkRepo);

      // Phase 1b: Build and Insert SPF Module Definitions (no dependencies)
      await this.buildAndInsertSpfModuleDefinitions(bulkRepo);

      // Phase 2: Build and Insert Subgraphs (no dependencies)
      await this.buildAndInsertSubgraphs(bulkRepo);

      // Phase 3: Build and Insert Containers (no dependencies)
      await this.buildAndInsertContainers(bulkRepo);

      // Phase 4: Build and Insert SPF Modules (depend on subgraphs, containers, definitions)
      await this.buildAndInsertSpfModules(bulkRepo);

      // Phase 5: Build and Insert Data Links (depend on modules)
      await this.buildAndInsertDataLinks(bulkRepo);

      if (false) {
        // Phase 6: Build and Insert Control Links (depend on modules)
        await this.buildAndInsertControlLinks(bulkRepo);
      }

      // Phase 7: Build and Insert Usecases (depend on all value definitions)
      await this.buildAndInsertUsecases(bulkRepo);
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

  /**
   * Phase 1a: Build and Insert Key Definitions
   */
  private async buildAndInsertKeyDefinitions(bulkRepo: any): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building definitions');
    }

    // Build key definitions
    const keyDefinitions = await this.builderService.buildKeyDefinitions(
      this.parsedAwsp,
    );

    if (keyDefinitions && keyDefinitions.length > 0) {
      const keyDefResult = await bulkRepo.insertKeyDefinitions(
        keyDefinitions.map((kd: KeyDefinition) => ({
          ...kd,
          systemId: undefined,
        })) as any,
      );

      // Store foreign key mappings for subsequent phases
      this.foreignKeyMapper.setKeyDefinitionMappings(keyDefResult);

      const successfulInserts = keyDefResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Built and inserted ${successfulInserts} key definitions (${keyDefResult.results.length} total)`,
        action: 'key_definitions_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Phase 1b: Build and Insert SPF Module Definitions
   */
  private async buildAndInsertSpfModuleDefinitions(
    bulkRepo: any,
  ): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error(
        'Parsed data not available for building SPF module definitions',
      );
    }

    // Build SPF module definitions
    const spfModuleDefinitions =
      await this.builderService.buildSpfModuleDefinitions(this.parsedAwsp);

    if (spfModuleDefinitions && spfModuleDefinitions.length > 0) {
      const spfModuleDefResult = await bulkRepo.insertModuleDefinitions(
        spfModuleDefinitions.map((smd: SpfModuleDefinition) => ({
          ...smd,
          systemId: undefined,
        })) as any,
      );

      // Store foreign key mappings for subsequent phases
      this.foreignKeyMapper.setModuleDefinitionMappings(spfModuleDefResult);

      const successfulInserts = spfModuleDefResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Built and inserted ${successfulInserts} SPF module definitions (${spfModuleDefResult.results.length} total)`,
        action: 'spf_module_definitions_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Phase 2: Build and Insert Subgraphs
   */
  private async buildAndInsertSubgraphs(bulkRepo: any): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building subgraphs');
    }

    // Build subgraphs (now that we have definition systemIds)
    const subgraphs = await this.builderService.buildSubgraphs(
      this.parsedAcdb,
      this.currentFileId,
    );

    if (subgraphs && subgraphs.length > 0) {
      const subgraphResult = await bulkRepo.insertSubgraphs(
        subgraphs.map((sg: Subgraph) => ({
          ...sg,
          systemId: undefined,
        })) as any,
      );

      // Store subgraph mappings from bulk insertion result
      this.foreignKeyMapper.setSubgraphMappings(subgraphResult);

      const successfulInserts = subgraphResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Built and inserted ${successfulInserts} subgraphs (${subgraphResult.results.length} total)`,
        action: 'subgraphs_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Phase 3: Build and Insert Containers
   */
  private async buildAndInsertContainers(bulkRepo: any): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building containers');
    }

    // Build containers (now that we have definition systemIds)
    const containers = await this.builderService.buildContainers(
      this.parsedAcdb,
      this.currentFileId,
    );

    if (containers && containers.length > 0) {
      const containerResult = await bulkRepo.insertContainers(
        containers.map((c: Container) => ({
          ...c,
          systemId: undefined,
        })) as any,
      );

      // Store container mappings from bulk insertion result
      this.foreignKeyMapper.setContainerMappings(containerResult);

      const successfulInserts = containerResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Built and inserted ${successfulInserts} containers (${containerResult.results.length} total)`,
        action: 'containers_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Phase 4: Build and Insert SPF Modules
   */
  private async buildAndInsertSpfModules(bulkRepo: any): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building SPF modules');
    }

    // Build SPF modules (now that we have subgraph, container, and definition systemIds)
    const spfModules = await this.builderService.buildSpfModules(
      this.parsedAcdb,
      this.currentFileId,
      this.parsedAwsp,
    );

    if (spfModules && spfModules.length > 0) {
      const spfModuleResult = await bulkRepo.insertSpfModules(
        spfModules.map((sm: SpfModule) => ({
          ...sm,
          systemId: undefined,
        })) as any,
      );

      // Store module instance mappings from bulk insertion result
      this.foreignKeyMapper.setModuleInstanceMappings(spfModuleResult);

      const successfulInserts = spfModuleResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Built and inserted ${successfulInserts} SPF modules (${spfModuleResult.results.length} total)`,
        action: 'spf_modules_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Phase 5: Build and Insert Data Links
   */
  private async buildAndInsertDataLinks(bulkRepo: any): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building data links');
    }

    // Build data links (now that we have module systemIds)
    const dataLinks = await this.builderService.buildDataLinks(this.parsedAcdb);

    if (dataLinks && dataLinks.length > 0) {
      const dataLinkResult = await bulkRepo.insertDataLinks(
        dataLinks.map((dl: DataLink) => ({
          ...dl,
          systemId: undefined,
        })) as any,
      );

      // Store datalink mappings for usecases
      this.foreignKeyMapper.setDataLinkMappings(dataLinkResult);

      const successfulInserts = dataLinkResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Built and inserted ${successfulInserts} data links (${dataLinkResult.results.length} total)`,
        action: 'data_links_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Phase 6: Build and Insert Control Links
   */
  private async buildAndInsertControlLinks(bulkRepo: any): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building control links');
    }

    // Build control links (now that we have module systemIds)
    const controlLinks = await this.builderService.buildControlLinks(
      this.parsedAcdb,
    );

    if (controlLinks && controlLinks.length > 0) {
      const controlLinkResult = await bulkRepo.insertControlLinks(
        controlLinks.map((cl: ControlLink) => ({
          ...cl,
          systemId: undefined,
        })) as any,
      );

      // Store control link mappings for usecases
      this.foreignKeyMapper.setControlLinkMappings(controlLinkResult);

      const successfulInserts = controlLinkResult.results.filter(
        (r: any) => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Built and inserted ${successfulInserts} control links (${controlLinkResult.results.length} total)`,
        action: 'control_links_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Phase 7: Build and Insert Usecases
   */
  private async buildAndInsertUsecases(bulkRepo: any): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building usecases');
    }

    // Build usecases (now that we have all value definition systemIds)
    const usecases = await this.builderService.buildUsecases(
      this.parsedAcdb,
      this.currentFileId,
    );

    if (usecases && usecases.length > 0) {
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
        msg: `Built and inserted ${successfulInserts} usecases (${usecaseResult.results.length} total)`,
        action: 'usecases_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    } else {
      this.logger?.logInfo({
        msg: 'No usecases found to process',
        action: 'no_usecases_found',
        component: 'UploadFileOrchestrator',
        tag: 'usecase-processing',
        timestamp: new Date(),
      });
    }
  }
}
