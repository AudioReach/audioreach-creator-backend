/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {SubsystemDtoSchema} from '@arc/core';
import {ApiProperty} from '@nestjs/swagger';
import {EndPointLink} from '../../../common/utils/utilities.js';

export class SubsystemResponseDto extends createZodDto(SubsystemDtoSchema) {
  @ApiProperty({description: 'Related endpoint links', type: [EndPointLink]})
  declare relatedEndPointLinks: EndPointLink[];
}
