/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  NotImplementedException,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  HttpStatus,
} from '@nestjs/common';
import {ApiTags, ApiParam} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {DataLinkResponseDto} from './dto/data-link.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {CreateDataLinkRequest} from './dto/request/create-data-link-request.dto.js';
import {ComponentCollectionResponseDto} from '../../common/dto/component-collection.dto.js';
import {ComponentCollectionWithSubsystemsDto} from '../../common/dto/component-collection-with-subsystems.dto.js';
import {
  CommandBus,
  CreateDataLinkCommand,
  DeleteDataLinkCommand,
  Result,
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
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  /**
   * Query data-links.
   */
  @Post('query')
  @ApiDocumentationWithExample({
    summary: 'Query data-links for provided systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of data-link system ids',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'All data-links found successfully',
        dto: [DataLinkResponseDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some data-links could not be retrieved (see errors array)',
        dto: [DataLinkResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get data-link(s)',
      },
    ],
  })
  async queryDataLinks(
    @Param('projectId') projectId: string,
    @Body() dataLinkSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<DataLinkResponseDto[]>> {
    await Promise.resolve();
    console.log(
      'Getting data-links in project:',
      projectId,
      JSON.stringify(dataLinkSystemIds),
    );
    throw new NotImplementedException('queryDataLinks is not implemented yet');
  }

  /**
   * Create a new data link (flat / collapsed view).
   * Stores all link segments in DB; returns ComponentCollectionResponseDto.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create a new data link (flat view)',
    description:
      'Creates a data link between two modules. Stores all segments (mod→SS, SS→SS, SS→mod) in the DB. ' +
      'Returns a flat ComponentCollectionResponseDto with the created link.',
    requestDto: CreateDataLinkRequest,
    requestDtoDescription: 'Data link creation parameters',
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Data link created successfully',
        dto: ComponentCollectionResponseDto,
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
  ): Promise<ApiResult<ComponentCollectionResponseDto>> {
    console.log(
      'Creating data link for project:',
      projectId,
      'with data:',
      createDto,
    );

    const command = new CreateDataLinkCommand(
      createDto.sourceNodeSystemId,
      createDto.sourcePortSystemId,
      createDto.destinationNodeSystemId,
      createDto.destinationPortSystemId,
      createDto.type ?? 'normal',
    );

    const components =
      await this.commandBus.execute<ComponentCollectionResponseDto>(command);
    return toApiResult(Result.ok(components));
  }

  /**
   * Create a new data link (full hierarchical view with subsystems).
   * Performs the SAME DB write as POST /data-links.
   * Returns ComponentCollectionWithSubsystemsDto.
   */
  @Post('with-subsystems')
  @ApiDocumentationWithExample({
    summary: 'Create a new data link (full view with subsystem hierarchy)',
    description:
      'Creates a data link — SAME DB write as POST /data-links. ' +
      'Returns ComponentCollectionWithSubsystemsDto with the created link and subsystem structure.',
    requestDto: CreateDataLinkRequest,
    requestDtoDescription: 'Data link creation parameters',
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Data link created successfully',
        dto: ComponentCollectionWithSubsystemsDto,
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
    @Body() createDto: CreateDataLinkRequest,
  ): Promise<ApiResult<ComponentCollectionWithSubsystemsDto>> {
    console.log('Creating data link (with-subsystems) for project:', projectId);

    const command = new CreateDataLinkCommand(
      createDto.sourceNodeSystemId,
      createDto.sourcePortSystemId,
      createDto.destinationNodeSystemId,
      createDto.destinationPortSystemId,
      createDto.type ?? 'normal',
    );

    const components =
      await this.commandBus.execute<ComponentCollectionResponseDto>(command);
    return toApiResult(Result.ok({...components, subsystems: []}));
  }

  /**
   * Delete a data link.
   * Returns the deleted link snapshot so the caller can undo the operation.
   */
  @Delete(':dataLinkSystemId')
  @ApiParam({
    name: 'dataLinkSystemId',
    required: true,
    type: String,
    description: 'System id of the data link to delete',
  })
  @ApiDocumentationWithExample({
    summary: 'Delete a data link',
    description:
      'Deletes a data link by systemId. Returns the deleted link snapshot for undo support.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Data link deleted successfully',
        dto: DataLinkResponseDto,
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
  ): Promise<ApiResult<DataLinkResponseDto>> {
    console.log(
      'Deleting data link:',
      dataLinkSystemId,
      'in project:',
      projectId,
    );

    const command = new DeleteDataLinkCommand(
      Number.parseInt(dataLinkSystemId, 10),
    );

    const deleted = await this.commandBus.execute<DataLinkResponseDto>(command);
    return toApiResult(Result.ok(deleted));
  }
}
