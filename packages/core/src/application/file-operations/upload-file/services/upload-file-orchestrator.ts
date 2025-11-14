import type {UnitOfWork} from 'application/ports/persistence/unit-of-work.js';
import {
  EntityBuilderService,
  type EntitiesReferenceIndexer,
} from './entity-builder-service.js';
import type {Container} from '../../../../domain/entities/usecase-data/container/container.js';
import type {SpfModule} from '../../../../domain/entities/usecase-data/module/spf-module.js';
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
} from '../../../../shared/profiling/profiler-types.js';

export class UploadFileOrchestrator implements EntitiesReferenceIndexer {
  private builderService: EntityBuilderService;
  private acdbParser: AcdbFileOrchestrator;
  private awspParser: AwspFileOrchestrator;

  /* -----EntitiesReferenceIndexer ------*/
  readonly moduleById: Map<number, SpfModule> = new Map<number, SpfModule>();
  readonly containerById: Map<number, Container> = new Map<number, Container>();
  /* -------------------------------------*/

  constructor(
    private filereader: FileReaderPort,
    private uow: UnitOfWork,
    workerPool?: WorkerPoolPort,
    logger?: Logger,
    private profiler?: ProfilerPort,
  ) {
    // Pass worker pool to both services
    this.builderService = new EntityBuilderService(this, workerPool, logger);

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

  async orchestrate(acdbPath: PathRef, awspPath: PathRef): Promise<boolean> {
    this.profiler?.start(PROFILER_OPERATIONS.FILE_ORCHESTRATION);
    this.profiler?.snapshot(MEMORY_SNAPSHOTS.BEFORE_PARSING);

    try {
      // Parse files into chunks
      this.profiler?.start(PROFILER_OPERATIONS.ACDB_PARSING);
      const parsedAcdb = await this.acdbParser.parseACDB(acdbPath);
      this.profiler?.end(PROFILER_OPERATIONS.ACDB_PARSING);

      this.profiler?.start(PROFILER_OPERATIONS.AWSP_PARSING);
      const parsedAwsp = await this.awspParser.parseAWSP(awspPath);
      this.profiler?.end(PROFILER_OPERATIONS.AWSP_PARSING);

      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_PARSING);

      // Call buildAll with the parsed data
      this.profiler?.start(PROFILER_OPERATIONS.ENTITY_BUILDING);
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.BEFORE_ENTITY_BUILDING);
      const result = await this.builderService.buildAll(parsedAcdb, parsedAwsp);
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_ENTITY_BUILDING);
      this.profiler?.end(PROFILER_OPERATIONS.ENTITY_BUILDING);

      // Persist entities
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.BEFORE_PERSISTENCE);
      await this.persistEntities();
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_PERSISTENCE);

      return result;
    } finally {
      this.profiler?.snapshot(MEMORY_SNAPSHOTS.AFTER_CLEANUP);
      this.profiler?.end(PROFILER_OPERATIONS.FILE_ORCHESTRATION);
    }
  }

  async persistEntities(): Promise<void> {
    this.profiler?.start(PROFILER_OPERATIONS.DATABASE_TRANSACTION);

    try {
      // Transactional DB updates
      await this.uow.executeInTransaction(async () => {
        // Fill the items in DB in the correct order
        // const moduleRepo = this.uow.getModuleRepo();
        // moduleRepo.BulkInsert(this.moduleById);
        // Add other repositories as needed
      });
    } finally {
      this.profiler?.end(PROFILER_OPERATIONS.DATABASE_TRANSACTION);
    }
  }
}
