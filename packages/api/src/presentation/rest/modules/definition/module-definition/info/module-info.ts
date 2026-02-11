/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {DataPortInfo, StaticCtrlPortInfo, IntentInfo} from './port-info.js';
import {ModuleTypeInfo} from './module-type-info.js';
import {MdfModuleType} from '../enums/mdf-module-type.js';

export class ContainerTypeInfo {
  @ApiProperty({description: 'Name'})
  name!: string;

  @ApiProperty({description: 'Value'})
  value!: string;
}

export class ModuleInfo {
  @ApiProperty({description: 'Framework PID'})
  pidFramework!: number; // corresponds to uint

  @ApiProperty({description: 'Optional stack size', required: false})
  stackSize?: number; // corresponds to nullable uint

  @ApiProperty({
    description: 'List of container type information',
    type: [ContainerTypeInfo],
  })
  containerTypeInfo!: ContainerTypeInfo[];

  @ApiProperty({description: 'Meta data', required: false})
  metaData?: number; // corresponds to ushort

  @ApiProperty({description: 'Reserved field', required: false})
  reserved?: number; // corresponds to ushort

  @ApiProperty({description: 'Input data port information'})
  inputDataPortInfo!: DataPortInfo;

  @ApiProperty({description: 'Output data port information'})
  outputDataPortInfo!: DataPortInfo;

  @ApiProperty({
    description: 'Static control ports',
    type: [StaticCtrlPortInfo],
  })
  staticCtrlPorts!: StaticCtrlPortInfo[];

  @ApiProperty({description: 'Dynamic intents', type: [IntentInfo]})
  dynamicIntents!: IntentInfo[];

  @ApiProperty({
    description: 'Information about the module type',
    type: ModuleTypeInfo,
    required: false,
  })
  moduleTypeInfo?: ModuleTypeInfo;

  @ApiProperty({
    description: 'MDF module type',
    enum: MdfModuleType,
    required: false,
  })
  mdfModuleType?: MdfModuleType;
}
