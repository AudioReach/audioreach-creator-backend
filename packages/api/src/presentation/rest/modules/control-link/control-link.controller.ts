/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  HttpStatus,
  ParseIntPipe,
  HttpCode,
} from '@nestjs/common';
import {ApiTags, ApiParam} from '@nestjs/swagger';
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
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {ComponentsResponseDto} from '../../common/dto/component-collection-response.dto.js';
import {ComponentsWithSubsystemsResponseDto} from '../../common/dto/component-collection-with-subsystems.dto.js';
import {
  CommandBus,
  QueryBus,
  CreateControlLinkCommand,
  DeleteControlLinkCommand,
  PatchControlLinkPropertiesCommand,
  GetControlLinkPropertiesQuery,
  QueryControlLinksQuery,
  Result,
  type ActiveSession,
  type ControlLinkDto,
  type ControlLinkPropertiesDto,
} from '@arc/core';
import {SessionGuard} from '../../../../guards/session-guard.js';
import {ArcSession} from '../../../../guards/arc-session.decorator.js';

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

  /**
   * Query control-links by system IDs (partial-success model).
   */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiDocumentationWithExample({
    summary: 'Query control-links for provided systemIds',
    requestDto: QueryControlLinksRequest,
    requestDtoDescription: 'List of control-link system ids',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'All control-links found successfully',
        dto: [ControlLinkResponseDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some control-links could not be retrieved (see errors array)',
        dto: [ControlLinkResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get control-link(s)',
      },
    ],
  })
  async queryControlLinks(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() body: QueryControlLinksRequest,
  ): Promise<ApiResult<ControlLinkResponseDto[]>> {
    const systemIds = body.systemIds.map(id => Number(id));

    const query = new QueryControlLinksQuery(systemIds, projectId, 'api-client');
    const result = await this.queryBus.execute<Result<ControlLinkDto[]>>(query);
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
        description: 'Business rule violation (self-loop, empty intent intersection, etc.)',
      },
    ],
  })
  async createControlLink(
    @Param('projectId') _projectId: string,
    @Body() createDto: CreateControlLinkFlatRequest,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<ComponentsResponseDto>> {
    const command = new CreateControlLinkCommand(
      Number(createDto.startModuleSystemId),
      Number(createDto.startPortId),
      Number(createDto.endModuleSystemId),
      Number(createDto.endPortId),
      createDto.heapId ?? 1,
      createDto.isInterUsecase ?? false,
      createDto.parentId != null ? Number(createDto.parentId) : null,
      false, // flat view — modules only
    );

    const components = await this.commandBus.execute<ComponentsResponseDto>(command, session);
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
    const command = new CreateControlLinkCommand(
      Number(createDto.startComponentId),
      Number(createDto.startPortId),
      Number(createDto.endComponentId),
      Number(createDto.endPortId),
      1, // default heapId
      createDto.isInterUsecase ?? false,
      createDto.parentId != null ? Number(createDto.parentId) : null,
      true, // with-subsystems — subsystem nodes allowed
    );

    const components = await this.commandBus.execute<ComponentsWithSubsystemsResponseDto>(command, session);
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
      body.AllocatedIntents?.intents,
      body.HeapId?.value,
    );

    const modified = await this.commandBus.execute<ControlLinkDto[]>(command, session);
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

  /**
   * Delete a control link (soft delete).
   * Returns the systemId of the deleted link.
   */
  @Delete(':controlLinkSystemId')
  @UseGuards(SessionGuard)
  @ApiParam({
    name: 'controlLinkSystemId',
    required: true,
    type: String,
    description: 'System id of the control link to delete',
  })
  @ApiDocumentationWithExample({
    summary: 'Delete a control link',
    description:
      'Soft-deletes a control link by systemId. Returns the systemId of the deleted link.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Control link deleted successfully',
        dto: ControlLinkResponseDto,
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
    @Param('projectId') _projectId: string,
    @Param('controlLinkSystemId', ParseIntPipe) controlLinkSystemId: number,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<ControlLinkResponseDto>> {
    const command = new DeleteControlLinkCommand(controlLinkSystemId);
    const result = await this.commandBus.execute<ControlLinkDto>(command, session);
    return toApiResult(Result.ok(result));
  }
}
