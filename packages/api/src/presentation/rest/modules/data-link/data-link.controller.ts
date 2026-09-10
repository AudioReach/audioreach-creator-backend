/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  BadRequestException,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpStatus,
} from '@nestjs/common';
import {ApiTags, ApiParam, ApiQuery} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {DeleteDataLinkResponseDto} from './dto/delete-data-link-response.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {ClientId} from '../../../../decorators/client-id.decorator.js';
import {parseModulePortLinkFilter} from '../../common/utils/subgraph-peer-link-filter.js';
import {CreateDataLinkRequest} from './dto/request/create-data-link-request.dto.js';
import {DataLinkWithUsecasesResponseDto} from '../usecase/dto/data-link-with-usecases.dto.js';
import {CreateDataLinkWithSubsystemsRequest} from './dto/request/create-data-link-with-subsystems-request.dto.js';
import {ComponentsResponseDto} from '../../common/dto/component-collection-response.dto.js';
import {ComponentsWithSubsystemsResponseDto} from '../../common/dto/component-collection-with-subsystems.dto.js';
import {
  CommandBus,
  QueryBus,
  CreateDataLinkCommand,
  CreateDataLinkWithSubsystemsCommand,
  DeleteDataLinkCommand,
  Result,
  GetDataLinksByModulePortQuery,
  type DataLinkWithUsecasesDto,
  type ComponentCollectionWithSubsystemsDto as ComponentCollectionWithSubsystemsDtoType,
} from '@arc/core';

/**
 * Controller to support all data link related APIs for usecase design.
 * Provides data link related APIs for usecase design.
 */
