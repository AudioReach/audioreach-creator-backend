/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {ToolPolicy} from '../enums/tool-policy.emum.js';
import {PidType} from '../enums/pid-type.enum.js';

export class ParameterDefinitionSummaryInfo {
  @ApiProperty({description: 'Unique system identifier for the param'})
  systemId!: string;

  @ApiProperty({description: 'Parameter identifier'})
  paramId!: number;

  // @ApiPropertyOptional({ description: 'Version of the parameter', required: false })
  // version?: number;

  // @ApiPropertyOptional({ description: 'Byte start of the version', required: false })
  // versionByteStart?: number;

  // @ApiPropertyOptional({ description: 'Byte length of the version', required: false })
  // versionByteLength?: number;

  @ApiProperty({description: 'Name of the parameter'})
  name!: string;

  @ApiProperty({description: 'Description of the parameter'})
  description!: string;

  // @ApiProperty({ description: 'Indicates if the parameter is a neural‑net parameter' })
  // isNeuralNet!: boolean;

  // @ApiProperty({ description: 'Indicates if the parameter is offloaded' })
  // isOffloaded!: boolean;

  // @ApiProperty({ description: 'Indicates if the parameter has hardware acceleration', required: false })
  // isHwAccel?: boolean;

  // @ApiProperty({ description: 'Indicates if hardware acceleration is enabled for the parameter', required: false })
  // isHwAccelEnable?: boolean;

  @ApiProperty({description: 'Indicates if the parameter is hidden'})
  isHidden!: boolean;

  @ApiProperty({description: ' Indicates if the parameter is read‑only'})
  isReadOnly!: boolean;

  @ApiProperty({
    description: 'Indicates if the parameter is deprecated',
    required: false,
  })
  deprecated?: boolean;

  @ApiProperty({
    description: 'Tool policy associated with the parameter',
    enum: ToolPolicy,
  })
  toolPolicy!: ToolPolicy;

  @ApiProperty({description: 'PID type of the parameter', enum: PidType})
  pidType!: PidType;
}
