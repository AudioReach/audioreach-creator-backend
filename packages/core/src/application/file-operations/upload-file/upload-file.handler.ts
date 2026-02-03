import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {OpenFileCommand} from './upload-file.command.js';
import type {FileReaderPort} from '../../ports/file-system/file-reader.port.js';
import type {PathRef} from '../shared/utils/file-ref.js';
import {UploadFileOrchestrator} from './services/upload-file-orchestrator.js';
import type {WorkerPoolPort} from '../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../shared/types/logger.interface.js';
import type {ProfilerPort} from '../../ports/profiling/profiler.port.js';
import {
  PROJECT_TYPE,
  Project,
} from '../../../domain/entities/usecase-data/project/project.js';
import {generateUuid} from '../../../shared/utilities/uuid.js';

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
    profiler?: ProfilerPort,
  ) {
    this.uploadOrchestrator = new UploadFileOrchestrator(
      this.fileReader,
      this.uow,
      workerPool,
      logger,
      profiler,
    );
  }

  async handle(command: OpenFileCommand): Promise<OpenFileResult> {
    this.validateInputs(command.acdb, command.awsp);

    const projectName =
      this.extractProjectName(command.acdb, command.awsp) +
      '_' +
      generateUuid();
    const projectDescription = this.extractProjectDescription(
      command.acdb,
      command.awsp,
    );

    // ========== PHASE 1: Project Creation (TRANSACTIONAL) ==========
    let project: Project;
    let fileSystemId: number;

    await this.uow.startTransaction();

    try {
      const projectRepo = this.uow.getProjectRepository();
      const result = await projectRepo.createOfflineProject(
        new Project(0, projectName, projectDescription, PROJECT_TYPE.OFFLINE),
        {
          description: `ACDB: ${command.acdb.name}, AWSP: ${command.awsp.name}`,
          metadata: 'upload',
          fileName: JSON.stringify({
            acdb: command.acdb.name,
            awsp: command.awsp.name,
            uploadedAt: new Date().toISOString(),
          }),
          isTarget: true,
        },
      );

      project = result.project;
      fileSystemId = result.file.systemId;

      await this.uow.commit();
    } catch (error) {
      await this.uow.rollback();
      throw new Error(
        `Project creation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // ========== VERIFICATION: Ensure transaction is closed ==========
    if (this.uow.isInTransaction()) {
      throw new Error(
        'Transaction state error: Phase 1 commit succeeded but transaction is still active. ' +
          'Cannot proceed to Phase 2 bulk upload. This indicates a critical issue with transaction management.',
      );
    }

    // ========== PHASE 2: Bulk Upload (NON-TRANSACTIONAL) ==========
    // Note: UOW still has active QueryRunner (CommandBus will release it)
    // Bulk upload uses same connection but NO transaction
    await this.uploadOrchestrator.orchestrate(
      command.acdb,
      command.awsp,
      fileSystemId,
    );

    return {
      projectId: project.systemId.toString(),
      projectName: project.name,
      projectDescription: project.description,
    };
  }

  private validateInputs(acdb: PathRef, awsp: PathRef): void {
    const acdbName = acdb.name;
    const awspName = awsp.name;
    if (!acdbName?.toLowerCase().endsWith('.acdb')) {
      throw new Error('Invalid acdb file extension; expected .acdb');
    }
    if (!awspName?.toLowerCase().endsWith('.awsp')) {
      throw new Error('Invalid workspace file extension; expected .awsp');
    }
  }

  private extractProjectName(acdb: PathRef, awsp: PathRef): string {
    // Extract project name from file names, removing extensions
    const acdbName = acdb.name.replace(/\.acdb$/i, '');
    const awspName = awsp.name.replace(/\.awsp$/i, '');

    // Use the common part or the ACDB name as project name
    return acdbName === awspName ? acdbName : `${acdbName}_project`;
  }

  private extractProjectDescription(acdb: PathRef, awsp: PathRef): string {
    return `Project created from ACDB file: ${acdb.name} and AWSP file: ${awsp.name}`;
  }
}
