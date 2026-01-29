/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class UsecaseCategoryDto {
  @ApiProperty({description: 'Usecase category name'})
  usecaseCategory!: string;

  @ApiProperty({
    description: 'Previous category name (for updates)',
    required: false,
  })
  oldUsecaseCategory?: string;

  @ApiProperty({description: 'Sort order for display', required: false})
  sortOrder?: string;

  @ApiProperty({
    type: [String],
    description: 'Array of usecase system IDs in this category',
  })
  usecases!: string[];
}
