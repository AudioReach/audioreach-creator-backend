/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class UsecaseAliasDto {
  @ApiProperty({description: 'Usecase identifier'})
  usecase!: string;

  @ApiProperty({description: 'Usecase alias name'})
  usecaseAlias!: string;

  @ApiProperty({description: 'Usecase ID'})
  usecaseId!: string;

  @ApiProperty({
    description: 'Previous alias name (for updates)',
    required: false,
  })
  oldUsecaseAlias?: string;

  @ApiProperty({
    description: 'Previous usecase ID (for updates)',
    required: false,
  })
  oldUsecaseId?: string;
}
