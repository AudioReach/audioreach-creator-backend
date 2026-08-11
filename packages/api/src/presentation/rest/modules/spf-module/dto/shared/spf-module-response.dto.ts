/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {
  SpfModuleDtoSchema,
  DataPortDtoSchema,
  ControlPortDtoSchema,
  type PropertyDto as CorePropertyDto,
} from '@arc/core';
import {ApiProperty} from '@nestjs/swagger';
import {EndPointLink} from '../../../../common/utils/utilities.js';

export class DataPortResponseDto extends createZodDto(DataPortDtoSchema) {}

export class ControlPortResponseDto extends createZodDto(
  ControlPortDtoSchema,
) {}

// properties is omitted because its element union uses z.lazy(), which nestjs-zod
// cannot resolve to a stable $ref — it is re-declared manually below.
export class SpfModuleResponseDto extends createZodDto(
  SpfModuleDtoSchema.omit({properties: true}),
) {
  @ApiProperty({description: 'Related endpoint links', type: [EndPointLink]})
  relatedEndPointLinks!: EndPointLink[];

  @ApiProperty({description: 'Module instance properties', required: false})
  properties?: CorePropertyDto[];
}

export class SpfModulePropertiesResponseDto extends createZodDto(
  SpfModuleDtoSchema.pick({properties: true}),
) {}
