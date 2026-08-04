/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseInterceptors,
  HttpStatus,
} from '@nestjs/common';
import {ApiTags, ApiParam, ApiExtraModels} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {ContainerDto, ContainerPropertiesDto} from './dto/container.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ConfigElementDto} from '../../common/dto/element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from '../../common/dto/element-data/elements/element-template-array.dto.js';
import {StructDto} from '../../common/dto/element-data/elements/struct.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {
  QueryBus,
  ContainerQuery,
  GetContainerPropertiesQuery,
  type Result,
  type ContainerReadModel,
  type PropertyReadModel,
} from '@arc/core';
import {mapPropertyToDto} from '../../common/utils/element-data-mapper.js';

/**
 * Controller to support all container related APIs for usecase design.
 * Provides container related APIs for usecase design.
 */
@ApiTags('containers')
@Controller('arc-api/v1/projects/:projectId/containers')
//@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(ConfigElementDto, ElementTemplateArrayDto, StructDto)
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class ContainerController extends BaseController {
  constructor(private readonly queryBus: QueryBus) {
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
        dto: [ContainerDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some containers could not be retrieved (see errors array)',
        dto: [ContainerDto],
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
  ): Promise<ApiResult<ContainerDto[]>> {
    const query = new ContainerQuery(
      Number.parseInt(projectId, 10), // radix 10 guards against octal misparse
      'client-id', // TODO: extract real clientId from JWT once auth wiring is done
    );

    const result =
      await this.queryBus.execute<Result<ContainerReadModel[]>>(query);

    return toApiResult(result, data =>
      data.map(c => this.mapToContainerDto(c)),
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
        dto: ContainerPropertiesDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or container not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get container properties',
      },
    ],
  })
  async getContainerProperties(
    @Param('projectId') projectId: string,
    @Param('containerSystemId') containerSystemId: string,
  ): Promise<ApiResult<ContainerPropertiesDto>> {
    const query = new GetContainerPropertiesQuery(
      Number.parseInt(projectId, 10),
      Number.parseInt(containerSystemId, 10),
      'client-id',
    );
    const properties = await this.queryBus.execute<PropertyReadModel[]>(query);
    return {
      data: new ContainerPropertiesDto(
        properties.map(p => mapPropertyToDto(p)),
      ),
    };
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Maps ContainerReadModel → ContainerDto.
   * changeInfo is left undefined — this endpoint doesn't surface change state.
   */
  private mapToContainerDto(c: ContainerReadModel): ContainerDto {
    const dto = new ContainerDto(String(c.systemId), c.containerId);
    dto.name = c.containerTypeName ?? String(c.containerTypeSystemId ?? '');
    return dto;
  }
}
