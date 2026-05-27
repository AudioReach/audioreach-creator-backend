/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../orchestration/cqrs/queries/query-handler.js';
import type {
  ProjectFilePropertiesQuery,
  ProjectFilePropertiesResult,
  AcdbCodecInfo,
} from './project-file-properties.query.js';
import type {QueryServices} from '../ports/persistence/query-services/query-services.js';

/**
 * Handler for ProjectFilePropertiesQuery.
 * Retrieves ACDB file properties from the database.
 */
export class ProjectFilePropertiesHandler implements QueryHandler<
  ProjectFilePropertiesQuery,
  Promise<ProjectFilePropertiesResult>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: ProjectFilePropertiesQuery,
  ): Promise<ProjectFilePropertiesResult> {
    // 1. Resolve fileSystemId from projectId
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        Number(query.projectId),
      );

    // 2. Get file properties from database
    const fileProperties =
      await this.queryServices.projectQueryService.getFileProperties(
        fileSystemId,
      );

    if (!fileProperties) {
      throw new Error(
        `File properties not found for project ${query.projectId}`,
      );
    }

    // 3. Parse codecInfos from JSON string
    const codecInfos: AcdbCodecInfo[] =
      fileProperties.codecInfos && fileProperties.codecInfos !== '[]'
        ? (JSON.parse(fileProperties.codecInfos) as AcdbCodecInfo[])
        : [];

    // 4. Format and return result
    const v = fileProperties.acdbVersion;
    const acdbVersion = {
      major: v.major,
      minor: v.minor,
      revision: v.revision,
      cplInfo: v.cplInfo,
    };
    return {
      acdbVersion,
      codecInfos,
      modifiedDate: new Date(fileProperties.modifiedDate * 1000).toISOString(),
      oemInfo: fileProperties.oemInfo,
    };
  }
}
