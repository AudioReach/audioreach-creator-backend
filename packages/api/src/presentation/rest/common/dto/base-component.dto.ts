/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {EndPointLink} from '../utils/utilities.js';
import {ApiProperty} from '@nestjs/swagger';
import {BaseDto} from './base.dto.js';

export class BaseComponentDto<T> extends BaseDto {
  @ApiProperty({description: 'System ID'})
  readonly systemId!: string;

  @ApiProperty({description: 'Component ID'})
  readonly id!: T;

  @ApiProperty({description: 'Component name'})
  name?: string;

  @ApiProperty({description: 'Related endpoint links', type: [EndPointLink]})
  relatedEndPointLinks: EndPointLink[] = [];

  constructor(systemId: string, id?: T) {
    super();
    this.systemId = systemId;
    if (id !== undefined) {
      Object.assign(this, {id});
    }
  }
}
