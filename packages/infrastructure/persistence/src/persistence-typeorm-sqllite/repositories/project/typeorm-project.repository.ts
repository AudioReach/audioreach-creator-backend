/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import {
  ArcDbFile,
  IssueFactory,
  Project,
  PROJECT_TYPE,
  Result,
  type ArcDbFileInit,
  type FileHeaderData,
  type FileOpenStatus,
  type ProjectCreationResult,
  type ProjectRepository,
  type ValidationIssue,
} from '@arc/core';
import {ProjectSchema} from '../../entity-schema/project-data/project.schema.js';
import {ArcDbFileSchema} from '../../entity-schema/project-data/arc-db-file.schema.js';

export class TypeOrmProjectRepository implements ProjectRepository {
  constructor(private readonly manager: EntityManager) {}

  async createOfflineProject(
    projectName: string,
    projectDescription: string,
    file: Omit<ArcDbFileInit, 'systemId'>,
  ): Promise<Result<ProjectCreationResult>> {
    try {
      const projectRow = await this.manager.save(ProjectSchema, {
        name: projectName,
        description: projectDescription,
        type: PROJECT_TYPE.OFFLINE,
      });

      const fileRow = await this.manager.save(ArcDbFileSchema, {
        description: file.description,
        metadata: file.metadata,
        fileName: file.fileName,
        isTarget: file.isTarget,
        openStatus: file.openStatus,
        dataLossIssues: null,
        projectSystemId: projectRow.systemId,
        lastReservedId: 0,
      });

      return Result.ok({
        project: new Project(
          projectRow.systemId,
          projectRow.name,
          projectRow.description,
          PROJECT_TYPE.OFFLINE,
        ),
        file: new ArcDbFile({
          systemId: fileRow.systemId,
          description: file.description,
          metadata: file.metadata,
          fileName: file.fileName,
          isTarget: Boolean(fileRow.isTarget),
          openStatus: fileRow.openStatus,
          dataLossIssues: [],
        }),
      });
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  async updateFileStatus(
    fileSystemId: number,
    openStatus: FileOpenStatus,
    dataLossIssues: ValidationIssue[],
  ): Promise<void> {
    await this.manager.update(
      ArcDbFileSchema,
      {systemId: fileSystemId},
      {
        openStatus,
        dataLossIssues:
          dataLossIssues.length > 0 ? JSON.stringify(dataLossIssues) : null,
      },
    );
  }

  async deleteProject(systemId: number): Promise<void> {
    await this.manager.delete(ProjectSchema, {systemId});
  }

  async updateFileHeader(
    fileSystemId: number,
    headerData: FileHeaderData,
  ): Promise<void> {
    await this.manager.update(
      ArcDbFileSchema,
      {systemId: fileSystemId},
      {
        headerVersion: headerData.headerVersion,
        acdbVersionMajor: headerData.acdbVersionMajor,
        acdbVersionMinor: headerData.acdbVersionMinor,
        acdbVersionRevision: headerData.acdbVersionRevision,
        acdbVersionCplInfo: headerData.acdbVersionCplInfo,
        codecInfos: headerData.codecInfos,
        modifiedDate: headerData.modifiedDate,
        oemInfo: headerData.oemInfo,
      },
    );
  }
}
