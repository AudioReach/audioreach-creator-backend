/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * DTO for new link request
 */
export class NewLinkRequest {
  @ApiProperty({
    description: 'Start component ID',
    example: 12_345,
  })
  startComponentId: number;

  @ApiProperty({
    description: 'Start port ID',
    example: 1,
  })
  startPortId: number;

  @ApiProperty({
    description: 'End component ID',
    example: 67_890,
  })
  endComponentId: number;

  @ApiProperty({
    description: 'End port ID',
    example: 2,
  })
  endPortId: number;

  @ApiProperty({
    description: 'Parent ID',
    example: 54_321,
    required: false,
  })
  parentId?: number;

  @ApiProperty({
    description: 'Is dangling',
    example: false,
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
