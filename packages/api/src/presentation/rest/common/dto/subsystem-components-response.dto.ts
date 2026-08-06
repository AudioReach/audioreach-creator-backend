/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createZodDto} from 'nestjs-zod';
import {ApiProperty} from '@nestjs/swagger';
import {SubsystemComponentsDtoSchema} from '@arc/core';
import type {ComponentsWithSubsystemsResponseDto} from './component-collection-with-subsystems.dto.js';

import {ComponentsWithSubsystemsResponseDto as ComponentsWithSubsystemsResponseDtoClass} from './component-collection-with-subsystems.dto.js';

export class SubsystemComponentsResponseDto extends createZodDto(
  SubsystemComponentsDtoSchema,
) {
  @ApiProperty({
    description:
      'Child components within this subsystem (spfModules, dataLinks, controlLinks, nested subsystems)',
    type: () => ComponentsWithSubsystemsResponseDtoClass,
    required: true,
  })
  declare children: ComponentsWithSubsystemsResponseDto;
}
