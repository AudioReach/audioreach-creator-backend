/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  NotImplementedException,
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
} from '@nestjs/common';
import {ApiTags, ApiParam, ApiQuery} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {CreateControlLinkRequest} from './dto/control-link-request.dto.js';
import {
  ControlLinkResponseDto,
  ControlLinkPropertiesResponseDto,
} from './dto/control-link-response.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {ClientId} from '../../../../decorators/client-id.decorator.js';
import {parseSubgraphPeerLinkFilter} from '../../common/utils/subgraph-peer-link-filter.js';
import {ComponentsResponseDto} from '../../common/dto/component-collection-response.dto.js';
import {ComponentsWithSubsystemsResponseDto} from '../../common/dto/component-collection-with-subsystems.dto.js';
import {ControlLinkWithUsecasesResponseDto} from '../usecase/dto/control-link-with-usecases.dto.js';
import {
  CommandBus,
  QueryBus,
  CreateControlLinkCommand,
  DeleteControlLinkCommand,
  Result,
  GetSubgraphPeerControlLinksQuery,
  type ControlLinkWithUsecasesDto,
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
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {
    super();
  }

  @Get()
  @ApiQuery({
    name: 'subgraphSystemId',
    required: false,
    type: String,
    description:
      'Subgraph system ID. Returns links connecting this subgraph to a different peer subgraph.',
  })
  @ApiQuery({
    name: 'moduleSystemId',
    required: false,
    type: String,
    description:
      'Module system ID. Must be supplied together with portSystemId.',
  })
  @ApiQuery({
    name: 'portSystemId',
    required: false,
    type: String,
    description:
      'Port system ID. Must be supplied together with moduleSystemId.',
  })
  @ApiDocumentationWithExample({
    summary:
      'GET /arc-api/v1/projects/{projectId}/control-links - Get control links by subgraph or module-port filters',
    description:
      'Returns control links between peer subgraphs. With `subgraphSystemId`, returns links going into or out of the requested subgraph to a different peer subgraph; links within the same subgraph are excluded. `moduleSystemId` and `portSystemId` must be supplied together and may be combined with the subgraph filter. Each link includes its associated usecases.',
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
    @Query('subgraphSystemId') subgraphSystemId?: string,
    @Query('moduleSystemId') moduleSystemId?: string,
    @Query('portSystemId') portSystemId?: string,
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

    const filter = parseSubgraphPeerLinkFilter({
      subgraphSystemId,
      moduleSystemId,
      portSystemId,
    });
    const result = await this.queryBus.execute<
      Result<ControlLinkWithUsecasesDto[]>
    >(new GetSubgraphPeerControlLinksQuery(parsedProjectId, clientId, filter));
    return toApiResult(result);
  }

  /**
   * Create a new control link (flat view).
   * Stores all segments in DB; returns ComponentsResponseDto.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create a new control link (flat view)',
    description:
      'Creates a control link between two modules. Stores all segments in DB. ' +
      'Returns flat ComponentsResponseDto with the created link.',
    requestDto: CreateControlLinkRequest,
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Control link created successfully',
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
        description: 'Failed to create control link',
      },
    ],
  })
  async createControlLink(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateControlLinkRequest,
  ): Promise<ApiResult<ComponentsResponseDto>> {
    console.log(
      'Creating control link for project:',
      projectId,
      'with data:',
      createDto,
    );

    const command = new CreateControlLinkCommand(
      createDto.linkType,
      Number(createDto.startComponentSystemId),
      Number(createDto.startPortSystemId),
      Number(createDto.endComponentSystemId),
      Number(createDto.endPortSystemId),
      0,
    );

    const components =
      await this.commandBus.execute<ComponentsResponseDto>(command);
    return toApiResult(Result.ok(components));
  }

  /**
   * Create a new control link (full hierarchical view with subsystems).
   * Performs the SAME DB write as POST /control-links.
   */
  @Post('with-subsystems')
  @ApiDocumentationWithExample({
    summary: 'Create a new control link (full view with subsystem hierarchy)',
    description:
      'Creates a control link — SAME DB write as POST /control-links. ' +
      'Returns ComponentsWithSubsystemsResponseDto with the created link and subsystem structure.',
    requestDto: CreateControlLinkRequest,
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Control link created successfully',
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
        description: 'Failed to create control link',
      },
    ],
  })
  async createControlLinkWithSubsystems(
    @Param('projectId') projectId: string,
    @Body() createDto: CreateControlLinkRequest,
  ): Promise<ApiResult<ComponentsWithSubsystemsResponseDto>> {
    console.log(
      'Creating control link (with-subsystems) for project:',
      projectId,
    );

    const command = new CreateControlLinkCommand(
      createDto.linkType,
      Number(createDto.startComponentSystemId),
      Number(createDto.startPortSystemId),
      Number(createDto.endComponentSystemId),
      Number(createDto.endPortSystemId),
      0,
    );

    const components =
      await this.commandBus.execute<ComponentsResponseDto>(command);
    return toApiResult(Result.ok({...components, subsystems: []}));
  }

  /**
   * Update a control link's properties.
   */
  @Patch('/:controlLinkSystemId/properties')
  @ApiDocumentationWithExample({
    summary: 'Update control link properties',
    requestDto: ControlLinkPropertiesResponseDto,
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
    @Param('controlLinkSystemId') controlLinkSystemId: string,
    @Body() properties: ControlLinkPropertiesResponseDto,
  ): Promise<ApiResult<ControlLinkResponseDto[]>> {
    console.log(
      'Updating control link with properties:',
      controlLinkSystemId,
      properties,
    );
    await Promise.resolve();
    throw new NotImplementedException(
      'updateControlLinkProperties is not implemented yet',
    );
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
    @Param('projectId') projectId: string,
    @Param('controlLinkSystemId') controlLinkSystemId: string,
  ): Promise<ApiResult<ControlLinkPropertiesResponseDto>> {
    await Promise.resolve();
    console.log(
      'Getting properties in project:',
      projectId,
      'for control link:',
      controlLinkSystemId,
    );
    throw new NotImplementedException(
      'getControlLinkProperties is not implemented yet',
    );
  }

  /**
   * Delete a control link.
   * Returns the deleted link snapshot so the caller can undo the operation.
   */
  @Delete(':controlLinkSystemId')
  @ApiParam({
    name: 'controlLinkSystemId',
    required: true,
    type: String,
    description: 'System id of the control link to delete',
  })
  @ApiDocumentationWithExample({
    summary: 'Delete a control link',
    description:
      'Deletes a control link by systemId. Returns the deleted link snapshot for undo support.',
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
    @Param('projectId') projectId: string,
    @Param('controlLinkSystemId') controlLinkSystemId: string,
  ): Promise<ApiResult<ControlLinkResponseDto>> {
    console.log(
      'Deleting control link:',
      controlLinkSystemId,
      'in project:',
      projectId,
    );

    const command = new DeleteControlLinkCommand(
      Number.parseInt(controlLinkSystemId, 10),
    );

    const deleted =
      await this.commandBus.execute<ControlLinkResponseDto>(command);
    return toApiResult(Result.ok(deleted));
  }
}
