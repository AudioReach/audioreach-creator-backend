/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ParameterDefinitionSummaryInfo} from '../info/parameter-definition-summary-info.js';

export abstract class BaseModuleDefinitionDto {
  @ApiProperty({description: 'Unique system identifier for the module'})
  systemId!: string;

  @ApiProperty({description: 'Module identifier'})
  moduleId!: number; // uint

  @ApiProperty({description: 'Module name'})
  name!: string;

  @ApiProperty({description: 'Display name of the module'})
  displayName!: string;

  @ApiProperty({description: 'Description of the module'})
  description!: string;

  @ApiProperty({
    description: 'Array of parameter definitions',
    type: [ParameterDefinitionSummaryInfo],
  })
  paramDefinitionsSummaryInfo!: ParameterDefinitionSummaryInfo[];

  // @ApiProperty({ description: 'Indicates if this is a basic view' })
  // isBasicView!: boolean;

  //   @ApiPropertyOptional({ description: 'Id of the module that replaces this one' })
  //   replacedBy?: number; // uint?

  //   @ApiProperty({ description: 'Ids of modules this one replaces', type: Number, isArray: true })
  //   replaces!: number[]; // List<uint>

  @ApiProperty({description: 'Deprecation flag', required: false})
  deprecated?: boolean;

  // @ApiPropertyOptional({ description: 'Stub flag' })
  // stubbed?: boolean;
}
