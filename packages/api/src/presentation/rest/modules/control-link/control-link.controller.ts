/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  BadRequestException,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import {ApiTags, ApiParam, ApiQuery} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {
  CreateControlLinkFlatRequest,
  CreateControlLinkWithSubsystemsRequest,
  PatchControlLinkPropertiesRequest,
  QueryControlLinksRequest,
} from './dto/control-link-request.dto.js';
import {
  ControlLinkResponseDto,
  ControlLinkPropertiesResponseDto,
} from './dto/control-link-response.dto.js';
import {DeleteControlLinkResponseDto} from './dto/delete-control-link-response.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {ClientId} from '../../../../decorators/client-id.decorator.js';
import {ArcSession} from '../../../../guards/arc-session.decorator.js';
import {parseModulePortLinkFilter} from '../../common/utils/subgraph-peer-link-filter.js';
import {ComponentsResponseDto} from '../../common/dto/component-collection-response.dto.js';
import {ComponentsWithSubsystemsResponseDto} from '../../common/dto/component-collection-with-subsystems.dto.js';
import {ControlLinkWithUsecasesResponseDto} from '../usecase/dto/control-link-with-usecases.dto.js';
import {SessionGuard} from '../../../../guards/session-guard.js';
import {
  CommandBus,
  QueryBus,
  CreateControlLinkCommand,
  CreateControlLinkWithSubsystemsCommand,
  DeleteControlLinkCommand,
  PatchControlLinkPropertiesCommand,
  GetControlLinkPropertiesQuery,
  GetControlLinksQuery,
  CONTROL_LINK_TYPE,
  DEFAULT_CONTAINER_HEAP_ID,
  Result,
  GetControlLinksByModulePortQuery,
  type ControlLinkWithUsecasesDto,
  type ActiveSession,
  type ControlLinkDto,
  type ControlLinkPropertiesDto,
} from '@arc/core';

/**
 * Controller to support all control link related APIs for usecase design.
 * Provides control link related APIs for usecase design.
 */
