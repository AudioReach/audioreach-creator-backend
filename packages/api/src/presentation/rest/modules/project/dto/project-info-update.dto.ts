/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsOptional} from 'class-validator';

/** DTO for updating project information */
export class ProjectInfoUpdateDto {
  @ApiProperty({
    required: false,
    description: 'Optional new name for the project',
  })
  @IsOptional()
  name?: string;

  @ApiProperty({
    required: false,
    description: 'Optional new description for the project',
  })
  @IsOptional()
  description?: string;

  @ApiProperty({
    required: false,
    description: 'Optional description for a diff‑merge operation',
  })
  @IsOptional()
  diffMergeDescription?: string;
}
