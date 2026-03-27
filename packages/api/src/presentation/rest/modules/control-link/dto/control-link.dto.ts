/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {BaseComponentDto, BaseValueElement} from '../../../common/dto/index.js';
import {
  ComponentInfoType,
  CONN_CTRL_TYPE,
} from '../../../common/utils/enums.js';

/**
 * DTO for control port intents
 */
export class ControlLinkIntentsDto {
  @ApiProperty({
    description: 'Control Link Intent Propety',
  })
  readonly propId: number = 0x08_00_10_62; //intent property id.
  readonly propName: string = 'Inents Property';

  intents: IntentDto[];

  constructor(controlPortIntents: IntentDto[]) {
    this.intents = controlPortIntents;
  }
}

export class IntentDto {
  @ApiProperty({
    description: 'Intent ID',
  })
  id: number;

  @ApiProperty({
    description: 'Intent name',
  })
  name: string;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
  }
}

/**
 * DTO for control port intent
 */
export class ControlLinkHeapIdDto {
  @ApiProperty({
    description: 'Control Link HeapId Propety',
  })
  readonly propId: number = 0x08_00_13_6f; //heapId property id.
  readonly propName: string = 'Heap Property';

  heapId: BaseValueElement;

  constructor(id: BaseValueElement) {
    this.heapId = id;
  }
}

/**
 * DTO for control link properties
 */
export class ControlLinkPropertiesDto {
  @ApiProperty({
    description: 'Allocated Intents',
    type: ControlLinkIntentsDto,
  })
  AllocatedIntents: ControlLinkIntentsDto;

  @ApiProperty({
    description: 'Supported Intents',
    type: ControlLinkIntentsDto,
    required: false,
  })
  SupportedIntents?: ControlLinkIntentsDto;

  @ApiProperty({
    description: 'HeapId',
    type: ControlLinkHeapIdDto,
  })
  HeapId: ControlLinkHeapIdDto;

  constructor(
    allocatedIntents: ControlLinkIntentsDto,
    heapId: ControlLinkHeapIdDto,
    supportedIntents?: ControlLinkIntentsDto,
  ) {
    this.AllocatedIntents = allocatedIntents;
    this.SupportedIntents = supportedIntents;
    this.HeapId = heapId;
  }
}

/**
 * DTO for control link
 */
export class ControlLinkDto extends BaseComponentDto<number> {
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
    parentId: number | undefined,
  ) {
    super(systemId, id);
    this.sourceId = sourceId;
    this.sourcePortId = sourcePortId;
    this.destinationId = destinationId;
    this.destinationPortId = destinationPortId;
    this.isDangling = isDangling;
    this.connectionType = connectionType;
    this.parentId = parentId;
    this.componentType = ComponentInfoType.ControlLink;
  }
}
