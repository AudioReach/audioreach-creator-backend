/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  NotImplementedException,
  Body,
  Param,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Post,
} from '@nestjs/common';
import {ApiTags, ApiParam} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {BaseComponentDto, SystemIdsRequestDto} from '../../common/dto/index.js';
import {SubsystemDto} from './dto/subsystem.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';

/**
 * Controller to support all Subsystem related APIs for usecase design.
 * Provides Subsystem related APIs for usecase design.
 */
@ApiTags('subsystems')
@Controller('arc-api/v1/projects/:projectId/subsystems')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(PartialSuccessInterceptor)
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
   * Query subsystems for system ids
   */
  @Post('query')
  @ApiDocumentationWithExample({
    summary: 'Query subsystems for provided systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of subsystem system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'All subsystems found successfully',
        dto: [SubsystemDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some subsystems could not be retrieved (see errors array)',
        dto: [SubsystemDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subsystems',
      },
    ],
  })
  async querySubsystems(
    @Param('projectId') projectId: string,
    @Body() subsystemSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<SubsystemDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting subsystems in project ${projectId}: ${JSON.stringify(subsystemSystemIds)}`,
    );
    throw new NotImplementedException('querySubsystems is not implemented yet');
  }

  /**
   * Get all top level components (in case of multiple layers) in a subsystem for provided usecases.
   * @param subsystemId - subsystem id
   * @param usecaseIds - usecase ids. If not provided, components in a subsystem for all usecases will be returned.
   * @returns List of components in the subsystem
   */
  @Post(':subsystemSystemId/components/query')
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
        description: 'Project or subsystem not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get components in subsystem)',
      },
    ],
  })
  async queryComponentsInSubsystem(
    @Param('projectId') projectId: string,
    @Param('subsystemSystemId') subsystemSystemId: string,
    @Body() usecaseSystemIds?: SystemIdsRequestDto,
  ): Promise<ApiResult<BaseComponentDto<number>[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting components for subgraph ${subsystemSystemId} in project ${projectId} with optional usecase system ids: ${JSON.stringify(usecaseSystemIds)}`,
    );
    throw new NotImplementedException(
      'queryComponentsInSubsystem is not implemented yet',
    );
  }
}
