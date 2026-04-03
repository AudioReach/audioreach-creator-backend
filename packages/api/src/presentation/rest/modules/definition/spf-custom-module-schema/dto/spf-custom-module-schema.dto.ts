/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {NameValueDto} from '../../../../common/dto/name-value.dto.js';

/**
 * DTO holding allowed values for custom SPF module interface selection.
 */
export class AllowedSpfCustomModuleInterfaceDto {
  @ApiProperty({description: 'Interface type', type: NameValueDto})
  type!: NameValueDto;

  @ApiProperty({
    description: 'Allowed interface versions',
    type: [NameValueDto],
  })
  allowedVersions!: NameValueDto[];
}

/**
 * DTO describing the static schema (valid options) applicable to all custom SPF modules within a project.
 */
export class SpfCustomModuleSchemaDto {
  @ApiProperty({
    description: 'Allowed module types',
    type: [NameValueDto],
  })
  allowedTypes!: NameValueDto[];

  @ApiProperty({
    description: 'Allowed interfaces',
    type: [AllowedSpfCustomModuleInterfaceDto],
  })
  allowedInterfaces!: AllowedSpfCustomModuleInterfaceDto[];
}
