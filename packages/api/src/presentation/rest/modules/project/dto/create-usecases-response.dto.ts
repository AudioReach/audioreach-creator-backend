/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {createZodDto} from 'nestjs-zod';
import {
  UsecaseIdentifierWithChangeInfoDtoSchema,
  CreateUsecasesResponseDtoSchema,
  CreateManualUsecasesResponseDtoSchema,
} from '@arc/core';
import {ApiIssueItem} from '../../../common/dto/api-response/api-issue-item.dto.js';

export class UsecaseIdentifierWithChangeInfoDto extends createZodDto(
  UsecaseIdentifierWithChangeInfoDtoSchema,
) {}

export class CreateUsecasesResponseDto extends createZodDto(
  CreateUsecasesResponseDtoSchema,
) {
  @ApiProperty({
    type: [ApiIssueItem],
    description: 'Issues encountered during reconciliation',
  })
  issues!: ApiIssueItem[];
}

export class CreateManualUsecasesResponseDto extends createZodDto(
  CreateManualUsecasesResponseDtoSchema,
) {
  @ApiProperty({
    type: [ApiIssueItem],
    description: 'Issues encountered during creation',
  })
  issues!: ApiIssueItem[];
}
