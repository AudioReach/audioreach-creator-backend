/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * DTO for new data link request
 */
export class NewDataLinkRequest {
  @ApiProperty({
    description: 'Start component ID',
  })
  startComponentId: number;

  @ApiProperty({
    description: 'Start port ID',
  })
  startPortId: number;

  @ApiProperty({
    description: 'End component ID',
  })
  endComponentId: number;

  @ApiProperty({
    description: 'End port ID',
  })
  endPortId: number;

  @ApiProperty({
    description: 'Parent ID',
    required: false,
  })
  parentId?: number;

  @ApiProperty({
    description: 'Is dangling',
    default: false,
  })
  isDangling: boolean;

  constructor(
    startComponentId: number,
    startPortId: number,
    endComponentId: number,
    endPortId: number,
    parentId?: number,
    isDangling: boolean = false,
  ) {
    this.startComponentId = startComponentId;
    this.startPortId = startPortId;
    this.endComponentId = endComponentId;
    this.endPortId = endPortId;
    this.parentId = parentId;
    this.isDangling = isDangling;
  }
}
