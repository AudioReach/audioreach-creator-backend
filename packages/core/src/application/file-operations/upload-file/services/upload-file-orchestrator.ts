/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from 'application/ports/persistence/unit-of-work.js';
import type {BulkImportRepository} from '../../../ports/persistence/repositories/bulk-import/bulk-import.repository.js';
import type {BulkInsertResult} from '../../../ports/persistence/repositories/bulk-import/bulk-insert-result-types.js';
import {EntityBuilderService} from './entity-builder-service.js';
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
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {
  PROFILER_OPERATIONS,
  MEMORY_SNAPSHOTS,
  type PerformanceMetrics,
  type MemorySnapshot,
} from '../../../../shared/profiling/profiler-types.js';
import {IssueCollector, ENTITY_TYPES} from '../types/issue-collection.js';
import {
  ERROR_CODES,
  type ErrorCode,
} from '../../../../shared/errors/error-codes.js';

/**
 * Large block size for ID reservation to cover all entities in a file upload.
 * This reduces database round-trips during entity creation.
 */
const ID_BLOCK_SIZE = 1_000_000;

/**
 * Result of the orchestration process
 */
export interface OrchestratorResult {
  success: boolean;
  errors?: string[];
  warnings?: string[];
}

export class UploadFileOrchestrator {
  private issueCollector: IssueCollector = new IssueCollector();
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
    private idGenerator: IdGenerationPort,
    workerPool?: WorkerPoolPort,
    private logger?: Logger,
    private profiler?: ProfilerPort,
  ) {
    // Initialize services
    this.foreignKeyMapper = new ForeignKeyMapper(logger);
    this.builderService = new EntityBuilderService(
      this.idGenerator,
      this.foreignKeyMapper,
      workerPool,
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
  private logPerformanceMetrics(metrics: PerformanceMetrics | undefined): void {
    if (!metrics) return;

    const memoryDelta =
      metrics.endMemory.heapUsed - metrics.startMemory.heapUsed;
    const memoryDeltaMB = (memoryDelta / 1024 / 1024).toFixed(2);

    this.logger?.logInfo({
      msg: `Performance: ${metrics.operation} completed in ${metrics.duration.toFixed(2)}ms (memory delta: ${memoryDeltaMB}MB)`,
      timestamp: new Date(),
      action: 'performance-monitoring',
      component: 'UploadFileOrchestrator',
      tag: 'profiling-metrics',
    });
  }

  /**
   * Log entity building performance metrics with throughput calculation

  private logEntityBuildMetrics(
    metrics: PerformanceMetrics | undefined,
    entityCount: number,
  ): void {
    if (!metrics) return;

    const memoryDelta =
      metrics.endMemory.heapUsed - metrics.startMemory.heapUsed;
    const memoryDeltaMB = (memoryDelta / 1024 / 1024).toFixed(2);
    const throughput =
      entityCount > 0
        ? (entityCount / (metrics.duration / 1000)).toFixed(1)
        : '0';

    this.logger?.logInfo({
      msg: `Performance: ${metrics.operation} completed in ${metrics.duration.toFixed(2)}ms (entities: ${entityCount}, throughput: ${throughput}/sec, memory delta: ${memoryDeltaMB}MB)`,
      timestamp: new Date(),
      action: 'entity-build-performance',
      component: 'UploadFileOrchestrator',
      tag: 'profiling-metrics',
    });
  }

  /**
   * Log entity insertion performance metrics with success rates

  private logEntityInsertMetrics(
    metrics: PerformanceMetrics | undefined,
    insertResult:
      | BulkEntityInsertResult<number>
      | BulkModuleInsertResult
      | BulkDataLinkInsertResult
      | BulkControlLinkInsertResult
      | BulkKeyDefinitionInsertResult
      | BulkModuleDefinitionInsertResult,
  ): void {
    if (!metrics || !insertResult) return;

    const memoryDelta =
      metrics.endMemory.heapUsed - metrics.startMemory.heapUsed;
    const memoryDeltaMB = (memoryDelta / 1024 / 1024).toFixed(2);

    const totalEntities = insertResult.results?.length || 0;
    const successfulInserts =
      insertResult.results?.filter(r => r.success)?.length || 0;
    const successRate =
      totalEntities > 0
        ? ((successfulInserts / totalEntities) * 100).toFixed(1)
        : '0';
    const throughput =
      totalEntities > 0
        ? (totalEntities / (metrics.duration / 1000)).toFixed(1)
        : '0';

    this.logger?.logInfo({
      msg: `Performance: ${metrics.operation} completed in ${metrics.duration.toFixed(2)}ms (entities: ${totalEntities}, success: ${successfulInserts}/${totalEntities} (${successRate}%), throughput: ${throughput}/sec, memory delta: ${memoryDeltaMB}MB)`,
      timestamp: new Date(),
      action: 'entity-insert-performance',
      component: 'UploadFileOrchestrator',
      tag: 'profiling-metrics',
    });
  }
*/

  /**
   * Log memory snapshots from profiler
   */
  private logMemorySnapshot(snapshot: MemorySnapshot | undefined): void {
    if (!snapshot) return;

    const heapUsedMB = (snapshot.memory.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (snapshot.memory.heapTotal / 1024 / 1024).toFixed(2);

    this.logger?.logInfo({
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
  ): Promise<OrchestratorResult> {
    this.issueCollector.clear();
    this.currentFileId = fileId;
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
    } catch (error) {
      // Log the error using the proper LogData structure
      this.logger?.logError({
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

    const formattedIssues = this.issueCollector.formatForApi();
    return {
      success: !this.issueCollector.hasErrors(),
      errors: formattedIssues.errors,
      warnings: formattedIssues.warnings,
    };
  }

  /**
   * Implement build-insert-build pattern for hierarchical entity processing
   */
  private async persistEntitiesInHierarchicalOrder(): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building entities');
    }

    this.profiler?.start(PROFILER_OPERATIONS.DATABASE_TRANSACTION);

    try {
      // Reserve a large block of IDs upfront to cover all entities
      await this.idGenerator.reserveBlock(this.currentFileId, ID_BLOCK_SIZE);

      this.logger?.logInfo({
        msg: `Reserved ${ID_BLOCK_SIZE} IDs for file ${this.currentFileId}`,
        action: 'id_block_reserved',
        component: 'UploadFileOrchestrator',
        tag: 'id-generation',
        timestamp: new Date(),
      });

      const bulkRepo = this.uow.getBulkImportRepository();

      // Phase 1a: Build and Insert Key Definitions (no dependencies)
      await this.buildAndInsertKeyDefinitions(bulkRepo);

      // Phase 1b: Build and Insert SPF Module Definitions (no dependencies)
      await this.buildAndInsertSpfModuleDefinitions(bulkRepo);

      //eslint-disable-next-line sonarjs/no-commented-code
      /*
      // Phase 2: Build and Insert Subgraphs (no dependencies)
      await this.buildAndInsertSubgraphs(bulkRepo);

      // Phase 3: Build and Insert Containers (no dependencies)
      await this.buildAndInsertContainers(bulkRepo);

      // Phase 4: Build and Insert SPF Modules (depend on subgraphs, containers, definitions)
      await this.buildAndInsertSpfModules(bulkRepo);

      // Phase 5: Build and Insert Data Links (depend on modules)
      await this.buildAndInsertDataLinks(bulkRepo);

      // Phase 6: Build and Insert Control Links (depend on modules)
      await this.buildAndInsertControlLinks(bulkRepo);

      // Phase 7: Build and Insert Usecases (depend on all value definitions)
      await this.buildAndInsertUsecases(bulkRepo);
*/
    } catch (error) {
      // Log persistence errors
      this.logger?.logError({
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
      // Persist the actual last used ID to reclaim unused IDs from the reserved block
      try {
        await this.idGenerator.persistLastUsedId(this.currentFileId);

        this.logger?.logInfo({
          msg: `Persisted last used ID for file ${this.currentFileId}`,
          action: 'id_last_used_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'id-generation',
          timestamp: new Date(),
        });
      } catch (persistError) {
        this.logger?.logError({
          msg: 'Failed to persist last used ID',
          timestamp: new Date(),
          action: 'id_persist_failed',
          component: 'UploadFileOrchestrator',
          tag: 'id-generation',
          error:
            persistError instanceof Error
              ? persistError
              : new Error(String(persistError)),
        });
      }

      this.logPerformanceMetrics(
        this.profiler?.end(PROFILER_OPERATIONS.DATABASE_TRANSACTION),
      );
    }
  }

  /**
   * Phase 1a: Build and Insert Key Definitions
   */
  private async buildAndInsertKeyDefinitions(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Build key definitions with system IDs assigned
    const result = await this.builderService.buildKeyDefinitions(
      this.parsedAwsp!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert key definitions
      const insertResult = await bulkRepo.insertKeyDefinitions(result.entities);

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult);

      // TODO: Record insertion failures in validation_errors table (to be implemented later)
      // await this.recordInsertionFailures(insertResult, result.entities, 'KeyDefinition');

      this.logger?.logInfo({
        msg: `Built and inserted ${result.entities.length} key definitions (${result.errorCount} errors, ${result.warningCount} warnings)`,
        action: 'key_definitions_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Collect insertion errors from BulkInsertResult and add them to issueCollector
   */
  private collectInsertionErrors(insertResult: BulkInsertResult): void {
    if (!insertResult.ok) {
      // Type narrowing: insertResult is now {ok: false; message: string}
      const errorMessage = insertResult.message;
      const errorCode = this.categorizeInsertionError(errorMessage);

      this.issueCollector.addError({
        code: errorCode,
        message: errorMessage,
        entityType: ENTITY_TYPES.KEY_DEFINITION,
      });
    }
  }

  /**
   * Categorize insertion error message to determine appropriate error code
   */
  private categorizeInsertionError(errorMessage: string): ErrorCode {
    if (errorMessage.includes('UNIQUE constraint failed')) {
      return ERROR_CODES.UNIQUE_CONSTRAINT;
    }

    if (errorMessage.includes('FOREIGN KEY constraint failed')) {
      return ERROR_CODES.FOREIGN_KEY_CONSTRAINT;
    }

    if (errorMessage.includes('INVALID') || errorMessage.includes('invalid')) {
      return ERROR_CODES.INVALID_ENTITY_DATA;
    }

    return ERROR_CODES.INSERTION_FAILED;
  }

  /**
   * Phase 1b: Build and Insert SPF Module Definitions
   */
  private async buildAndInsertSpfModuleDefinitions(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Get count of SPF module definitions to pre-allocate system IDs
    const awspModuleDefinitions =
      this.parsedAwsp!.getSpfModuleDefinitions() || [];

    if (awspModuleDefinitions.length === 0) {
      return;
    }

    // Build SPF module definitions with system IDs assigned
    const result = await this.builderService.buildSpfModuleDefinitions(
      this.parsedAwsp!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert SPF module definitions
      const insertResult = await bulkRepo.insertModuleDefinitions(
        result.entities,
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult);

      this.logger?.logInfo({
        msg: `Built and inserted ${result.entities.length} SPF module definitions (${result.errorCount} errors, ${result.warningCount} warnings)`,
        action: 'spf_module_definitions_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });
    }
  }

  /**
   * Phase 2: Build and Insert Subgraphs

  private async buildAndInsertSubgraphs(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.SUBGRAPH_BUILDING);
    const subgraphs = this.builderService.buildSubgraphs(
      this.parsedAcdb!,
      this.currentFileId,
    );
    const buildMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.SUBGRAPH_BUILDING,
    );
    this.logEntityBuildMetrics(buildMetrics, subgraphs?.length || 0);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_SUBGRAPH_BUILD),
    );

    if (subgraphs && subgraphs.length > 0) {
      // Profile insertion phase
      this.profiler?.start(PROFILER_OPERATIONS.SUBGRAPH_INSERT);
      const subgraphResult: BulkEntityInsertResult<number> =
        await bulkRepo.insertSubgraphs(
          subgraphs as readonly Omit<Subgraph, 'systemId'>[],
        );
      const insertMetrics = this.profiler?.end(
        PROFILER_OPERATIONS.SUBGRAPH_INSERT,
      );
      this.logEntityInsertMetrics(insertMetrics, subgraphResult);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_SUBGRAPH_INSERT),
      );

      // Store subgraph mappings from bulk insertion result
      this.foreignKeyMapper.setSubgraphMappings(subgraphResult);

      const successfulInserts = subgraphResult.results.filter(
        r => r.success,
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

  private async buildAndInsertContainers(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.CONTAINER_BUILDING);
    const containers = this.builderService.buildContainers(
      this.parsedAcdb!,
      this.currentFileId,
    );
    const buildMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.CONTAINER_BUILDING,
    );
    this.logEntityBuildMetrics(buildMetrics, containers?.length || 0);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_CONTAINER_BUILD),
    );

    if (containers && containers.length > 0) {
      // Profile insertion phase
      this.profiler?.start(PROFILER_OPERATIONS.CONTAINER_INSERT);
      const containerResult: BulkEntityInsertResult<number> =
        await bulkRepo.insertContainers(
          containers as readonly Omit<Container, 'systemId'>[],
        );
      const insertMetrics = this.profiler?.end(
        PROFILER_OPERATIONS.CONTAINER_INSERT,
      );
      this.logEntityInsertMetrics(insertMetrics, containerResult);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_CONTAINER_INSERT),
      );

      // Store container mappings from bulk insertion result
      this.foreignKeyMapper.setContainerMappings(containerResult);

      const successfulInserts = containerResult.results.filter(
        r => r.success,
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

  private async buildAndInsertSpfModules(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.SPF_MODULE_BUILDING);
    const spfModules = this.builderService.buildSpfModules(
      this.parsedAcdb!,
      this.currentFileId,
      this.parsedAwsp!,
    );
    const buildMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.SPF_MODULE_BUILDING,
    );
    this.logEntityBuildMetrics(buildMetrics, spfModules?.length || 0);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_SPF_MODULE_BUILD),
    );

    if (spfModules && spfModules.length > 0) {
      // Profile insertion phase
      this.profiler?.start(PROFILER_OPERATIONS.SPF_MODULE_INSERT);
      const spfModuleResult: BulkModuleInsertResult =
        await bulkRepo.insertSpfModules(
          spfModules as readonly Omit<SpfModule, 'systemId'>[],
        );
      const insertMetrics = this.profiler?.end(
        PROFILER_OPERATIONS.SPF_MODULE_INSERT,
      );
      this.logEntityInsertMetrics(insertMetrics, spfModuleResult);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_SPF_MODULE_INSERT),
      );

      // Store module instance mappings from bulk insertion result
      this.foreignKeyMapper.setSpfModuleMappings(spfModuleResult);

      const successfulInserts = spfModuleResult.results.filter(
        r => r.success,
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

  private async buildAndInsertDataLinks(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.DATA_LINK_BUILDING);
    const dataLinks = this.builderService.buildDataLinks(
      this.parsedAcdb!,
      this.currentFileId,
    );
    const buildMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.DATA_LINK_BUILDING,
    );
    this.logEntityBuildMetrics(buildMetrics, dataLinks?.length || 0);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_DATA_LINK_BUILD),
    );

    if (dataLinks && dataLinks.length > 0) {
      // Profile insertion phase
      this.profiler?.start(PROFILER_OPERATIONS.DATA_LINK_INSERT);
      const dataLinkResult: BulkDataLinkInsertResult =
        await bulkRepo.insertDataLinks(
          dataLinks as readonly Omit<DataLink, 'systemId'>[],
        );
      const insertMetrics = this.profiler?.end(
        PROFILER_OPERATIONS.DATA_LINK_INSERT,
      );
      this.logEntityInsertMetrics(insertMetrics, dataLinkResult);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_DATA_LINK_INSERT),
      );

      // Store datalink mappings for usecases
      this.foreignKeyMapper.setDataLinkMappings(dataLinkResult);

      const successfulInserts = dataLinkResult.results.filter(
        r => r.success,
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

  private async buildAndInsertControlLinks(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.CONTROL_LINK_BUILDING);
    const {controlLinks, controlPortIntents} =
      this.builderService.buildControlLinks(
        this.parsedAcdb!,
        this.currentFileId,
      );
    const buildMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.CONTROL_LINK_BUILDING,
    );
    this.logEntityBuildMetrics(buildMetrics, controlLinks?.length || 0);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_CONTROL_LINK_BUILD),
    );

    if (controlLinks && controlLinks.length > 0) {
      // Profile insertion phase
      this.profiler?.start(PROFILER_OPERATIONS.CONTROL_LINK_INSERT);
      const controlLinkResult: BulkControlLinkInsertResult =
        await bulkRepo.insertControlLinks(
          controlLinks as readonly Omit<ControlLink, 'systemId'>[],
        );
      const insertMetrics = this.profiler?.end(
        PROFILER_OPERATIONS.CONTROL_LINK_INSERT,
      );
      this.logEntityInsertMetrics(insertMetrics, controlLinkResult);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_CONTROL_LINK_INSERT),
      );

      // Store control link mappings for usecases
      this.foreignKeyMapper.setControlLinkMappings(controlLinkResult);

      const successfulInserts = controlLinkResult.results.filter(
        r => r.success,
      ).length;

      this.logger?.logInfo({
        msg: `Built and inserted ${successfulInserts} control links (${controlLinkResult.results.length} total)`,
        action: 'control_links_persisted',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        timestamp: new Date(),
      });

      // TODO: Insert intents for control ports
      // The controlPortIntents Map contains: Map<controlPortSystemId, intentIds[]>
      // This needs to be transformed into IntentRow[] and bulk inserted into the intents table
      // Each entry should create rows with: { intentId, controlPortSystemId }
      // Reference: IntentSchema in packages/infrastructure/persistence/src/persistence-typeorm-sqllite/entity-schema/usecase-data/node/control-port.ts
      // Table structure: intents table with columns (system_id, intent_id, control_port_system_id)
      // Unique constraint: (control_port_system_id, intent_id)
      //
      // Implementation steps:
      // 1. Create IntentInserter in packages/infrastructure/persistence/src/persistence-typeorm-sqllite/repositories/bulk-import/intent/
      // 2. Add insertIntents() method to BulkImportRepository interface
      // 3. Implement method in TypeOrmBulkImportRepository
      // 4. Transform controlPortIntents Map to IntentRow[] array here
      // 5. Call bulkRepo.insertIntents(intentRows) and log results
      //
      // Data available: controlPortIntents Map with ${controlPortIntents.size} control ports containing intents
      if (controlPortIntents.size > 0) {
        this.logger?.logInfo({
          msg: `Control port intents extracted: ${controlPortIntents.size} control ports have associated intents (insertion pending implementation)`,
          action: 'control_port_intents_extracted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      }
    }
  }

  /**
   * Phase 7: Build and Insert Usecases

  private async buildAndInsertUsecases(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.USECASE_BUILDING);
    const usecases = this.builderService.buildUsecases(
      this.parsedAcdb!,
      this.currentFileId,
    );
    const buildMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.USECASE_BUILDING,
    );
    this.logEntityBuildMetrics(buildMetrics, usecases?.length || 0);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_USECASE_BUILD),
    );

    if (usecases && usecases.length > 0) {
      // Profile insertion phase
      this.profiler?.start(PROFILER_OPERATIONS.USECASE_INSERT);
      const usecaseResult: BulkEntityInsertResult<number> =
        await bulkRepo.insertUseCases(
          usecases as readonly Omit<UseCase, 'systemId'>[],
        );
      const insertMetrics = this.profiler?.end(
        PROFILER_OPERATIONS.USECASE_INSERT,
      );
      this.logEntityInsertMetrics(insertMetrics, usecaseResult);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_USECASE_INSERT),
      );

      const successfulInserts = usecaseResult.results.filter(
        r => r.success,
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
  }*/
}
