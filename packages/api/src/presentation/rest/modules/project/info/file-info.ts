/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/** DTO representing file metadata and content */
export class FileInfo {
  @ApiProperty({description: 'Name of the file'})
  name!: string;

  @ApiProperty({description: 'MIME type or file extension'})
  fileType!: string;

  @ApiProperty({description: 'Binary content of the file'})
  content!: Uint8Array;
}
