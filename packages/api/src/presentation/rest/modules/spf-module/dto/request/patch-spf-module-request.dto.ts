/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * Request DTO for partially updating SPF module properties.
 * All fields are optional — only provided fields will be updated.
 */
export class PatchSpfModuleRequestDto {
  @ApiProperty({
    description: 'Module alias. Max 255 characters.',
    required: false,
    maxLength: 255,
  })
  alias?: string;

  @ApiProperty({
    description:
      'Container ID. If the ID does not exist, a new container will be created ' +
      'with default properties copied from the current container.',
    required: false,
  })
  containerId?: number;

  @ApiProperty({
    description:
      'Maximum number of input ports supported. ' +
      'Validated against module definition limits.',
    required: false,
  })
  maxInputPortsSupported?: number;

  @ApiProperty({
    description:
      'Maximum number of output ports supported. ' +
      'Validated against module definition limits.',
    required: false,
  })
  maxOutputPortsSupported?: number;

  @ApiProperty({
    description:
      'Maximum number of control ports supported. ' +
      'Validated against module definition limits.',
    required: false,
  })
  maxControlPortsSupported?: number;
}
