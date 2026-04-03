/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * Request DTO for partially updating a SPF module definition.
 */
export class PatchSpfModuleDefinitionRequestDto {
  @ApiProperty({
    description: 'Indicates if the module is loaded at bootup',
    required: false,
  })
  isLoadedAtBootup?: boolean;
}
