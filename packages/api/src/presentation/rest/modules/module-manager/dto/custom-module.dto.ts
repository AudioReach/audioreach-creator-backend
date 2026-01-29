/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class CustomModuleDto {
  @ApiProperty({description: 'Processor ID'})
  procId!: string;

  @ApiProperty({description: 'Module ID'})
  id!: string;

  @ApiProperty({description: 'Interface type'})
  interfaceType!: string;

  @ApiProperty({description: 'Interface version'})
  interfaceVersion!: string;

  @ApiProperty({description: 'Module type'})
  moduleType!: string;

  @ApiProperty({description: 'File name'})
  fileName!: string;

  @ApiProperty({description: 'Module tag'})
  tag!: string;

  @ApiProperty({description: 'Error code'})
  errorCode!: string;

  @ApiProperty({description: 'Display name', required: false})
  displayName?: string;
}
