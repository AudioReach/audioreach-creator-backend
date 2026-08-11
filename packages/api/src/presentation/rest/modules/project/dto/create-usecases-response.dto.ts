/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {UsecaseResponseDto} from '../../usecase/dto/usecase-response.dto.js';
import {ApiIssueItem} from '../../../common/dto/api-response/api-issue-item.dto.js';

export class UsecaseIdentifierWithChangeInfoDto extends UsecaseResponseDto {
  @ApiProperty({
    description: 'The changeId for this usecase',
    type: String,
  })
  changeId!: string;
}

export class CreateUsecasesResponseDto {
  @ApiProperty({
    type: [UsecaseIdentifierWithChangeInfoDto],
    description: 'Usecases created during reconciliation',
  })
  created!: UsecaseIdentifierWithChangeInfoDto[];

  @ApiProperty({
    type: [UsecaseIdentifierWithChangeInfoDto],
    description: 'Usecases updated during reconciliation',
  })
  updated!: UsecaseIdentifierWithChangeInfoDto[];

  @ApiProperty({
    type: [UsecaseIdentifierWithChangeInfoDto],
    description: 'Usecases deleted during reconciliation',
  })
  deleted!: UsecaseIdentifierWithChangeInfoDto[];

  @ApiProperty({
    type: [ApiIssueItem],
    description: 'Issues encountered during reconciliation',
  })
  issues!: ApiIssueItem[];
}
