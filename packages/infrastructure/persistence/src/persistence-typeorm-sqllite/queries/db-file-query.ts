/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  ProjectHeaderMetadata,
  ACDBVersionInfo,
  CodecInfo,
} from '@arc/core';

/**
 * Shape of the ArcDbFile row returned by the header metadata query.
 */
interface ArcDbFileHeaderRow {
  headerVersion: number;
  acdbVersionMajor: number;
  acdbVersionMinor: number;
  acdbVersionRevision: number;
  acdbVersionCplInfo: number;
  codecInfos: string;
  modifiedDate: number;
  oemInfo: string;
}

/**
 * Query object for file-related database operations.
 * Encapsulates queries against the ArcDbFile table.
 */
export class DbFileQuery {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Read ACDB project header metadata from the files table.
   * Returns header information persisted during upload.
   *
   * @param fileSystemId - The file system ID to query
   * @returns ProjectHeaderMetadata object with version, codecs, OEM info, etc.
   * @throws Error if file not found
   */
  async readProjectHeader(
    fileSystemId: number,
  ): Promise<ProjectHeaderMetadata> {
    const fileRepo = this.dataSource.getRepository('ArcDbFile');

    const file = (await fileRepo.findOne({
      where: {systemId: fileSystemId},
      select: [
        'headerVersion',
        'acdbVersionMajor',
        'acdbVersionMinor',
        'acdbVersionRevision',
        'acdbVersionCplInfo',
        'codecInfos',
        'modifiedDate',
        'oemInfo',
      ],
    })) as ArcDbFileHeaderRow | null;

    if (!file) {
      throw new Error(`File not found: ${fileSystemId}`);
    }

    // Parse codecInfos from JSON string
    const codecInfos: CodecInfo[] =
      file.codecInfos && file.codecInfos !== '[]'
        ? (JSON.parse(file.codecInfos) as CodecInfo[])
        : [];

    // Build version with defaults for missing/zero values
    const version: ACDBVersionInfo = {
      major: file.acdbVersionMajor || 1,
      minor: file.acdbVersionMinor || 0,
      revision: file.acdbVersionRevision || 0,
      cplInfo: file.acdbVersionCplInfo || 0,
    };

    // Return header metadata with defaults for missing/zero values
    return {
      version,
      codecInfos,
      modifiedDate: file.modifiedDate || Date.now(),
      oemInfo: file.oemInfo || 'AudioReach Creator',
    };
  }
}
