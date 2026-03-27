/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseConnectableComponentDto} from '../../../../common/dto/component.dto.js';
import {PropertyDto} from '../../../../common/dto/index.js';
import {ComponentInfoType} from '../../../../common/utils/enums.js';

/**
 * DTO for SPF module properties
 */
export class SpfModulePropertiesDto {
  @ApiProperty({
    description: 'Array of module instance properties',
    type: [PropertyDto],
  })
  properties: PropertyDto[];

  constructor(properties: PropertyDto[]) {
    this.properties = properties;
  }
}

export class SpfModuleDto extends BaseConnectableComponentDto {
  @ApiProperty({description: 'Module alias'})
  alias!: string;

  @ApiProperty({description: 'Module ID'})
  moduleId: number;

  @ApiProperty({description: 'Subgraph ID'})
  subgraphId!: number;

  @ApiProperty({description: 'Container ID'})
  containerId!: number;

  @ApiProperty({description: 'Maximum number of input ports supported'})
  maxInputPortsSupported!: number;

  @ApiProperty({description: 'Maximum number of output ports supported'})
  maxOutputPortsSupported!: number;

  @ApiProperty({description: 'Maximum number of control ports supported'})
  maxControlPortsSupported!: number;

  @ApiProperty({description: 'Heap ID'})
  heapId!: number;

  constructor(
    systemId: string,
    id: number,
    moduleId: number,
    name: string,
    parentId?: number,
  ) {
    super(systemId, id);
    this.moduleId = moduleId;
    this.name = name;
    this.parentId = parentId;
    this.componentType = ComponentInfoType.Module;
  }
}
