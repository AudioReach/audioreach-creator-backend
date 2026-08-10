/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {ContainerPropertiesDtoSchema, ContainerDtoSchema} from '@arc/core';
import {EndPointLink} from '../../../common/utils/utilities.js';
import {ApiProperty} from '@nestjs/swagger';

export class ContainerPropertiesResponseDto extends createZodDto(
  ContainerPropertiesDtoSchema,
) {}

export class ContainerResponseDto extends createZodDto(ContainerDtoSchema) {
  @ApiProperty({description: 'Related endpoint links', type: [EndPointLink]})
  relatedEndPointLinks!: EndPointLink[];
}
