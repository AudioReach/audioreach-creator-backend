/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseComponentDto} from '../../../common/dto/index.js';
import {CONN_CTRL_TYPE} from '../../../common/utils/enums.js';

/**
 * DTO for data link
 */
export class DataLinkDto extends BaseComponentDto<number> {
  @ApiProperty({
    description: 'Source component ID',
  })
  sourceId: number;

  @ApiProperty({
    description: 'Source port ID',
  })
  sourcePortId: number;

  @ApiProperty({
    description: 'Destination component ID',
  })
  destinationId: number;

  @ApiProperty({
    description: 'Destination port ID',
  })
  destinationPortId: number;

  @ApiProperty({
    description: 'Parent ID',
    required: false,
  })
  parentId?: number;

  @ApiProperty({
    description: 'Is dangling',
  })
  isDangling: boolean;

  @ApiProperty({
    description: 'Connection type',
    enum: CONN_CTRL_TYPE,
  })
  connectionType: CONN_CTRL_TYPE;

  constructor(
    systemId: string,
    id: number,
    connectionType: CONN_CTRL_TYPE,
    sourceId: number,
    sourcePortId: number,
    destinationId: number,
    destinationPortId: number,
    isDangling: boolean,
    parentId?: number,
  ) {
    super(systemId, id);
    this.sourceId = sourceId;
    this.sourcePortId = sourcePortId;
    this.destinationId = destinationId;
    this.destinationPortId = destinationPortId;
    this.isDangling = isDangling;
    this.connectionType = connectionType;
    this.parentId = parentId;
  }
}
