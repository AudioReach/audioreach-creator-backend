/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * ACDB version information.
 */
export class ACDBVersionDto {
  @ApiProperty({
    description: 'ACDB major version number',
  })
  major!: number;

  @ApiProperty({
    description: 'ACDB minor version number',
  })
  minor!: number;

  @ApiProperty({
    description: 'ACDB revision number',
  })
  revision!: number;

  @ApiProperty({
    description: 'ACDB CPL info',
  })
  cplInfo!: number;
}

/**
 * Codec information.
 */
export class CodecInfoDto {
  @ApiProperty({
    description: 'Codec identifier',
  })
  codecId!: number;

  @ApiProperty({
    description: 'Codec major version',
  })
  majorVersion!: number;

  @ApiProperty({
    description: 'Codec minor version',
  })
  minorVersion!: number;
}

/**
 * Complete project header information response.
 */
export class ProjectHeaderResponseDto {
  @ApiProperty({
    description: 'Header format version',
  })
  headerVersion!: number;

  @ApiProperty({
    type: ACDBVersionDto,
    description: 'ACDB version information',
  })
  acdbVersion!: ACDBVersionDto;

  @ApiProperty({
    description:
      'ACDB version as formatted string (major.minor.revision.cplInfo)',
  })
  acdbVersionString!: string;

  @ApiProperty({
    type: [CodecInfoDto],
    description: 'Array of codec information',
  })
  codecInfos!: CodecInfoDto[];

  @ApiProperty({
    description: 'File modification date (Unix timestamp)',
  })
  modifiedDate!: number;

  @ApiProperty({
    description: 'File modification date (ISO 8601 format)',
  })
  modifiedDateFormatted!: string;

  @ApiProperty({
    description: 'OEM information string',
  })
  oemInfo!: string;
}
