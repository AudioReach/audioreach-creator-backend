/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
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
import type {FileSystemPort} from '../../../ports/file-system/file-system.port.js';
import type {ProfilerPort} from '../../../ports/profiling/profiler.port.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {NaturalIdGenerationPort} from '../../../ports/id-generation/natural-id-generation.port.js';
import {
  PROFILER_OPERATIONS,
  MEMORY_SNAPSHOTS,
  type PerformanceMetrics,
  type MemorySnapshot,
} from '../../../../shared/profiling/profiler-types.js';
import {IssueCollector /*, ENTITY_TYPES*/} from '../types/issue-collection.js';
import type {
  ResultError,
  ResultWarning,
} from '../../../../shared/types/api-result.js';
import type {ValidationIssue} from '../../../../domain/validation/issue.js';
import {HeaderChunk} from '../../shared/acdb-chunks/header-chunk.js';
import {PARSED_CHUNK_TYPES} from '../../shared/constants/chunk-types.js';

/* eslint-disable sonarjs/no-commented-code */
// import {
//   ERROR_CODES,
//   type ErrorCode,
// } from '../../../../shared/errors/error-codes.js';
/* eslint-enable sonarjs/no-commented-code */

/**
 * Large block size for ID reservation to cover all entities in a file upload.
 * This reduces database round-trips during entity creation.
 */
const ID_BLOCK_SIZE = 1_000_000;

/**
 * ACDB header metadata extracted from the parsed file
 */
export interface AcdbHeaderData {
  headerVersion: number;
  acdbVersionMajor: number;
  acdbVersionMinor: number;
  acdbVersionRevision: number;
  acdbVersionCplInfo: number;
  codecInfos: string;
  modifiedDate: number;
  oemInfo: string;
}

/**
 * Result returned by UploadFileOrchestrator.orchestrate().
 * Contains DATA_LOSS issues collected during bulk-insert.
 * Domain validation issues (from ValidationEngine) are NOT included here —
 * they are generated separately by the upload handler using fromEntities().
 */
export interface UploadOrchestratorResult {
  success: boolean;
  errors?: ResultError[];
  warnings?: ResultWarning[];
  /**
   * DATA_LOSS issues collected during bulk-insert.
   * Each entry represents an entity that failed to insert into the DB.
   * Empty array when all inserts succeeded.
   */
  dataLossIssues: ValidationIssue[];
  /**
   * ACDB header metadata extracted from the parsed file.
   * Undefined if header chunk was not found or failed to parse.
   */
  headerData?: AcdbHeaderData;
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

  /**
   * DATA_LOSS issues collected during bulk-insert.
   * Entity builders push to this array when an insertion fails.
   * Exposed via orchestrate() result after all phases complete.
   */
  private readonly dataLossIssues: ValidationIssue[] = [];

  /* -------------------------------------*/

