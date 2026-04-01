/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseDto} from '../base.dto.js';
import {KeyValueDto} from '../key-value.dto.js';
import {UsecaseAliasDto} from './usecase-alias.dto.js';

/**
 * Summary DTO containing essential usecase identification fields.
 * Used for list views and lightweight usecase representations.
 */
export class UsecaseSummaryDto extends BaseDto {
  @ApiProperty({
    description: 'Unique system identifier for the usecase',
    type: String,
  })
  systemId!: string;

  @ApiProperty({
    description: 'Array of Key-Value pair for the usecase',
    type: [KeyValueDto],
  })
  gkv!: KeyValueDto[];

  @ApiProperty({
    description:
      'Alias information for the usecase. Can be null if no alias is assigned.',
    type: UsecaseAliasDto,
    nullable: true,
  })
  aliasInfo!: UsecaseAliasDto | null;
}
