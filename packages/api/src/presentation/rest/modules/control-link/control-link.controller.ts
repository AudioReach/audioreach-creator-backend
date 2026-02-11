/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {ApiTags, ApiParam} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {NewLinkRequest} from './dto/control-link-request.dto.js';
import {
  ControlLinkDto,
  ControlLinkPropertiesDto,
} from './dto/control-link.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';

/**
 * Controller to support all control link related APIs for usecase design.
 * Provides control link related APIs for usecase design.
 */
@ApiTags('control-links')
@Controller('arc-api/v1/projects/:projectId/control-links')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class ControlLinkController extends BaseController {
  constructor() {
    super();
  }

  /**
   * Get control-links.
   */
  @Post('get')
  @ApiDocumentationWithExample({
    summary: 'Get control-links for provided systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of control-link system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [ControlLinkDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Some control-link(s) are not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get control-link(s)',
      },
    ],
  })
  async getControlLinks(
    @Param('projectId') projectId: string,
    @Body() controlLinkSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<ControlLinkDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting control-links in project ${projectId}: ${JSON.stringify(controlLinkSystemIds)}`,
    );
    throw new HttpException(
      'Control-links retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Add a new control link
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Add a new control link',
    requestDto: NewLinkRequest,

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [ControlLinkDto],
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to add a control-link',
      },
    ],
  })
  async addControlConnection(
    @Body() controlLinkRequest: NewLinkRequest,
  ): Promise<ApiResult<ControlLinkDto>> {
    // Log the connection info for debugging
    console.log('Adding control connection:', controlLinkRequest);
    await Promise.resolve(); // Placeholder to satisfy linter
    throw new HttpException(
      `Control connection creation not implemented for request: ${JSON.stringify(controlLinkRequest)}`,
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Update a control link's properties.
   */
  @Patch('/:controlLinkSystemId/properties')
  @ApiDocumentationWithExample({
    summary: 'Update control link properties',
    requestDto: ControlLinkPropertiesDto,

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [ControlLinkDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'control-link is not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update control-link property',
      },
    ],
  })
  async updateControlLinkProperties(
    @Param('controlLinkSystemId') controlLinkSystemId: string,
    @Body() properties: ControlLinkPropertiesDto,
  ): Promise<void> {
    // Log the update parameters for debugging
    console.log(
      `Updating control link ${controlLinkSystemId} with properties:`,
      properties,
    );
    await Promise.resolve(); // Placeholder to satisfy linter
    throw new HttpException(
      `Control link properties update not implemented for ID: ${controlLinkSystemId}`,
      HttpStatus.NOT_IMPLEMENTED,
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
        dto: ControlLinkPropertiesDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Control link is not found',
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
  ): Promise<ApiResult<ControlLinkPropertiesDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting properties in project ${projectId} for control link ${controlLinkSystemId}`,
    );
    throw new HttpException(
      'Control link properties retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
