/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseComponentDto, PropertyDto} from '../../../common/dto/index.js';

export class ContainerDto extends BaseComponentDto<number> {
  @ApiProperty({description: 'Container type'})
  type!: string;

  constructor(systemId: string, id: number, type: string) {
    super(systemId, id);
    this.type = type;
  }
}

export class ContainerPropertiesDto {
  @ApiProperty({description: 'Container system ID'})
  containerSystemId!: string;

  @ApiProperty({
    description: 'Array of container properties',
    type: [PropertyDto],
  })
  properties: PropertyDto[];

  constructor(containerSystemId: string, properties: PropertyDto[]) {
    this.containerSystemId = containerSystemId;
    this.properties = properties;
  }
}
