/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Body,
  Param,
  HttpStatus,
  HttpException,
  UseGuards,
  Post,
} from '@nestjs/common';
import {ApiTags, ApiParam} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {BaseComponentDto, SystemIdsRequestDto} from '../../common/dto/index.js';
import {SubsystemDto} from './dto/subsystem.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';

/**
 * Controller to support all Subsystem related APIs for usecase design.
 * Provides Subsystem related APIs for usecase design.
 */
@ApiTags('subsystems')
@Controller('arc-api/v1/projects/:projectId/subsystems')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class SubsystemController extends BaseController {
  constructor() {
    super();
  }

  /**
   * Get subsystems for system ids
   */
  @Post('get')
  @ApiDocumentationWithExample({
    summary: 'Get subsystems for provided systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of subsystem system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [SubsystemDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Some subsystems are not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subsystems',
      },
    ],
  })
  async getSubsystems(
    @Param('projectId') projectId: string,
    @Body() subsystemSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<SubsystemDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting subsystems in project ${projectId}: ${JSON.stringify(subsystemSystemIds)}`,
    );
    throw new HttpException(
      'subsystems retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Get all top level components (in case of multiple layers) in a subsystem for provided usecases.
   * @param subsystemId - subsystem id
   * @param usecaseIds - usecase ids. If not provided, components in a subsystem for all usecases will be returned.
   * @returns List of components in the subsystem
   */
  @Post(':subsystemSystemId/components/get')
  @ApiParam({
    name: 'subsystemSystemId',
    required: true,
    description: 'Subsystem system ID',
    type: Number,
  })
  @ApiDocumentationWithExample({
    summary:
      'Get all top level components in a subsystem for provided usecases',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription:
      'List of system ids for usecases. Optional.\n\n' +
      'If provided, only top level components in the subystem for these usecases will be returned.\n\n' +
      'Otherwise, all top level of components in the subsystem will be returned.',
    requestRequired: false,

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [BaseComponentDto<number>],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subsystem cannot be found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get components in subsystem)',
      },
    ],
  })
  async getComponentsInSubsystem(
    @Param('projectId') projectId: string,
    @Param('subsystemSystemId') subsystemSystemId: string,
    @Body() usecaseSystemIds?: SystemIdsRequestDto,
  ): Promise<ApiResult<BaseComponentDto<number>[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting components for subgraph ${subsystemSystemId} in project ${projectId} with optional usecase system ids: ${JSON.stringify(usecaseSystemIds)}`,
    );
    throw new HttpException(
      'Get components in subsystem retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