@ApiTags('control-links')
@Controller('arc-api/v1/projects/:projectId/control-links')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class ControlLinkController extends BaseController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
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
      'GET /arc-api/v1/projects/{projectId}/control-links - Get control links by module and port',
    description:
      'Returns all control links connected to the requested module and port, including matches on either stored peer endpoint. Each link includes its associated usecases. subgraphSystemId is not supported on this endpoint; use /subgraph-links for subgraph lookup.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Control links retrieved successfully',
        dto: [ControlLinkWithUsecasesResponseDto],
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
  async getControlLinks(
    @Param('projectId') projectId: string,
    @ClientId() clientId: string,
    @Query()
    query: {
      subgraphSystemId?: string;
      moduleSystemId?: string;
      portSystemId?: string;
    },
  ): Promise<ApiResult<ControlLinkWithUsecasesResponseDto[]>> {
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
      Result<ControlLinkWithUsecasesDto[]>
    >(new GetControlLinksByModulePortQuery(parsedProjectId, clientId, filter));
    return toApiResult(result);
  }

  /**
   * Create a new control link (flat view — module nodes only).
   */
  @Post()
  @UseGuards(SessionGuard)
  @ApiDocumentationWithExample({
    summary: 'Create a new control link (flat view)',
    description:
      'Creates a control link between two module nodes. ' +
      'Returns flat ComponentsResponseDto with the created link.',
    requestDto: CreateControlLinkFlatRequest,
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Control link created successfully',
        dto: ComponentsResponseDto,
      },
      {status: HttpStatus.BAD_REQUEST, description: 'Invalid request data'},
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Module or port not found',
      },
      {
        status: HttpStatus.CONFLICT,
        description: 'A control link already exists with the same port pair',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description:
          'Business rule violation (self-loop, empty intent intersection, etc.)',
      },
    ],
  })
  async createControlLink(
    @Param('projectId') _projectId: string,
    @Body() createDto: CreateControlLinkFlatRequest,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<ComponentsResponseDto>> {
    const command = new CreateControlLinkCommand(
      createDto.isInterUsecase
        ? CONTROL_LINK_TYPE.InterUsecase
        : CONTROL_LINK_TYPE.Normal,
      Number(createDto.startModuleSystemId),
      Number(createDto.startPortSystemId),
      Number(createDto.endModuleSystemId),
      Number(createDto.endPortSystemId),
      createDto.heapId ?? DEFAULT_CONTAINER_HEAP_ID,
    );

    const components = await this.commandBus.execute<ComponentsResponseDto>(
      command,
      session,
    );
    return toApiResult(Result.ok(components));
  }

  /**
   * Create a new control link (hierarchical view — modules and subsystem nodes accepted).
   */
  @Post('with-subsystems')
  @UseGuards(SessionGuard)
  @ApiDocumentationWithExample({
    summary: 'Create a new control link (full view with subsystem hierarchy)',
    description:
      'Creates a control link — accepts module and subsystem node IDs. ' +
      'Returns ComponentsWithSubsystemsResponseDto with the created link and subsystem structure.',
    requestDto: CreateControlLinkWithSubsystemsRequest,
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Control link created successfully',
        dto: ComponentsWithSubsystemsResponseDto,
      },
      {status: HttpStatus.BAD_REQUEST, description: 'Invalid request data'},
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Node or port not found',
      },
      {
        status: HttpStatus.CONFLICT,
        description: 'A control link already exists with the same port pair',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Business rule violation',
      },
    ],
  })
  async createControlLinkWithSubsystems(
    @Param('projectId') _projectId: string,
    @Body() createDto: CreateControlLinkWithSubsystemsRequest,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<ComponentsWithSubsystemsResponseDto>> {
    const command = new CreateControlLinkWithSubsystemsCommand(
      createDto.isInterUsecase
        ? CONTROL_LINK_TYPE.InterUsecase
        : CONTROL_LINK_TYPE.Normal,
      Number(createDto.startComponentSystemId),
      Number(createDto.startPortSystemId),
      Number(createDto.endComponentSystemId),
      Number(createDto.endPortSystemId),
      DEFAULT_CONTAINER_HEAP_ID,
    );

    const components =
      await this.commandBus.execute<ComponentsWithSubsystemsResponseDto>(
        command,
        session,
      );
    return toApiResult(Result.ok(components));
  }

  /**
   * Update a control link's properties (intents and/or heapId).
   */
  @Patch('/:controlLinkSystemId/properties')
  @UseGuards(SessionGuard)
  @ApiDocumentationWithExample({
    summary: 'Update control link properties',
    requestDto: PatchControlLinkPropertiesRequest,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [ControlLinkResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or control link not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update control-link property',
      },
    ],
  })
  async updateControlLinkProperties(
    @Param('controlLinkSystemId', ParseIntPipe) controlLinkSystemId: number,
    @Body() body: PatchControlLinkPropertiesRequest,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<ControlLinkResponseDto[]>> {
    const command = new PatchControlLinkPropertiesCommand(
      controlLinkSystemId,
      body.AllocatedIntents?.intents.map(i => ({
        id: i.naturalId,
        name: i.name,
      })),
      body.HeapId?.value,
    );

    const modified = await this.commandBus.execute<ControlLinkDto[]>(
      command,
      session,
    );
    return toApiResult(Result.ok(modified));
  }

  /**
   * Get all property data for a control link.
   */
  @Get('/:controlLinkSystemId/properties')
  @ApiParam({
    name: 'controlLinkSystemId',
    required: true,
    type: String,
    description: 'System id of a control link',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all property data for a control link',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: ControlLinkPropertiesResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or control link not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get control link properties',
      },
    ],
  })
  async getControlLinkProperties(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('controlLinkSystemId', ParseIntPipe) controlLinkSystemId: number,
  ): Promise<ApiResult<ControlLinkPropertiesResponseDto>> {
    const query = new GetControlLinkPropertiesQuery(
      controlLinkSystemId,
      projectId,
      'api-client',
    );
    const props = await this.queryBus.execute<ControlLinkPropertiesDto>(query);
    return toApiResult(Result.ok(props));
  }

  @Post('query')
  async queryControlLinks(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: QueryControlLinksRequest,
  ): Promise<ApiResult<ControlLinkResponseDto[]>> {
    const query = new GetControlLinksQuery(
      body.systemIds.map(Number),
      projectId,
      'api-client',
    );
    const result = await this.queryBus.execute<Result<ControlLinkDto[]>>(query);
    return toApiResult(result);
  }

  /**
   * Delete any control-link ID. The ID may identify a canonical module-to-module
   * ControlLink or a SubsystemControlLink segment; the service resolves it automatically.
   * Returns deleted entities and affected subsystems with cleared port intents.
   */
  @Delete(':controlLinkSystemId')
  @UseGuards(SessionGuard)
  @ApiParam({
    name: 'controlLinkSystemId',
    required: true,
    type: String,
    description:
      'Any control-link system ID: either a canonical module-to-module ControlLink or a SubsystemControlLink segment. The service detects the ID type automatically.',
  })
  @ApiDocumentationWithExample({
    summary: 'Delete a control link',
    description:
      'Accepts any control-link system ID: a canonical module-to-module ControlLink or a SubsystemControlLink segment. Returns deleted entities and affected subsystems with cleared port intents.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Control link deleted successfully',
        dto: DeleteControlLinkResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or control link not found',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Failed to delete control link',
      },
    ],
  })
  async deleteControlLink(
    @Param('projectId') projectId: string,
    @Param('controlLinkSystemId') controlLinkSystemId: string,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<DeleteControlLinkResponseDto>> {
    console.log(
      'Deleting control link:',
      controlLinkSystemId,
      'in project:',
      projectId,
    );

    const command = new DeleteControlLinkCommand(
      Number.parseInt(controlLinkSystemId, 10),
    );

    const deleted = await this.commandBus.execute<DeleteControlLinkResponseDto>(
      command,
      session,
    );
    return toApiResult(Result.ok(deleted));
  }
}
