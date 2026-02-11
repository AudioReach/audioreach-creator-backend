/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseComponentDto} from './base-component.dto.js';

export enum PortIoType {
  Input = 'Input',
  Output = 'Output',
}

export enum PortType {
  Static = 'Static',
  Dynamic = 'Dynamic',
}

export class DataPortDto extends BaseComponentDto<number> {
  @ApiProperty({description: 'Port IO type', enum: PortIoType})
  portIoType!: PortIoType;

  @ApiProperty({description: 'Port type', enum: PortType})
  portType!: PortType;

  set dataPortName(value: string) {
    this.name = value;
  }

  constructor(systemId: string, id: number);
  constructor(
    systemId: string,
    id: number,
    name: string,
    portIoType: PortIoType,
    portType: PortType,
    isVirtual?: boolean,
  );
  constructor(
    systemId: string,
    id: number,
    name?: string,
    portIoType?: PortIoType,
    portType?: PortType,
  ) {
    super(systemId, id);

    if (
      name !== undefined &&
      portIoType !== undefined &&
      portType !== undefined
    ) {
      this.portIoType = portIoType;
      this.portType = portType;
      this.name = name;
    }
  }
}
