/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  NotImplementedException,
  Post,
  Get,
  BadRequestException,
  Body,
  Param,
  HttpStatus,
  UseInterceptors,
} from '@nestjs/common';
import {ApiTags, ApiParam, ApiExtraModels} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {
  SubgraphResponseDto,
  SubgraphPropertiesResponseDto,
} from './dto/subgraph.dto.js';
import {SubgraphPairResponseDto} from './dto/subgraph-pair.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ComponentCollectionResponseDto} from '../../common/dto/component-collection.dto.js';
import {ConfigElementResponseDto} from '../../common/dto/element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayResponseDto} from '../../common/dto/element-data/elements/element-template-array.dto.js';
import {StructResponseDto} from '../../common/dto/element-data/elements/struct.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {UsecaseResponseDto} from '../usecase/dto/usecase.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {
  QueryBus,
  GetComponentsQuery,
  GetSubgraphPropertiesQuery,
  type Result,
  type ComponentCollectionDto as CoreComponentCollectionDto,
  COMPONENT_SCOPE_TYPE,
} from '@arc/core';
/**
 * Controller to support all subgraph related APIs for usecase design.
 * Provides subgraph related APIs for usecase design.
 */
@ApiTags('subgraphs')
@Controller('arc-api/v1/projects/:projectId/subgraphs')
//@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(
  ConfigElementResponseDto,
  ElementTemplateArrayResponseDto,
  StructResponseDto,
)
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class SubgraphController extends BaseController {
  constructor(private readonly queryBus: QueryBus) {
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
        dto: [SubgraphResponseDto],
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
  ): Promise<ApiResult<SubgraphResponseDto[]>> {
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
        dto: [SubgraphResponseDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some subgraphs could not be retrieved (see errors array)',
        dto: [SubgraphResponseDto],
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
  ): Promise<ApiResult<SubgraphResponseDto[]>> {
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
        dto: SubgraphPropertiesResponseDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — one or more property payloads missing (see issues array)',
        dto: SubgraphPropertiesResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
    ],
  })
  async getSubgraphProperties(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<SubgraphPropertiesResponseDto>> {
    const query = new GetSubgraphPropertiesQuery(
      Number.parseInt(projectId, 10),
      Number.parseInt(subgraphSystemId, 10),
      'client-id',
    );
    const result =
      await this.queryBus.execute<Result<SubgraphPropertiesResponseDto>>(query);
    return toApiResult(result);
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
        dto: [UsecaseResponseDto],
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
  ): Promise<ApiResult<UsecaseResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting all usecases for project: ${projectId} and subgraph: ${subgraphSystemId}`,
    );
    throw new NotImplementedException(
      'getUsecasesForSubgraph is not implemented yet',
    );
  }

  /**
   * Get all components (modules, data links, control links) for a subgraph.
   */
  @Get('/:subgraphSystemId/components')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: 'string',
    description: 'The system ID of the subgraph',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all components for a subgraph',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Components returned successfully',
        dto: ComponentCollectionResponseDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some components could not be retrieved (see errors array)',
        dto: ComponentCollectionResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get components',
      },
    ],
  })
  async getComponentsForSubgraph(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<ComponentCollectionResponseDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    const parsedSubgraphId = Number.parseInt(subgraphSystemId, 10);

    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }
    if (Number.isNaN(parsedSubgraphId)) {
      throw new BadRequestException(
        `Invalid subgraph system ID: ${subgraphSystemId}`,
      );
    }

    const query = new GetComponentsQuery(
      {type: COMPONENT_SCOPE_TYPE.Subgraph, systemId: parsedSubgraphId},
      parsedProjectId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<Result<CoreComponentCollectionDto>>(query);

    return toApiResult(result);
  }

  /**
   * Get all subgraph pairs where the given subgraph is source or destination.
   */
  @Get('/:subgraphSystemId/subgraph-pairs')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: 'string',
    description: 'The system ID of the subgraph',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all subgraph pairs for a subgraph (as source or destination)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Subgraph pairs returned successfully',
        dto: [SubgraphPairResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subgraph pairs',
      },
    ],
  })
  async getSubgraphPairs(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<SubgraphPairResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting subgraph pairs for project: ${projectId} and subgraph: ${subgraphSystemId}`,
    );
    throw new NotImplementedException(
      'getSubgraphPairs is not implemented yet',
    );
  }
}
