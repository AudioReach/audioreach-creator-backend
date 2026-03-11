/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

export class TagDefinitionCHeaderDto {
  @ApiProperty({
    description: 'Tag enum value for pseudo header file',
    required: false,
  })
  enumValue?: string;

  @ApiProperty({
    description: 'Tag enum name for pseudo header file',
    required: false,
  })
  enumName?: string;
}
