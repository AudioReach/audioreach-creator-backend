/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {UploadFileCommand} from './upload-file.command.js';
import type {FileSystemPort} from '../../ports/file-system/file-system.port.js';
import type {PathRef} from '../shared/utils/file-ref.js';
import {UploadFileOrchestrator} from './services/upload-file-orchestrator.js';
import type {WorkerPoolPort} from '../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../shared/types/logger.interface.js';
import type {ProfilerPort} from '../../ports/profiling/profiler.port.js';
import type {IdGenerationPort} from '../../ports/id-generation/id-generation.port.js';
import type {NaturalIdGenerationPort} from '../../ports/id-generation/natural-id-generation.port.js';
import {generateUuid} from '../../../shared/utilities/uuid.js';
import {
  FILE_OPEN_STATUS,
  type FileOpenStatus,
} from '../../../domain/entities/usecase-data/project/arc-db-file.js';
import type {ValidationReport} from '../../../domain/validation/validation-report.js';
import type {
  ResultError,
  ResultWarning,
} from '../../../shared/types/api-result.js';

export type UploadFileResult = {
  projectId: string;
  projectName: string;
  projectDescription: string;
  errors?: ResultError[];
  warnings?: ResultWarning[];
  openStatus: FileOpenStatus;
  /**
   * Null for now — domain validation via fromEntities() will be added
   * when UploadOrchestrator exposes parsed entities.
   * DATA_LOSS issues are stored in the files table and surfaced via
   * POST /validate (which merges stored DATA_LOSS issues with live engine issues).
   */
  validationReport: ValidationReport | null;
};

export class UploadFileHandler implements CommandHandler<
  UploadFileCommand,
  UploadFileResult
> {
  private uploadOrchestrator: UploadFileOrchestrator;

  constructor(
    private readonly uow: UnitOfWork,
    private readonly fileSystem: FileSystemPort,
    private readonly idGenerator: IdGenerationPort,
    private readonly naturalIdGenerator: NaturalIdGenerationPort,
    workerPool?: WorkerPoolPort,
    logger?: Logger,
    profiler?: ProfilerPort,
  ) {
    this.uploadOrchestrator = new UploadFileOrchestrator(
      this.fileSystem,
      this.uow,
      this.idGenerator,
      this.naturalIdGenerator,
      workerPool,
      logger,
      profiler,
    );
  }

  async handle(command: UploadFileCommand): Promise<UploadFileResult> {
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
    await this.uow.startTransaction();

    const createResult = await this.uow
      .getProjectRepository()
      .createOfflineProject(projectName, projectDescription, {
        description: `ACDB: ${command.acdb.name}, AWSP: ${command.awsp.name}`,
        metadata: 'upload',
        fileName: JSON.stringify({
          acdb: command.acdb.name,
          awsp: command.awsp.name,
          uploadedAt: new Date().toISOString(),
        }),
        isTarget: true,
        openStatus: FILE_OPEN_STATUS.Loading,
        dataLossIssues: [],
      });

    if (!createResult.success) {
      await this.uow.rollback();
      throw new Error(`Project creation failed: ${createResult.errorMessage}`);
    }

    await this.uow.commit();

    if (this.uow.isInTransaction()) {
      throw new Error(
        'Transaction state error: Phase 1 commit succeeded but transaction is still active.',
      );
    }

    const project = createResult.data.project;
    const fileSystemId = createResult.data.file.systemId;

    // ========== PHASE 2: Bulk Upload (NON-TRANSACTIONAL) ==========
    // Note: UOW still has active QueryRunner (CommandBus will release it)
    // Bulk upload uses same connection but NO transaction
    // Collects errors instead of throwing.
    // On unexpected throw: delete the project (cascades to file) so no orphaned LOADING record is left.
    let uploadResult: Awaited<
      ReturnType<typeof this.uploadOrchestrator.orchestrate>
    >;
    try {
      uploadResult = await this.uploadOrchestrator.orchestrate(
        command.acdb,
        command.awsp,
        fileSystemId,
      );
    } catch (error) {
      const originalMessage =
        error instanceof Error ? error.message : String(error);
      try {
        await this.uow.getProjectRepository().deleteProject(project.systemId);
      } catch {
        // cleanup failure swallowed — original error takes precedence
      }
      throw new Error(`Upload failed unexpectedly: ${originalMessage}`);
    }

    // ========== PHASE 3: Persist file status and header metadata ==========
    const finalStatus: FileOpenStatus =
      uploadResult.dataLossIssues.length > 0
        ? FILE_OPEN_STATUS.PendingDataLossAck
        : FILE_OPEN_STATUS.Ready;

    try {
      await this.uow
        .getProjectRepository()
        .updateFileStatus(
          fileSystemId,
          finalStatus,
          uploadResult.dataLossIssues,
        );

      // Persist ACDB header metadata if available
      if (uploadResult.headerData) {
        await this.uow
          .getProjectRepository()
          .updateFileHeader(fileSystemId, uploadResult.headerData);
      }
    } catch (error) {
      await this.uow.getProjectRepository().deleteProject(project.systemId);
      throw new Error(
        `Failed to persist file metadata after upload: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      projectId: project.systemId.toString(),
      projectName: project.name,
      projectDescription: project.description,
      errors: uploadResult.errors,
      warnings: uploadResult.warnings,
      openStatus: finalStatus,
      validationReport: null,
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
