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
import {DataLinkDto} from './dto/data-link.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {CreateDataLinkRequest} from './dto/request/create-data-link-request.dto.js';
import {ComponentCollectionDto} from '../../common/dto/component-collection.dto.js';
import {ComponentCollectionWithSubsystemsDto} from '../../common/dto/component-collection-with-subsystems.dto.js';
import {
  CommandBus,
  CreateDataLinkCommand,
  DeleteDataLinkCommand,
  Result,
  type UseCaseComponentsReadModel,
  type DataLinkReadModel,
} from '@arc/core';
import {CONN_CTRL_TYPE} from '../../common/utils/enums.js';

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
        dto: [DataLinkDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some data-links could not be retrieved (see errors array)',
        dto: [DataLinkDto],
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
  ): Promise<ApiResult<DataLinkDto[]>> {
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
   * Stores all link segments in DB; returns ComponentCollectionDto.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create a new data link (flat view)',
    description:
      'Creates a data link between two modules. Stores all segments (mod→SS, SS→SS, SS→mod) in the DB. ' +
      'Returns a flat ComponentCollectionDto with the created link.',
    requestDto: CreateDataLinkRequest,
    requestDtoDescription: 'Data link creation parameters',
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Data link created successfully',
        dto: ComponentCollectionDto,
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
  ): Promise<ApiResult<ComponentCollectionDto>> {
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
      'client-id',
    );

    const components =
      await this.commandBus.execute<UseCaseComponentsReadModel>(command);
    return toApiResult(Result.ok(this.toComponentCollectionDto(components)));
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
      'client-id',
    );

    const components =
      await this.commandBus.execute<UseCaseComponentsReadModel>(command);
    return toApiResult(
      Result.ok(this.toComponentCollectionWithSubsystemsDto(components)),
    );
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
        dto: DataLinkDto,
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
  ): Promise<ApiResult<DataLinkDto>> {
    console.log(
      'Deleting data link:',
      dataLinkSystemId,
      'in project:',
      projectId,
    );

    const command = new DeleteDataLinkCommand(
      Number.parseInt(dataLinkSystemId, 10),
      'client-id',
    );

    const deleted = await this.commandBus.execute<DataLinkReadModel>(command);
    return toApiResult(
      Result.ok(
        new DataLinkDto(
          deleted.systemId.toString(),
          deleted.systemId,
          CONN_CTRL_TYPE.MODULE_MODULE,
          deleted.sourceNodeSystemId,
          deleted.sourcePortSystemId,
          deleted.destinationNodeSystemId,
          deleted.destinationPortSystemId,
          false,
        ),
      ),
    );
  }

  private toComponentCollectionDto(
    components: UseCaseComponentsReadModel,
  ): ComponentCollectionDto {
    const dto = new ComponentCollectionDto();
    dto.dataLinks = components.dataLinks.map(
      link =>
        new DataLinkDto(
          link.systemId.toString(),
          link.systemId,
          CONN_CTRL_TYPE.MODULE_MODULE,
          link.sourceNodeSystemId,
          link.sourcePortSystemId,
          link.destinationNodeSystemId,
          link.destinationPortSystemId,
          false,
        ),
    );
    return dto;
  }

  private toComponentCollectionWithSubsystemsDto(
    components: UseCaseComponentsReadModel,
  ): ComponentCollectionWithSubsystemsDto {
    const dto = new ComponentCollectionWithSubsystemsDto();
    dto.dataLinks = components.dataLinks.map(
      link =>
        new DataLinkDto(
          link.systemId.toString(),
          link.systemId,
          CONN_CTRL_TYPE.MODULE_MODULE,
          link.sourceNodeSystemId,
          link.sourcePortSystemId,
          link.destinationNodeSystemId,
          link.destinationPortSystemId,
          false,
        ),
    );
    dto.subsystems = [];
    return dto;
  }
}
