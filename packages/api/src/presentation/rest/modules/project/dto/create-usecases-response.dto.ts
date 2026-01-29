/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {UsecaseIdentifierDto} from '../../usecase/dto/usecase.dto.js';
import {ApiIssueItem} from '../../../common/dto/api-response/api-issue-item.dto.js';

export class CreateUsecasesResponseDto {
  @ApiProperty({
    type: [UsecaseIdentifierDto],
    description: 'Usecases created during reconciliation',
  })
  created!: UsecaseIdentifierDto[];

  @ApiProperty({
    type: [UsecaseIdentifierDto],
    description: 'Usecases updated during reconciliation',
  })
  updated!: UsecaseIdentifierDto[];

  @ApiProperty({
    type: [UsecaseIdentifierDto],
    description: 'Usecases deleted during reconciliation',
  })
  deleted!: UsecaseIdentifierDto[];

  @ApiProperty({
    type: [ApiIssueItem],
    description: 'Issues encountered during reconciliation',
  })
  issues!: ApiIssueItem[];
}
