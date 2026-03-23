/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {DriverModuleDto} from '../../../../common/dto/module-data/driver-module.dto.js';
import {CkvTuningConfigDto} from '../../../../common/dto/module-data/ckv-tuning-config.dto.js';

export class DriverModuleResponseDto extends DriverModuleDto {
  @ApiProperty({
    description:
      'Supported Calibration Key-Values (CKVs) tuning configuration with associated parameters. This field is only included when includeTuningConfiguration query parameter is set to true. If data is not available, the value will be null.',
    type: CkvTuningConfigDto,
    required: false,
    nullable: true,
  })
  supportedCkvs?: CkvTuningConfigDto | null;
}
