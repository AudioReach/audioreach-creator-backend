import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {OpenFileCommand} from './upload-file.command.js';
import type {FileReaderPort} from '../../ports/file-system/file-reader.port.js';
import type {FileRef} from '../shared/utils/file-ref.js';
import {UploadFileOrchestrator} from './services/upload-file-orchestrator.js';
import type {WorkerPoolPort} from '../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../shared/types/logger.interface.js';

export type OpenFileResult = {
  projectId: string;
  projectName: string;
  projectDescription: string;
};

export class OpenFileHandler
  implements CommandHandler<OpenFileCommand, OpenFileResult>
{
  private uploadOrchestrator: UploadFileOrchestrator;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly fileReader: FileReaderPort,
    workerPool?: WorkerPoolPort,
    logger?: Logger,
  ) {
    this.uploadOrchestrator = new UploadFileOrchestrator(
      this.fileReader,
      this.uow,
      workerPool,
      logger,
    );
  }

  async handle(command: OpenFileCommand): Promise<OpenFileResult> {
    this.validateInputs(command.acdb, command.awsp);

    // Orchestrate the process: parse, build, and persist
    await this.uploadOrchestrator.orchestrate(command.acdb, command.awsp);

    return {
      projectId: 'PENDING_DB_ID',
      projectName: '', //TODO: Get from orchestrator
      projectDescription: '', //TODO: Get from orchestrator
    };
  }

  private validateInputs(acdb: FileRef, awsp: FileRef): void {
    const acdbName = acdb.kind === 'path' ? acdb.name : acdb.name;
    const awspName = awsp.kind === 'path' ? awsp.name : awsp.name;
    if (!acdbName?.toLowerCase().endsWith('.acdb')) {
      throw new Error('Invalid acdb file extension; expected .acdb');
    }
    if (!awspName?.toLowerCase().endsWith('.awsp')) {
      throw new Error('Invalid workspace file extension; expected .awsp');
    }
  }
}
