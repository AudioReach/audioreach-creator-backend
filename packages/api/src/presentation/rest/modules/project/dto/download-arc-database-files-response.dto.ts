/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {FileInfo} from '../info/file-info.js';

/** DTO for downloading ARC database files */
export class DownloadArcDatabaseFilesResponseDto {
  @ApiProperty({description: 'Acdb file information'})
  acdbFile!: FileInfo;

  @ApiProperty({description: 'Workspace file information'})
  workspaceFile!: FileInfo;
}