@ApiTags('data-links')
@Controller('arc-api/v1/projects/:projectId/data-links')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class DataLinkController extends BaseController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {
    super();
  }

  @Get()
  @ApiQuery({
    name: 'moduleSystemId',
    required: true,
    type: String,
    description: 'Module system ID for the selected endpoint.',
  })
  @ApiQuery({
    name: 'portSystemId',
    required: true,
    type: String,
    description: 'Port system ID for the selected endpoint.',
  })
  @ApiDocumentationWithExample({
    summary:
      'GET /arc-api/v1/projects/{projectId}/data-links - Get data links by module and port',
    description:
      'Returns all data links connected to the requested module and port, including source-side and destination-side matches. Each link includes its associated usecases. subgraphSystemId is not supported on this endpoint; use /subgraph-links for subgraph lookup.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Data links retrieved successfully',
        dto: [DataLinkWithUsecasesResponseDto],
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid filter combination or identifier',
      },
      {status: HttpStatus.NOT_FOUND, description: 'Project not found'},
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to retrieve link(s)',
      },
    ],
  })
  async getDataLinks(
    @Param('projectId') projectId: string,
    @ClientId() clientId: string,
    @Query()
    query: {
      subgraphSystemId?: string;
      moduleSystemId?: string;
      portSystemId?: string;
    },
  ): Promise<ApiResult<DataLinkWithUsecasesResponseDto[]>> {
    const projectIdValue = projectId.trim();
    const parsedProjectId = Number(projectIdValue);
    if (
      projectIdValue.length === 0 ||
      !/^\d+$/.test(projectIdValue) ||
      !Number.isSafeInteger(parsedProjectId)
    ) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const filter = parseModulePortLinkFilter(query);
    const result = await this.queryBus.execute<
      Result<DataLinkWithUsecasesDto[]>
    >(new GetDataLinksByModulePortQuery(parsedProjectId, clientId, filter));
    return toApiResult(result);
  }

  /**
   * Create a new data link (collapsed view, module endpoints only).
   * Stores all link segments in DB; returns ComponentsResponseDto.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create a new data link',
    description:
      'Creates a data link between two modules. Stores all segments (mod→SS, SS→SS, SS→mod) in the DB. ' +
      'Returns a flat ComponentsResponseDto with the created link.',
    requestDto: CreateDataLinkRequest,
    requestDtoDescription: 'Data link creation parameters',
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Data link created successfully',
        dto: ComponentsResponseDto,
      },
      {status: HttpStatus.BAD_REQUEST, description: 'Invalid request data'},
      {
        status: HttpStatus.NOT_FOUND,
        description:
          'Project not found, or source or destination module not found',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Failed to create data link',
      },
    ],
  })
  async createDataLink(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateDataLinkRequest,
  ): Promise<ApiResult<ComponentsResponseDto>> {
    console.log(
      'Creating data link for project:',
      projectId,
      'with data:',
      createDto,
    );

    const command = new CreateDataLinkCommand(
      createDto.linkType,
      createDto.sourceModuleSystemId,
      createDto.sourcePortSystemId,
      createDto.destinationModuleSystemId,
      createDto.destinationPortSystemId,
    );

    const components =
      await this.commandBus.execute<ComponentsResponseDto>(command);
    return toApiResult(Result.ok(components));
  }

  /**
   * Create a new data link (full hierarchical view with subsystems).
   * Performs the SAME DB write as POST /data-links.
   * Returns ComponentsWithSubsystemsResponseDto.
   */
  @Post('with-subsystems')
  @ApiDocumentationWithExample({
    summary: 'Create a new data link (full view with subsystem hierarchy)',
    description:
      'Creates a data link — SAME DB write as POST /data-links. ' +
      'Returns ComponentsWithSubsystemsResponseDto with the created link and subsystem structure.',
    requestDto: CreateDataLinkWithSubsystemsRequest,
    requestDtoDescription: 'Data link creation parameters',
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Data link created successfully',
        dto: ComponentsWithSubsystemsResponseDto,
      },
      {status: HttpStatus.BAD_REQUEST, description: 'Invalid request data'},
      {
        status: HttpStatus.NOT_FOUND,
        description:
          'Project not found, or source or destination module not found',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Failed to create data link',
      },
    ],
  })
  async createDataLinkWithSubsystems(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateDataLinkWithSubsystemsRequest,
  ): Promise<ApiResult<ComponentsWithSubsystemsResponseDto>> {
    console.log('Creating data link (with-subsystems) for project:', projectId);

    const command = new CreateDataLinkWithSubsystemsCommand(
      createDto.linkType,
      createDto.sourceNodeSystemId,
      createDto.sourcePortSystemId,
      createDto.destinationNodeSystemId,
      createDto.destinationPortSystemId,
    );

    const components =
      await this.commandBus.execute<ComponentCollectionWithSubsystemsDtoType>(
        command,
      );
    return toApiResult(Result.ok(components));
  }

  /**
   * Delete any data-link ID. The ID may identify a canonical module-to-module
   * DataLink or a SubsystemDataLink segment; the service resolves it automatically.
   * Returns all entities deleted by the requested link or segment deletion.
   */
  @Delete(':dataLinkSystemId')
  @ApiParam({
    name: 'dataLinkSystemId',
    required: true,
    type: String,
    description:
      'Any data-link system ID: either a canonical module-to-module DataLink or a SubsystemDataLink segment. The service detects the ID type automatically.',
  })
  @ApiDocumentationWithExample({
    summary: 'Delete a data link',
    description:
      'Accepts any data-link system ID: a canonical module-to-module DataLink or a SubsystemDataLink segment. The service resolves the ID type and returns only affected deleted entities.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Data link deleted successfully',
        dto: DeleteDataLinkResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or data link not found',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Failed to delete data link',
      },
    ],
  })
  async deleteDataLink(
    @Param('projectId') projectId: string,
    @Param('dataLinkSystemId') dataLinkSystemId: string,
  ): Promise<ApiResult<DeleteDataLinkResponseDto>> {
    console.log(
      'Deleting data link:',
      dataLinkSystemId,
      'in project:',
      projectId,
    );

    const command = new DeleteDataLinkCommand(
      Number.parseInt(dataLinkSystemId, 10),
    );
    const deleted =
      await this.commandBus.execute<DeleteDataLinkResponseDto>(command);
    return toApiResult(Result.ok(deleted));
  }
}
