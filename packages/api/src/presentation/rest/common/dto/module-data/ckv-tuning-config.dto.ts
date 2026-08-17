/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {KeyValuePairsInfoDto} from '../kv-info.dto.js';

class SupportedParameterInfoDto {
  @ApiProperty({
    description: 'Unique identifier for the system containing this parameter',
  })
  systemId!: string;

  @ApiProperty({description: 'parameterId'})
  parameterId!: string;

  @ApiProperty({description: 'Human-readable display name for the parameter'})
  name!: string;
}

/**
 * CKV Tuning Configuration DTO containing associated CKVs and supported parameters.
 */
export class CkvTuningConfigDto {
  @ApiProperty({
    description: 'Associated key-value pairs',
    type: [KeyValuePairsInfoDto],
  })
  associatedKvs!: KeyValuePairsInfoDto[];

  @ApiProperty({
    description: 'Supported parameter information',
    type: SupportedParameterInfoDto,
  })
  supportedParameters!: SupportedParameterInfoDto;
}
