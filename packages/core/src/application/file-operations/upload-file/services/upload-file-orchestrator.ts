/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from 'application/ports/persistence/unit-of-work.js';
import type {BulkImportRepository} from '../../../ports/persistence/repositories/bulk-import/bulk-import.repository.js';
import type {BulkEntityInsertResult} from '../../../ports/persistence/repositories/bulk-import/insert-result.js';
import type {BulkKeyDefinitionInsertResult} from '../../../ports/persistence/repositories/bulk-import/key-definition-insertion-report.js';
import type {BulkModuleDefinitionInsertResult} from '../../../ports/persistence/repositories/bulk-import/spf-module-definition-insertion-report.js';
import type {BulkModuleInsertResult} from '../../../ports/persistence/repositories/bulk-import/spf-module-insertion-report.js';
import type {
  BulkDataLinkInsertResult,
  BulkControlLinkInsertResult,
} from '../../../ports/persistence/repositories/bulk-import/link-insertion-report.js';
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
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building definitions');
    }

    // Build key definitions
    const keyDefinitions = await this.builderService.buildKeyDefinitions(
      this.parsedAwsp,
      this.currentFileId,
    );

    if (keyDefinitions && keyDefinitions.length > 0) {
      const keyDefResult: BulkKeyDefinitionInsertResult =
        await bulkRepo.insertKeyDefinitions(
          keyDefinitions as readonly Omit<KeyDefinition, 'systemId'>[],
        );

      // Store foreign key mappings for subsequent phases
      this.foreignKeyMapper.setKeyDefinitionMappings(keyDefResult);

      const successfulInserts = keyDefResult.results.filter(
        r => r.success,
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
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error(
        'Parsed data not available for building SPF module definitions',
      );
    }

    // Build SPF module definitions
    const spfModuleDefinitions =
      await this.builderService.buildSpfModuleDefinitions(
        this.parsedAwsp,
        this.currentFileId,
      );

    if (spfModuleDefinitions && spfModuleDefinitions.length > 0) {
      const spfModuleDefResult: BulkModuleDefinitionInsertResult =
        await bulkRepo.insertModuleDefinitions(
          spfModuleDefinitions as readonly Omit<
            SpfModuleDefinition,
            'systemId'
          >[],
        );

      // Store foreign key mappings for subsequent phases
      this.foreignKeyMapper.setModuleDefinitionMappings(spfModuleDefResult);

      const successfulInserts = spfModuleDefResult.results.filter(
        r => r.success,
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
  private async buildAndInsertSubgraphs(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building subgraphs');
    }

    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.SUBGRAPH_BUILDING);
    const subgraphs = this.builderService.buildSubgraphs(
      this.parsedAcdb,
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
   */
  private async buildAndInsertContainers(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building containers');
    }

    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.CONTAINER_BUILDING);
    const containers = this.builderService.buildContainers(
      this.parsedAcdb,
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
   */
  private async buildAndInsertSpfModules(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building SPF modules');
    }

    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.SPF_MODULE_BUILDING);
    const spfModules = this.builderService.buildSpfModules(
      this.parsedAcdb,
      this.currentFileId,
      this.parsedAwsp,
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
   */
  private async buildAndInsertDataLinks(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building data links');
    }

    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.DATA_LINK_BUILDING);
    const dataLinks = this.builderService.buildDataLinks(
      this.parsedAcdb,
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
   */
  private async buildAndInsertControlLinks(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building control links');
    }

    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.CONTROL_LINK_BUILDING);
    const {controlLinks, controlPortIntents} =
      this.builderService.buildControlLinks(
        this.parsedAcdb,
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
   */
  private async buildAndInsertUsecases(
    bulkRepo: BulkImportRepository,
  ): Promise<void> {
    if (!this.parsedAcdb || !this.parsedAwsp) {
      throw new Error('Parsed data not available for building usecases');
    }

    // Profile building phase
    this.profiler?.start(PROFILER_OPERATIONS.USECASE_BUILDING);
    const usecases = this.builderService.buildUsecases(
      this.parsedAcdb,
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
  }
}
