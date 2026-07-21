/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';

/**
 * DTO for creating a new control link.
 * isInterUsecase replaces the legacy isDangling field.
 */
export class CreateControlLinkRequest {
  @ApiProperty({
    description: 'Source component system ID (module or subsystem)',
  })
  startComponentId: number;

  @ApiProperty({
    description: 'Source control port system ID',
  })
  startPortId: number;

  @ApiProperty({
    description: 'Destination component system ID (module or subsystem)',
  })
  endComponentId: number;

  @ApiProperty({
    description: 'Destination control port system ID',
  })
  endPortId: number;

  @ApiProperty({
    description:
      'Optional parent subsystem system ID for scoping the graph context',
    required: false,
  })
  parentSystemId?: string;

  @ApiProperty({
    description:
      'True when the link crosses usecase boundaries (INTER_USECASE). Defaults to false.',
    default: false,
    required: false,
  })
  isInterUsecase?: boolean;

  constructor(
    startComponentId: number,
    startPortId: number,
    endComponentId: number,
    endPortId: number,
    parentSystemId?: string,
    isInterUsecase = false,
  ) {
    this.startComponentId = startComponentId;
    this.startPortId = startPortId;
    this.endComponentId = endComponentId;
    this.endPortId = endPortId;
    this.parentSystemId = parentSystemId;
    this.isInterUsecase = isInterUsecase;
  }
}
