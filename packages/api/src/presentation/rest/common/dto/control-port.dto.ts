/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseComponentDto} from './base-component.dto.js';
import {PortType} from './data-port.dto.js';

export class ControlPortIntentDto {
  @ApiProperty({description: 'Intent ID'})
  id!: number;

  @ApiProperty({description: 'Intent name'})
  name?: string;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }
}

export class ControlPortDto extends BaseComponentDto<number> {
  @ApiProperty({description: 'Port type', enum: PortType})
  portType!: PortType;

  @ApiProperty({description: 'Control port name'})
  controlPortName?: string;

  @ApiProperty({
    description: 'Control port intents',
    type: [ControlPortIntentDto],
  })
  intents!: ControlPortIntentDto[];

  constructor(systemId: string, id: number);
  constructor(
    systemId: string,
    id: number,
    name: string,
    portType: PortType,
    intents: ControlPortIntentDto[],
  );
  constructor(
    systemId: string,
    id: number,
    name?: string,
    portType?: PortType,
    intents?: ControlPortIntentDto[],
  ) {
    super(systemId, id);

    if (name !== undefined && portType !== undefined && intents !== undefined) {
      this.portType = portType;
      this.intents = intents;
      this.controlPortName = name;
    }
  }
}