  constructor(
    private fileSystem: FileSystemPort,
    private uow: UnitOfWork,
    private idGenerator: IdGenerationPort,
    private naturalIdGenerator: NaturalIdGenerationPort,
    workerPool?: WorkerPoolPort,
    private logger?: Logger,
    private profiler?: ProfilerPort,
  ) {
    // Initialize services
    this.foreignKeyMapper = new ForeignKeyMapper();
    this.builderService = new EntityBuilderService(
      this.idGenerator,
      this.naturalIdGenerator,
      this.foreignKeyMapper,
      workerPool,
      logger,
    );

    this.acdbParser = new AcdbFileOrchestrator(
      this.fileSystem,
      //workerPool,
      logger,
    );
    this.awspParser = new AwspFileOrchestrator(
      this.fileSystem,
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
   */
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
   */
  private logEntityInsertMetrics(
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
      action: 'entity-insert-performance',
      component: 'UploadFileOrchestrator',
      tag: 'profiling-metrics',
    });
  }

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
  ): Promise<UploadOrchestratorResult> {
    this.issueCollector.clear();
    this.foreignKeyMapper.clear();
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
      success: !(
        this.dataLossIssues.length > 0 || this.issueCollector.hasErrors()
      ),
      errors: formattedIssues.errors,
      warnings: formattedIssues.warnings,
      dataLossIssues: [...this.dataLossIssues],
      headerData: this.extractHeaderData(),
    };
  }

  /**
   * Extract ACDB header metadata from parsed file
   */
  private extractHeaderData(): AcdbHeaderData | undefined {
    if (!this.parsedAcdb) {
      return undefined;
    }

    const headerChunk = this.parsedAcdb.getChunk<HeaderChunk>(
      PARSED_CHUNK_TYPES.HEADER,
    );
    if (!headerChunk) {
      return undefined;
    }

    // Serialize codec infos to JSON string
    const codecInfosJson = JSON.stringify(headerChunk.codecInfos);

    return {
      headerVersion: headerChunk.headerVersion,
      acdbVersionMajor: headerChunk.version.major,
      acdbVersionMinor: headerChunk.version.minor,
      acdbVersionRevision: headerChunk.version.revision,
      acdbVersionCplInfo: headerChunk.version.cplInfo,
      codecInfos: codecInfosJson,
      modifiedDate: headerChunk.modifiedDate,
      oemInfo: headerChunk.oemInfo,
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

      // Phase 1a2: Insert Tag Definitions (no dependencies)
      await this.insertTagDefinitions(bulkRepo);

      // Phase 1b: Build and Insert Processor Definitions (no dependencies)
      await this.buildAndInsertProcessorDefinitions(bulkRepo);

      // Phase 1c: Build and Insert Container Type Definitions (no dependencies)
      await this.buildAndInsertContainerTypeDefinitions(bulkRepo);

      // Phase 1d: Build and Insert SPF Module Definitions (depends on 1b, 1c)
      await this.buildAndInsertSpfModuleDefinitions(bulkRepo);

      // Phase 1d1: Build and Insert Module Manager Data (depends on 1b, 1d)
      await this.buildAndInsertModuleManagerData(bulkRepo);

      // Phase 1d2: Build and Insert Driver Module Definitions (no dependencies)
      await this.buildAndInsertDriverModuleDefinitions(bulkRepo);

      // Phase 1d3: Build and Insert VCPM Module Definitions (no dependencies)
      await this.buildAndInsertVcpmModuleDefinitions(bulkRepo);

      // Phase 1e: Build and Insert Subgraph Property Definitions (no dependencies)
      await this.buildAndInsertSubgraphPropertyDefinitions(bulkRepo);

      // Phase 1f: Build and Insert Container Property Definitions (no dependencies)
      await this.buildAndInsertContainerPropertyDefinitions(bulkRepo);

      // Phase 2: Build and Insert Subgraphs (no dependencies)
      await this.buildAndInsertSubgraphs(bulkRepo);

      // Phase 3: Build and Insert Containers (no dependencies)
      await this.buildAndInsertContainers(bulkRepo);

      // Phase 4: Build and Insert SPF Modules with Calibration Data
      await this.buildAndInsertSpfModules(bulkRepo);

      // Phase 4b: Build and Insert Driver Modules with DKV Calibration Data
      await this.buildAndInsertDriverModules(bulkRepo);

      // Phase 5: Build and Insert Data Links (depend on modules)
      await this.buildAndInsertDataLinks(bulkRepo);

      // Phase 6: Build and Insert Control Links (depend on modules)
      await this.buildAndInsertControlLinks(bulkRepo);

      // Phase 7: Build and Insert Usecases (depend on all value definitions)
      await this.buildAndInsertUsecases(bulkRepo);
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
      this.collectInsertionErrors(insertResult, 'KeyDefinition');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} key definitions (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'key_definitions_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some key definitions: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'key_definitions_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Collect insertion errors from BulkInsertResult and log them
   * Note: Insertion errors are already included in the BulkInsertResult and logged.
   * The errors will be visible in the logs for debugging.
   */
  private collectInsertionErrors(
    insertResult: BulkInsertResult,
    entityType: string,
  ): void {
    if (!insertResult.ok) {
      // Type narrowing: insertResult is now {ok: false; errors: readonly BulkInsertError[]}
      // Log detailed error information for debugging
      this.logger?.logError({
        msg: `Insertion errors for ${entityType}: ${insertResult.errors.length} failures`,
        timestamp: new Date(),
        action: 'insertion_errors_collected',
        component: 'UploadFileOrchestrator',
        tag: 'database-persistence',
        error: new Error(
          insertResult.errors.map(e => `${e.message}: ${e.details}`).join('\n'),
        ),
      });
    }
  }

  /**
   * Categorize insertion error message to determine appropriate error code
   */
  /* eslint-disable sonarjs/no-commented-code */
  // private categorizeInsertionError(errorMessage: string): ErrorCode {
  //   if (errorMessage.includes('UNIQUE constraint failed')) {
  //     return ERROR_CODES.UNIQUE_CONSTRAINT;
  //   }

  //   if (errorMessage.includes('FOREIGN KEY constraint failed')) {
  //     return ERROR_CODES.FOREIGN_KEY_CONSTRAINT;
  //   }

  //   if (errorMessage.includes('INVALID') || errorMessage.includes('invalid')) {
  //     return ERROR_CODES.INVALID_ENTITY_DATA;
  //   }

  //   return ERROR_CODES.INSERTION_FAILED;
  // }
  /* eslint-enable sonarjs/no-commented-code */

  /**
   * Phase 1a2: Build and Insert Tag Definitions
   */
  private async insertTagDefinitions(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Build tag definitions with system IDs assigned
    const result = await this.builderService.buildTagDefinitions(
      this.parsedAwsp!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert tag definitions
      const insertResult = await bulkRepo.insertTagDefinitions(result.entities);

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'TagDefinition');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} tag definitions (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'tag_definitions_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some tag definitions: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'tag_definitions_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 1b: Build and Insert Processor Definitions
   */
  private async buildAndInsertProcessorDefinitions(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Build processor definitions with system IDs assigned
    const result = await this.builderService.buildProcessorDefinitions(
      this.parsedAwsp!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert processor definitions
      const insertResult = await bulkRepo.insertProcessorDefinitions(
        result.entities,
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'ProcessorDefinition');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} processor definitions (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'processor_definitions_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some processor definitions: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'processor_definitions_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 1c: Build and Insert Container Type Definitions
   */
  private async buildAndInsertContainerTypeDefinitions(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Build container type definitions with system IDs assigned
    const result = await this.builderService.buildContainerTypeDefinitions(
      this.parsedAwsp!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert container type definitions
      const insertResult = await bulkRepo.insertContainerTypeDefinitions(
        result.entities,
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'ContainerType');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} container type definitions (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'container_type_definitions_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some container type definitions: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'container_type_definitions_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 1d: Build and Insert SPF Module Definitions
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

    // Build SPF module definitions with system IDs assigned (includes boot-up flag from ACDB)
    const result = await this.builderService.buildSpfModuleDefinitions(
      this.parsedAwsp!,
      this.parsedAcdb!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert SPF module definitions
      const insertResult = await bulkRepo.insertSpfModuleDefinitions(
        result.entities,
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'SpfModuleDefinition');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} SPF module definitions (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'spf_module_definitions_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some SPF module definitions: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'spf_module_definitions_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 1d1: Build and Insert Module Manager Data
   */
  private async buildAndInsertModuleManagerData(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Build module manager data with system IDs assigned
    const moduleManagerData = await this.builderService.buildModuleManagerData(
      this.parsedAcdb!,
      this.currentFileId,
    );

    if (moduleManagerData.length > 0) {
      // Insert module manager data
      const insertResult =
        await bulkRepo.insertModuleManagerData(moduleManagerData);

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'ModuleManagerData');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${moduleManagerData.length} module manager data entries`,
          action: 'module_manager_data_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some module manager data: ${insertResult.errors.length} insertion failures out of ${moduleManagerData.length} entities`,
          action: 'module_manager_data_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 1d2: Build and Insert Driver Module Definitions
   */
  private async buildAndInsertDriverModuleDefinitions(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Get count of driver module definitions
    const awspModuleDefinitions =
      this.parsedAwsp!.getDriverModuleDefinitions() || [];

    if (awspModuleDefinitions.length === 0) {
      return;
    }

    // Build driver module definitions with system IDs assigned
    const result = await this.builderService.buildDriverModuleDefinitions(
      this.parsedAwsp!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert driver module definitions
      const insertResult = await bulkRepo.insertDriverModuleDefinitions(
        result.entities,
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'DriverModuleDefinition');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} driver module definitions (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'driver_module_definitions_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some driver module definitions: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'driver_module_definitions_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 1d3: Build and Insert VCPM Module Definitions
   */
  private async buildAndInsertVcpmModuleDefinitions(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    const awspVcpmModuleDefinitions =
      this.parsedAwsp!.getVcpmModuleDefinitions() || [];

    if (awspVcpmModuleDefinitions.length === 0) {
      return;
    }

    const result = await this.builderService.buildVcpmModuleDefinitions(
      this.parsedAwsp!,
      this.currentFileId,
    );

    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      const insertResult = await bulkRepo.insertVcpmModuleDefinitions(
        result.entities,
      );

      this.collectInsertionErrors(insertResult, 'VcpmModuleDefinition');

      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} VCPM module definitions (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'vcpm_module_definitions_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some VCPM module definitions: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'vcpm_module_definitions_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 1e: Build and Insert Subgraph Property Definitions
   */
  private async buildAndInsertSubgraphPropertyDefinitions(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Build subgraph property definitions with system IDs assigned
    const result = await this.builderService.buildSubgraphPropertyDefinitions(
      this.parsedAwsp!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert subgraph property definitions
      const insertResult = await bulkRepo.insertSubgraphPropertyDefinitions(
        result.entities,
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'SubgraphPropertyDefinition');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} subgraph property definitions (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'subgraph_property_definitions_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some subgraph property definitions: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'subgraph_property_definitions_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 1f: Build and Insert Container Property Definitions
   */
  private async buildAndInsertContainerPropertyDefinitions(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Build container property definitions with system IDs assigned
    const result = await this.builderService.buildContainerPropertyDefinitions(
      this.parsedAwsp!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert container property definitions
      const insertResult = await bulkRepo.insertContainerPropertyDefinitions(
        result.entities,
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'ContainerPropertyDefinition');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} container property definitions (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'container_property_definitions_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some container property definitions: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'container_property_definitions_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 2: Build and Insert Subgraphs
   */
  private async buildAndInsertSubgraphs(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Build subgraphs with system IDs assigned
    const result = await this.builderService.buildSubgraphs(
      this.parsedAcdb!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert subgraphs and capture result
      const insertResult = await bulkRepo.insertSubgraphs(result.entities);

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'Subgraph');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} subgraphs (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'subgraphs_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some subgraphs: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'subgraphs_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 3: Build and Insert Containers
   */
  private async buildAndInsertContainers(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Build containers with system IDs assigned
    const result = await this.builderService.buildContainers(
      this.parsedAcdb!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert containers and capture result
      const insertResult = await bulkRepo.insertContainers(result.entities);

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'Container');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} containers (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'containers_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some containers: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'containers_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 4: Build and Insert SPF Modules with Calibration Data
   * This phase handles both KeyVectors and SPF Modules (with attached CKVs)
   */
  private async buildAndInsertSpfModules(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.SPF_MODULE_BUILDING);
    const result = await this.builderService.buildSpfModules(
      this.parsedAcdb!,
      this.currentFileId,
      this.parsedAwsp!,
    );
    const buildMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.SPF_MODULE_BUILDING,
    );
    this.logEntityBuildMetrics(buildMetrics, result.entities.length);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_SPF_MODULE_BUILD),
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert SPF Modules (with CKVs already attached)
      this.profiler?.start(PROFILER_OPERATIONS.SPF_MODULE_INSERT);
      const insertResult = await bulkRepo.insertSpfModules(result.entities);
      const insertMetrics = this.profiler?.end(
        PROFILER_OPERATIONS.SPF_MODULE_INSERT,
      );
      this.logEntityInsertMetrics(insertMetrics, result.entities.length);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_SPF_MODULE_INSERT),
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'SpfModule');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} SPF modules (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'spf_modules_with_calibration_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some SPF modules: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'spf_modules_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 4b: Build and Insert Driver Modules with DKV Calibration Data
   */
  private async buildAndInsertDriverModules(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Build driver modules with system IDs assigned and calibration data attached
    const result = await this.builderService.buildDriverModules(
      this.parsedAcdb!,
      this.currentFileId,
    );

    // Collect build issues
    this.issueCollector.addIssues(result.issues);

    if (result.entities.length > 0) {
      // Insert driver modules (with DKV data already attached)
      const insertResult = await bulkRepo.insertDriverModules(result.entities);

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'DriverModule');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${result.entities.length} driver modules with DKV calibration data (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'driver_modules_with_calibration_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some driver modules: ${insertResult.errors.length} insertion failures out of ${result.entities.length} entities (build: ${result.errorCount} errors, ${result.warningCount} warnings)`,
          action: 'driver_modules_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 5: Build and Insert Data Links
   */
  private async buildAndInsertDataLinks(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.DATA_LINK_BUILDING);
    const dataLinks = await this.builderService.buildDataLinks(
      this.parsedAcdb!,
      this.currentFileId,
    );
    const buildMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.DATA_LINK_BUILDING,
    );
    this.logEntityBuildMetrics(buildMetrics, dataLinks.length);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_DATA_LINK_BUILD),
    );

    if (dataLinks.length > 0) {
      // Profile insertion phase
      this.profiler?.start(PROFILER_OPERATIONS.DATA_LINK_INSERT);
      const insertResult = await bulkRepo.insertDataLinks(dataLinks);
      const insertMetrics = this.profiler?.end(
        PROFILER_OPERATIONS.DATA_LINK_INSERT,
      );
      this.logEntityInsertMetrics(insertMetrics, dataLinks.length);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_DATA_LINK_INSERT),
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'DataLink');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${dataLinks.length} data links`,
          action: 'data_links_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some data links: ${insertResult.errors.length} insertion failures out of ${dataLinks.length} entities`,
          action: 'data_links_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }

  /**
   * Phase 6: Build and Insert Control Links
   */
  private async buildAndInsertControlLinks(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.CONTROL_LINK_BUILDING);
    const {controlLinks, controlPortIntents} =
      await this.builderService.buildControlLinks(
        this.parsedAcdb!,
        this.currentFileId,
      );
    const buildMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.CONTROL_LINK_BUILDING,
    );
    this.logEntityBuildMetrics(buildMetrics, controlLinks.length);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_CONTROL_LINK_BUILD),
    );

    if (controlLinks.length > 0) {
      // Profile insertion phase
      this.profiler?.start(PROFILER_OPERATIONS.CONTROL_LINK_INSERT);
      const insertResult = await bulkRepo.insertControlLinks(controlLinks);
      const insertMetrics = this.profiler?.end(
        PROFILER_OPERATIONS.CONTROL_LINK_INSERT,
      );
      this.logEntityInsertMetrics(insertMetrics, controlLinks.length);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_CONTROL_LINK_INSERT),
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'ControlLink');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${controlLinks.length} control links`,
          action: 'control_links_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some control links: ${insertResult.errors.length} insertion failures out of ${controlLinks.length} entities`,
          action: 'control_links_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }

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
   */
  private async buildAndInsertUsecases(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.USECASE_BUILDING);
    const usecases = await this.builderService.buildUsecases(
      this.parsedAcdb!,
      this.currentFileId,
    );
    const buildMetrics = this.profiler?.end(
      PROFILER_OPERATIONS.USECASE_BUILDING,
    );
    this.logEntityBuildMetrics(buildMetrics, usecases.length);
    this.logMemorySnapshot(
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_USECASE_BUILD),
    );

    if (usecases.length > 0) {
      // Profile insertion phase
      this.profiler?.start(PROFILER_OPERATIONS.USECASE_INSERT);
      const insertResult = await bulkRepo.insertUseCases(usecases);
      const insertMetrics = this.profiler?.end(
        PROFILER_OPERATIONS.USECASE_INSERT,
      );
      this.logEntityInsertMetrics(insertMetrics, usecases.length);
      this.logMemorySnapshot(
        this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_USECASE_INSERT),
      );

      // Collect insertion errors from the insert result
      this.collectInsertionErrors(insertResult, 'UseCase');

      // Log based on actual insertion result
      if (insertResult.ok) {
        this.logger?.logInfo({
          msg: `Successfully inserted ${usecases.length} usecases`,
          action: 'usecases_persisted',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
        });
      } else {
        this.logger?.logError({
          msg: `Failed to insert some usecases: ${insertResult.errors.length} insertion failures out of ${usecases.length} entities`,
          action: 'usecases_insertion_failed',
          component: 'UploadFileOrchestrator',
          tag: 'database-persistence',
          timestamp: new Date(),
          error: new Error(
            '\t' + insertResult.errors.map(e => e.message).join('\n\t'),
          ),
        });
      }
    }
  }
}
