/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ApiProperty} from '@nestjs/swagger';
import {IsNotEmpty, IsOptional, IsNumber} from 'class-validator';

/**
 * Base class for SPF module creation requests
 */
export class BaseSpfModuleRequest {
  @ApiProperty({
    description: 'Module ID',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  moduleId!: number;

  @ApiProperty({
    description: 'Processor ID',
    required: true,
  })
  @IsNotEmpty()
  @IsNumber()
  procId!: number;

  @ApiProperty({
    description: 'Parent ID, Optional',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  parentId?: number;

  @ApiProperty({
    description:
      'Subgraph ID. Optional. If not provided, should create a new subgraph.',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  subgraphId?: number;

  @ApiProperty({
    description:
      'Container ID. Optional. If not provided, should create a container.',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  containerId?: number;
}

/**
 * Request for creating an SPF module with basic information only.
 * Backend will create default data for ckvData, tkvData, and tagData.
 */
export class BasicSpfModuleRequest extends BaseSpfModuleRequest {
  @ApiProperty({description: 'Request type', enum: ['basic'], default: 'basic'})
  requestType = 'basic' as const;
}

/**
 * Request for creating an SPF module with detailed calibration and tag data.
 * Backend will use the provided data instead of defaults.
 */
export class DetailedSpfModuleRequest extends BaseSpfModuleRequest {
  @ApiProperty({
    description: 'Request type',
    enum: ['detailed'],
    default: 'detailed',
  })
  requestType = 'detailed' as const;

  @ApiProperty({
    description: 'ckv calibration data. Required when requestType is detailed.',
    required: true,
  })
  @IsNotEmpty()
  ckvData!: object;

  @ApiProperty({
    description: 'tkv calibration data. Required when requestType is detailed.',
    required: true,
  })
  @IsNotEmpty()
  tkvData!: object;

  @ApiProperty({
    description: 'Module tag data. Required when requestType is detailed.',
    required: true,
  })
  @IsNotEmpty()
  tagData!: object;
}

/**
 * Union type for SPF module creation requests.
 * Use BasicSpfModuleRequest for basic creation or DetailedSpfModuleRequest for detailed creation.
 */
export type NewSpfModuleRequest =
  | BasicSpfModuleRequest
  | DetailedSpfModuleRequest;

export class CloneSpfModuleRequest {
  @ApiProperty({
    description: 'Reference Module instance ID',
    required: true,
  })
  readonly referenceModuleIid: number;

  @ApiProperty({
    description: 'Target parent ID',
    required: false,
  })
  readonly targetParentId?: number;

  @ApiProperty({
    description:
      'Target subgraph ID. If not provided, a new subgraph will be created',
    required: false,
  })
  readonly targetSubgraphId?: number;

  @ApiProperty({
    description:
      'Target container ID. If not provided, a new container will be created',
    required: false,
  })
  readonly targetContainerId?: number;

  constructor(
    moduleIid: number,
    targetParentId?: number,
    targetSubgraphId?: number,
    targetContainerId?: number,
  ) {
    this.referenceModuleIid = moduleIid;
    this.targetParentId = targetParentId;
    this.targetSubgraphId = targetSubgraphId;
    this.targetContainerId = targetContainerId;
  }
}

export class AddSpfModuleDataRequest {
  @ApiProperty({
    description: 'Module inforamtion',
    required: true,
  })
  readonly moduleInfo: NewSpfModuleRequest;

  @ApiProperty({
    description: 'ckv calibration data',
    required: false,
  })
  readonly ckvData?: object;

  @ApiProperty({
    description: 'tkv calibration data',
    required: false,
  })
  readonly tkvData?: object;

  @ApiProperty({
    description: 'Module tag data',
    required: false,
  })
  readonly tagData?: object;

  constructor(
    moduleInfo: NewSpfModuleRequest,
    ckv?: object,
    tkv?: object,
    tag?: object,
  ) {
    this.moduleInfo = moduleInfo;
    this.ckvData = ckv;
    this.tkvData = tkv;
    this.tagData = tag;
  }
}
