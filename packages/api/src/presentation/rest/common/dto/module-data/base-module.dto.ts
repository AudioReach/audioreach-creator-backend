/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseDto} from '../base.dto.js';

export abstract class BaseModuleSummaryDto extends BaseDto {
  @ApiProperty({
    description: 'Unique system identifier for the module instance',
  })
  systemId!: string;

  @ApiProperty({description: 'Module identifier'})
  moduleDefinitionId!: number; // uint

  @ApiProperty({description: 'Module name'})
  name!: string;
}

export abstract class BaseModuleDto extends BaseModuleSummaryDto {
  @ApiProperty({description: 'Description of the module', required: false})
  description?: string;

  @ApiProperty({description: 'Deprecation flag', required: false})
  deprecated?: boolean;
}
