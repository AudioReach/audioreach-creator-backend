/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterResponseDto} from '../../../../common/dto/parameter-response.dto.js';

/**
 * Request DTO for updating SPF module calibration data - supports multiple parameters
 */
export class UpdateSpfModuleCalDataRequestDto {
  @ApiProperty({
    description: 'Array of calibration data updates for multiple parameters',
    type: [ParameterResponseDto],
  })
  data!: ParameterResponseDto[];
}
