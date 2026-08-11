/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EndPointLink} from '../utils/utilities.js';
import {ApiProperty} from '@nestjs/swagger';
import {BaseComponentDto} from './base-component.dto.js';
import {DataPortDto} from './data-port.dto.js';
import {ControlPortDto} from './control-port.dto.js';

export class BaseConnectableComponentDto extends BaseComponentDto<number> {
  @ApiProperty({description: 'Parent component ID', required: false})
  parentId?: number;

  @ApiProperty({description: 'Data ports', type: [DataPortDto]})
  dataPorts!: DataPortDto[];

  @ApiProperty({description: 'Control ports', type: [ControlPortDto]})
  controlPorts!: ControlPortDto[];

  constructor(systemId: string, id: number) {
    super(systemId, id);
    const endPointLink = new EndPointLink();
    endPointLink.hypertextRef = `/components/${systemId}/properties`;
    endPointLink.method = 'GET';
    endPointLink.description = 'Get properties for a component.';
    this.relatedEndPointLinks = [endPointLink];
  }
}
