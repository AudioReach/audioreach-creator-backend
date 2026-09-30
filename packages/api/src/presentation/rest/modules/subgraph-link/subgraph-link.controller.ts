/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {ApiParam, ApiQuery, ApiTags} from '@nestjs/swagger';
import {
  GetSubgraphLinksQuery,
  QueryBus,
  Result,
  type SubgraphLinksDto,
} from '@arc/core';
import {ClientId} from '../../../../decorators/client-id.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {parseSubgraphLinkFilter} from '../../common/utils/subgraph-peer-link-filter.js';
import {BaseController} from '../base/base.controller.js';
import {SubgraphLinksResponseDto} from './dto/subgraph-links-response.dto.js';

@ApiTags('subgraph-links')
@Controller('arc-api/v1/projects/:projectId/subgraph-links')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class SubgraphLinkController extends BaseController {
  constructor(private readonly queryBus: QueryBus) {
    super();
  }

  @Get()
  @ApiQuery({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'Subgraph system ID for the selected subgraph.',
  })
  @ApiQuery({
    name: 'subgraphPeerSystemId',
    required: false,
    type: String,
    description: 'Optional peer subgraph system ID used to narrow results.',
  })
  @ApiDocumentationWithExample({
    summary:
      'GET /arc-api/v1/projects/{projectId}/subgraph-links - Get data and control links by subgraph',
    description:
      'Returns incoming and outgoing cross-subgraph data links and control links for the requested subgraph. subgraphPeerSystemId optionally narrows results to one peer subgraph. Link items use the existing link-with-usecases DTOs.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Subgraph links retrieved successfully',
        dto: SubgraphLinksResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid filter combination or identifier',
      },
      {status: HttpStatus.NOT_FOUND, description: 'Project not found'},
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to retrieve subgraph links',
      },
    ],
  })
  async getSubgraphLinks(
    @Param('projectId') projectId: string,
    @ClientId() clientId: string,
    @Query()
    query: {
      subgraphSystemId?: string;
      subgraphPeerSystemId?: string;
    },
  ): Promise<ApiResult<SubgraphLinksResponseDto>> {
    const projectIdValue = projectId.trim();
    const parsedProjectId = Number(projectIdValue);
    if (
      projectIdValue.length === 0 ||
      !/^\d+$/.test(projectIdValue) ||
      !Number.isSafeInteger(parsedProjectId)
    ) {
      throw new BadRequestException(
        `${projectId} must be a valid numeric project ID`,
      );
    }

    const filter = parseSubgraphLinkFilter(query);
    const result = await this.queryBus.execute<Result<SubgraphLinksDto>>(
      new GetSubgraphLinksQuery(parsedProjectId, clientId, filter),
    );
    return toApiResult(result);
  }
}
