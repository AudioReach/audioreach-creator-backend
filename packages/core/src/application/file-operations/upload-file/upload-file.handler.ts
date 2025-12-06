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

    // Create project and file first to get proper IDs
    const projectRepo = this.uow.getProjectRepository();
    const projectName = this.extractProjectName(command.acdb, command.awsp);
    const projectDescription = this.extractProjectDescription(
      command.acdb,
      command.awsp,
    );

    const {project, file} = await projectRepo.createOfflineProject(
      new Project(0, projectName, projectDescription, PROJECT_TYPE.OFFLINE),
      {
        description: `ACDB: ${command.acdb.name}, AWSP: ${command.awsp.name}`,
        metadata: JSON.stringify({
          acdb: command.acdb.name,
          awsp: command.awsp.name,
          uploadedAt: new Date().toISOString(),
        }),
        tag: 'upload',
        isTarget: true,
      },
    );

    // Orchestrate the process with proper file ID
    await this.uploadOrchestrator.orchestrate(
      command.acdb,
      command.awsp,
      file.systemId,
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
