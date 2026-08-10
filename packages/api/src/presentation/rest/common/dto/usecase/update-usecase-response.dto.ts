/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {UsecaseSummaryDto} from './usecase-summary.dto.js';
import {UsecaseCategorySummaryDto} from './usecase-category-summary.dto.js';
import {USECASE_TYPE, type UsecaseType} from './types/usecase-type.js';

export class UpdateUsecaseResponseDto extends UsecaseSummaryDto {
  @ApiProperty({
    description: 'Type of the usecase',
    enum: Object.values(USECASE_TYPE),
  })
  usecaseType!: UsecaseType;

  @ApiProperty({
    description:
      'Array of categories for the usecase. Can be empty if no categories are assigned.',
    type: [UsecaseCategorySummaryDto],
  })
  categories!: UsecaseCategorySummaryDto[];
}
