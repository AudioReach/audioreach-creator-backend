/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterResponseDto} from '../../../../common/dto/parameter-response.dto.js';

/**
 * Request DTO for updating SPF module tag data - supports multiple parameters
 */
export class UpdateSpfModuleTagDataRequestDto {
  @ApiProperty({
    description: 'Array of tag data updates for multiple parameters',
    type: [ParameterResponseDto],
  })
  data!: ParameterResponseDto[];
}
