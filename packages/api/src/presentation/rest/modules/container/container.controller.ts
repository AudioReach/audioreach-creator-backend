/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  NotImplementedException,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseInterceptors,
  UseGuards,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import {ApiTags, ApiParam, ApiExtraModels} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {
  ContainerPropertiesResponseDto,
  ContainerResponseDto,
} from './dto/container-response.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ConfigElementDto} from '../../common/dto/element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from '../../common/dto/element-data/elements/element-template-array.dto.js';
import {StructDto} from '../../common/dto/element-data/elements/struct.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {PropertyResponseDto} from '../../common/dto/property-response.dto.js';
import {UpdatePropertyRequestDto} from '../../common/dto/update-property-request.dto.js';
import {ParameterSummaryDto} from '../../common/dto/parameter-summary.dto.js';
import {PropertySummaryDto} from '../../common/dto/property-summary.dto.js';
import {ConfigElementSummaryDto} from '../../common/dto/element-data/elements/config-element-summary.dto.js';
import {ElementTemplateArraySummaryDto} from '../../common/dto/element-data/elements/element-template-array-summary.dto.js';
import {StructSummaryDto} from '../../common/dto/element-data/elements/struct-summary.dto.js';
import {SessionGuard} from '../../../../guards/session-guard.js';
import {ArcSession} from '../../../../guards/arc-session.decorator.js';
import {
  QueryBus,
  CommandBus,
  ContainerQuery,
  GetContainerPropertiesQuery,
  UpdateContainerPropertyCommand,
  Result,
  type ActiveSession,
  type ContainerDto,
} from '@arc/core';

/**
 * Controller to support all container related APIs for usecase design.
 * Provides container related APIs for usecase design.
 */
@ApiTags('containers')
@Controller('arc-api/v1/projects/:projectId/containers')
//@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(
  ConfigElementDto,
  ElementTemplateArrayDto,
  StructDto,
  ConfigElementSummaryDto,
  ElementTemplateArraySummaryDto,
  StructSummaryDto,
  ParameterSummaryDto,
  PropertySummaryDto,
  PropertyResponseDto,
)
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class ContainerController extends BaseController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {
    super();
  }

  /**
   * Query containers.
   */
  @Post('query')
  @ApiDocumentationWithExample({
    summary: 'Query containers for provided systemIds',
    requestDto: SystemIdsRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'All containers found successfully',
        dto: [ContainerResponseDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some containers could not be retrieved (see errors array)',
        dto: [ContainerResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get container(s)',
      },
    ],
  })
  async queryContainers(
    @Param('projectId') projectId: string,
    @Body() _request: SystemIdsRequestDto,
  ): Promise<ApiResult<ContainerResponseDto[]>> {
    const query = new ContainerQuery(
      Number.parseInt(projectId, 10), // radix 10 guards against octal misparse
      'client-id', // TODO: extract real clientId from JWT once auth wiring is done
    );

    const result = await this.queryBus.execute<Result<ContainerDto[]>>(query);

    return toApiResult(result, data =>
      data.map(c => ({...c, relatedEndPointLinks: []})),
    );
  }

  /**
   * Get all property data for a container.
   */
  @Get('/:containerSystemId/properties')
  @ApiParam({
    name: 'containerSystemId',
    required: true,
    type: String,
    description: 'System id of a container',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all property data for a container',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: ContainerPropertiesResponseDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — one or more property payloads missing (see issues array)',
        dto: ContainerPropertiesResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or container not found',
      },
    ],
  })
  async getContainerProperties(
    @Param('projectId') projectId: string,
    @Param('containerSystemId') containerSystemId: string,
  ): Promise<ApiResult<ContainerPropertiesResponseDto>> {
    const query = new GetContainerPropertiesQuery(
      Number.parseInt(projectId, 10),
      Number.parseInt(containerSystemId, 10),
      'client-id',
    );
    const result =
      await this.queryBus.execute<Result<ContainerPropertiesResponseDto>>(
        query,
      );
    return toApiResult(result);
  }

  /**
   * Get property data for a single container property by its system ID.
   */
  @Get('/:containerSystemId/properties/:propertySystemId')
  @ApiParam({
    name: 'containerSystemId',
    required: true,
    type: String,
    description: 'System id of a container',
  })
  @ApiParam({
    name: 'propertySystemId',
    required: true,
    type: String,
    description: 'System id of the property',
  })
  @ApiDocumentationWithExample({
    summary: 'Get property data for a single container property',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: PropertyResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project, container, or property not found',
      },
    ],
  })
  async getContainerProperty(
    @Param('projectId') projectId: string,
    @Param('containerSystemId') containerSystemId: string,
    @Param('propertySystemId') propertySystemId: string,
  ): Promise<ApiResult<PropertyResponseDto>> {
    await Promise.resolve();
    console.log(
      `Getting property ${propertySystemId} for container ${containerSystemId} in project ${projectId}`,
    );
    throw new NotImplementedException(
      'getContainerProperty is not implemented yet',
    );
  }

  /**
   * Update a container property.
   * Returns 400 if propSystemId maps to the capabilities property.
   */
  @Patch('/:containerSystemId/properties/:propSystemId')
  @ApiParam({
    name: 'containerSystemId',
    required: true,
    type: String,
    description: 'System id of a container',
  })
  @ApiParam({
    name: 'propSystemId',
    required: true,
    type: String,
    description: 'System id of the property to update',
  })
  @UseGuards(SessionGuard)
  @ApiDocumentationWithExample({
    summary: 'Update a container property',
    requestDto: UpdatePropertyRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Property updated',
        dto: PropertyResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Container or property not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update property',
      },
    ],
  })
  async updateContainerProperty(
    @Param('projectId') projectId: string,
    @Param('containerSystemId', ParseIntPipe) containerSystemId: number,
    @Param('propSystemId', ParseIntPipe) propSystemId: number,
    @Body() dto: UpdatePropertyRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<ContainerPropertiesResponseDto>> {
    await this.commandBus.execute<void>(
      new UpdateContainerPropertyCommand(containerSystemId, propSystemId, [
        dto,
      ]),
      session,
    );
    const query = new GetContainerPropertiesQuery(
      Number.parseInt(projectId, 10),
      containerSystemId,
      'api-client',
    );
    const result =
      await this.queryBus.execute<Result<ContainerPropertiesResponseDto>>(
        query,
      );
    return toApiResult(result);
  }
}
