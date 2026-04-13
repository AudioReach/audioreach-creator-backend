/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {UsecaseAliasDto} from '../../../../common/dto/usecase/usecase-alias.dto.js';

/**
 * Request DTO for updating usecase information.
 * Contains fields that can be updated for a usecase.
 */
export class UpdateUsecaseRequestDto {
  @ApiProperty({
    description:
      'Alias information for the usecase. Can be null to remove alias.',
    type: UsecaseAliasDto,
    nullable: true,
  })
  aliasInfo!: UsecaseAliasDto | null;
}
