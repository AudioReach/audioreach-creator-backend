/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ChangeInfoDto} from '../../../../common/dto/base.dto.js';

/**
 * Response DTO for deleting custom SPF module metadata.
 * Contains only change information.
 */
export class DeleteSpfCustomModuleMetadataResponseDto {
  @ApiProperty({
    description: 'Change information for this resource',
    type: ChangeInfoDto,
  })
  changeInfo!: ChangeInfoDto;
}
