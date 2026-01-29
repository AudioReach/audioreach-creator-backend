/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class DriverModuleCalDataDto {
  @ApiProperty({description: 'Calibration key vector'})
  ckv!: string;

  @ApiProperty({description: 'Parameter ID'})
  pid!: string;

  @ApiProperty({description: 'Parameter name'})
  name!: string;

  @ApiProperty({description: 'Calibration data structure'})
  calData!: Record<string, unknown>;
}

/**
 * DTO representing a driver module with its calibration data
 */
export class DriverModuleDto {
  @ApiProperty({description: 'Module ID'})
  mid!: string;

  @ApiProperty({description: 'Module name'})
  name!: string;

  @ApiProperty({
    type: [DriverModuleCalDataDto],
    description: 'Calibration data for this driver module',
  })
  calData!: DriverModuleCalDataDto[];
}
