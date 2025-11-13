import type {UnitOfWork} from 'application/ports/persistence/unit-of-work.js';
import {
  EntityBuilderService,
  type EntitiesReferenceIndexer,
} from './entity-builder-service.js';
import type {Container} from 'domain/entities/usecase-data/container/container.js';
import type {SpfModule} from 'domain/entities/usecase-data/module/spf-module.js';
import {AcdbParser} from './parsers/acdb-parser.js';
import {AwspParser} from './parsers/awsp-parser.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {PathRef} from '../utils/file-ref.js';
import type {FileReaderPort} from '../ports/file-reader.port.js';

export class UploadFileOrchestrator implements EntitiesReferenceIndexer {
  private builderService: EntityBuilderService;
  private acdbParser: AcdbParser;
  private awspParser: AwspParser;

  /* -----EntitiesReferenceIndexer ------*/
  readonly moduleById: Map<number, SpfModule> = new Map<number, SpfModule>();
  readonly containerById: Map<number, Container> = new Map<number, Container>();
  /* -------------------------------------*/

  constructor(
    private filereader: FileReaderPort,
    private uow: UnitOfWork,
    workerPool?: WorkerPoolPort,
    logger?: Logger,
  ) {
    // Pass worker pool to both services
    this.builderService = new EntityBuilderService(this, workerPool, logger);

    this.acdbParser = new AcdbParser(this.filereader, workerPool, logger);
    this.awspParser = new AwspParser();
  }

  async orchestrate(acdbPath: PathRef, awspPath: PathRef): Promise<boolean> {
    // Parse files into chunks
    var [parsedAcdb, parsedAwsp] = await Promise.all([
      this.acdbParser.parseACDB(acdbPath),
      this.awspParser.parseAWSP(awspPath),
    ]);

    // Call buildAll with the parsed data (implementation details to be added later)
    const result = await this.builderService.buildAll(parsedAcdb, parsedAwsp);

    await this.persistEntities();

    return result;
  }

  async persistEntities(): Promise<void> {
    // Transactional DB updates
    await this.uow.executeInTransaction(async () => {
      // Fill the items in DB in the correct order
      // const moduleRepo = this.uow.getModuleRepo();
      // moduleRepo.BulkInsert(this.moduleById);
      // Add other repositories as needed
    });
  }
}
