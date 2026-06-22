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
  UseGuards,
  HttpStatus,
  HttpException,
  HttpCode,
} from '@nestjs/common';
import {ApiTags, ApiParam} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {ContainerDto, ContainerPropertiesDto} from './dto/container.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {
  QueryBus,
  QueryContainersQuery,
  type ContainerReadModel,
} from '@arc/core';

/**
 * Controller for container query APIs.
 */
@ApiTags('containers')
@Controller('arc-api/v1/projects/:projectId/containers')
@UseGuards(AuthGuard('jwt'))
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

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiDocumentationWithExample({
    summary: 'Query containers for provided systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of container system IDs',
    responses: [
      {status: HttpStatus.OK, description: 'Success', dto: [ContainerDto]},
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid or empty systemIds',
      },
      {status: HttpStatus.NOT_FOUND, description: 'Project not found'},
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to retrieve containers',
      },
    ],
  })
  async queryContainers(
    @Param('projectId') projectId: string,
    @Body() body: SystemIdsRequestDto,
  ): Promise<ApiResult<ContainerDto[]>> {
    try {
      if (!body?.systemIds?.length) {
        throw new HttpException(
          'systemIds array is required and cannot be empty',
          HttpStatus.BAD_REQUEST,
        );
      }

      const systemIds = body.systemIds.map(id => {
        const parsed = Number.parseInt(id, 10);
        if (Number.isNaN(parsed)) {
          throw new HttpException(
            `Invalid container system ID: ${id}`,
            HttpStatus.BAD_REQUEST,
          );
        }
        return parsed;
      });

      const query = new QueryContainersQuery(
        systemIds,
        Number(projectId),
        'client-id',
      );

      const containers =
        await this.queryBus.execute<ContainerReadModel[]>(query);

      return {
        data: containers.map(c => this.mapToContainerDto(c)),
        success: true,
        message: 'Containers retrieved successfully',
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Failed to retrieve containers',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  @Get('/:containerSystemId/properties')
  @ApiParam({
    name: 'containerSystemId',
    required: true,
    type: String,
    description: 'System ID of the container',
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
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid containerSystemId',
      },
      {status: HttpStatus.NOT_FOUND, description: 'Container not found'},
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to retrieve properties',
      },
    ],
  })
  async getContainerProperties(
    @Param('projectId') _projectId: string,
    @Param('containerSystemId') _containerSystemId: string,
  ): Promise<ApiResult<ContainerPropertiesDto>> {
    await Promise.resolve();
    throw new HttpException(
      'Container properties retrieval is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  // ── Private mappers ────────────────────────────────────────────────────────

  private mapToContainerDto(c: ContainerReadModel): ContainerDto {
    return new ContainerDto(String(c.systemId), c.containerId, c.type);
  }
}
