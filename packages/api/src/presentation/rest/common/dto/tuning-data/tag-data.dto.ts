/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {createZodDto} from 'nestjs-zod';
import {TkvCalDataDtoSchema} from '@arc/core';
import {ParameterResponseDto} from '../parameter.dto.js';

export class TkvCalDataResponseDto extends createZodDto(TkvCalDataDtoSchema) {
  @ApiProperty({
    description:
      'Array of parameter data, one entry per PID. ' +
      'Each entry contains the system identifier, PID, name, description, ' +
      'and the list of tag elements belonging to that parameter.',
    type: [ParameterResponseDto],
  })
  declare parameters: ParameterResponseDto[];
}
