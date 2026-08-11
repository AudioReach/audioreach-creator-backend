/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterSummaryDto} from '../parameter-response.dto.js';
import {KeyValuePairsDto} from '../key-value.dto.js';

/**
 * CKV Tuning Configuration DTO containing associated CKVs and supported parameters.
 */
export class CkvTuningConfigDto {
  @ApiProperty({
    description: 'Associated key-value pairs',
    type: [KeyValuePairsDto],
  })
  associatedKvs!: KeyValuePairsDto[];

  @ApiProperty({
    description: 'Supported parameter information',
    type: ParameterSummaryDto,
  })
  supportedParameters!: ParameterSummaryDto;
}
