/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {createZodDto} from 'nestjs-zod';
import {ControlLinkDtoSchema, ControlLinkPropertiesDtoSchema} from '@arc/core';
import {EndPointLink} from '../../../common/utils/index.js';

export class ControlLinkResponseDto extends createZodDto(ControlLinkDtoSchema) {
  @ApiProperty({
    description: 'Related endpoint links',
    type: [EndPointLink],
    required: false,
  })
  relatedEndPointLinks?: EndPointLink[];
}

export class ControlLinkPropertiesResponseDto extends createZodDto(
  ControlLinkPropertiesDtoSchema,
) {}
