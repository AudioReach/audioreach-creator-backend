/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {
  UsecaseIdentifierDto,
  UsecaseType,
} from '../../usecase/dto/usecase.dto.js';
import {ApiIssueItem} from '../../../common/dto/api-response/api-issue-item.dto.js';
import {type KeyValuePairsInfo} from '../../../common/dto/kv.dto.js';

export class UsecaseIdentifierWithChangeInfoDto extends UsecaseIdentifierDto {
  @ApiProperty({
    description: 'The changeId for this usecase',
    type: String,
  })
  changeId!: string;

  constructor(
    systemId: string,
    usecaseType: UsecaseType,
    kvInfo: KeyValuePairsInfo,
    changeId: string,
    aliasId?: number,
    aliasName?: string,
    category?: string,
  ) {
    super(systemId, usecaseType, kvInfo, aliasId, aliasName, category);
    this.changeId = changeId;
  }
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
