/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {NameValueDto} from '../../../../common/dto/name-value.dto.js';

/**
 * DTO grouping the selected interface type and version for a custom SPF module.
 */
export class SpfCustomModuleInterfaceDto {
  @ApiProperty({description: 'Interface type', type: NameValueDto})
  type!: NameValueDto;

  @ApiProperty({description: 'Interface version', type: NameValueDto})
  version!: NameValueDto;
}

/**
 * DTO for custom SPF module metadata (instance-specific values).
 */
export class SpfCustomModuleMetadataDto {
  @ApiProperty({description: 'Module type', type: NameValueDto})
  type!: NameValueDto;

  @ApiProperty({
    description: 'Selected interface',
    type: SpfCustomModuleInterfaceDto,
  })
  interface!: SpfCustomModuleInterfaceDto;

  @ApiProperty({description: 'File name'})
  fileName!: string;

  @ApiProperty({description: 'Endpoint function tag'})
  endPointFunctionTag!: string;
}
