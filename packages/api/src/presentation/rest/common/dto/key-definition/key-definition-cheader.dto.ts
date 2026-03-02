/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class KeyDefinitionCHeaderDto {
  @ApiProperty({
    description: 'Key enum value for pseudo header file',
    required: false,
  })
  enumValue?: string;

  @ApiProperty({
    description: 'Key enum name for pseudo header file',
    required: false,
  })
  enumName?: string;

  @ApiProperty({
    description: 'Calibration key enum value for pseudo header file',
    required: false,
  })
  calibrationKeyEnumValue?: string;

  @ApiProperty({
    description: 'Graph key enum value for pseudo header file',
    required: false,
  })
  graphKeyEnumValue?: string;
}
