/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  NotImplementedException,
  Post,
  Get,
  Body,
  Param,
  HttpStatus,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {ApiTags, ApiParam, ApiExtraModels} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {SubgraphDto, SubgraphPropertiesDto} from './dto/subgraph.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ConfigElementDto} from '../../common/dto/element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from '../../common/dto/element-data/elements/element-template-array.dto.js';
import {StructDto} from '../../common/dto/element-data/elements/struct.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {UsecaseIdentifierDto} from '../usecase/dto/usecase.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';

/**
 * Controller to support all subgraph related APIs for usecase design.
 * Provides subgraph related APIs for usecase design.
 */
@ApiTags('subgraphs')
@Controller('arc-api/v1/projects/:projectId/subgraphs')
@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(ConfigElementDto, ElementTemplateArrayDto, StructDto)
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class SubgraphController extends BaseController {
  constructor() {
    super();
  }

  /**
   * Get all subgraphs in the project.
   */
  @Get()
  @ApiDocumentationWithExample({
    summary: 'Get all subgraphs in the project',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [SubgraphDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subgraphs',
      },
    ],
  })
  async getAllSubgraphs(
    @Param('projectId') projectId: string,
  ): Promise<ApiResult<SubgraphDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(`Getting all subgraphs in project ${projectId}`);
    throw new NotImplementedException('getAllSubgraphs is not implemented yet');
  }

  /**
   * Query subgraphs for subgraph system ids.
   */
  @Post('query')
  @ApiDocumentationWithExample({
    summary: 'Query subgraphs for subgraph systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of subgraph system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'All subgraphs found successfully',
        dto: [SubgraphDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some subgraphs could not be retrieved (see errors array)',
        dto: [SubgraphDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subgraphs',
      },
    ],
  })
  async querySubgraphs(
    @Param('projectId') projectId: string,
    @Body() subgraphSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<SubgraphDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting subgraphs in project ${projectId}: ${JSON.stringify(subgraphSystemIds)}`,
    );
    throw new NotImplementedException('querySubgraphs is not implemented yet');
  }

  /**
   * Get all property data for a subgraph (subgraph, container, subsystem, module).
   */
  @Get('/:subgraphSystemId/properties')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all property data for a subgraph',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: SubgraphPropertiesDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subgraph properties',
      },
    ],
  })
  async getSubgraphProperties(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<SubgraphPropertiesDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting properties in project ${projectId} for subgraph ${subgraphSystemId}`,
    );
    throw new NotImplementedException(
      'getSubgraphProperties is not implemented yet',
    );
  }

  /**
   * Get all usecases for a given subgraph system id.
   */
  @Get('/:subgraphSystemId/usecases')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: 'string',
    description: 'The system ID of the subgraph to get usecases for',
    example: 'subgraph-123',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all usecases for a given subgraph system id',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Usecases are returned successfully',
        dto: [UsecaseIdentifierDto],
        example: {
          className: 'UseCaseIdentifierCollectionExample',
        },
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
    ],
  })
  async getUsecasesForSubgraph(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<UsecaseIdentifierDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting all usecases for project: ${projectId} and subgraph: ${subgraphSystemId}`,
    );
    throw new NotImplementedException(
      'getUsecasesForSubgraph is not implemented yet',
    );
  }
}
