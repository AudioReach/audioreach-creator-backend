/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {createZodDto} from 'nestjs-zod';
import {DataLinkDtoSchema} from '@arc/core';
import {EndPointLink} from '../../../common/utils/index.js';

export class DataLinkResponseDto extends createZodDto(DataLinkDtoSchema) {
  @ApiProperty({
    description: 'Related endpoint links',
    type: [EndPointLink],
    required: false,
  })
  relatedEndPointLinks?: EndPointLink[];
}
