/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../orchestration/cqrs/queries/query-handler.js';
import type {
  ProjectHeaderQuery,
  ProjectHeaderResult,
  HeaderResultCodecInfo,
} from './project-header.query.js';
import type {QueryServices} from '../../services/query-services.js';

/**
 * Handler for ProjectHeaderQuery.
 * Retrieves ACDB header information from the database.
 */
export class ProjectHeaderHandler implements QueryHandler<
  ProjectHeaderQuery,
  Promise<ProjectHeaderResult>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: ProjectHeaderQuery): Promise<ProjectHeaderResult> {
    // 1. Resolve fileSystemId from projectId
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        Number(query.projectId),
      );

    // 2. Get header information from database
    const headerInfo =
      await this.queryServices.projectQueryService.getProjectHeader(
        fileSystemId,
      );

    if (!headerInfo) {
      throw new Error(
        `Header information not found for project ${query.projectId}`,
      );
    }

    // 3. Parse codecInfos from JSON string
    const codecInfos: HeaderResultCodecInfo[] =
      headerInfo.codecInfos && headerInfo.codecInfos !== '[]'
        ? (JSON.parse(headerInfo.codecInfos) as HeaderResultCodecInfo[])
        : [];

    // 4. Format and return result
    const v = headerInfo.acdbVersion;
    const acdbVersion = {
      major: v.major,
      minor: v.minor,
      revision: v.revision,
      cplInfo: v.cplInfo,
    };
    return {
      headerVersion: headerInfo.headerVersion,
      acdbVersion,
      acdbVersionString: `${v.major}.${v.minor}.${v.revision}.${v.cplInfo}`,
      codecInfos,
      modifiedDate: headerInfo.modifiedDate,
      modifiedDateFormatted: new Date(
        headerInfo.modifiedDate * 1000,
      ).toISOString(),
      oemInfo: headerInfo.oemInfo,
    };
  }
}
