/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * DTO for updating the selected interface type and version for a custom SPF module.
 */
export class UpdateSpfCustomModuleInterfaceDto {
  @ApiProperty({description: 'Interface type name'})
  typeName!: string;

  @ApiProperty({description: 'Interface version name'})
  versionName!: string;
}

/**
 * DTO for updating custom SPF module metadata.
 */
export class UpdateSpfCustomModuleMetadataDto {
  @ApiProperty({description: 'Module type name'})
  typeName!: string;

  @ApiProperty({
    description: 'Selected interface',
    type: UpdateSpfCustomModuleInterfaceDto,
  })
  interface!: UpdateSpfCustomModuleInterfaceDto;

  @ApiProperty({description: 'File name'})
  fileName!: string;

  @ApiProperty({description: 'Endpoint function tag'})
  endPointFunctionTag!: string;
}
