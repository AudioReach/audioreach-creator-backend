/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Get,
  HttpStatus,
  NotImplementedException,
  Param,
  UseGuards,
} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
import {ApiExtraModels, ApiParam, ApiTags} from '@nestjs/swagger';
import {ApiDocumentationWithExample} from '../../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {BaseController} from '../../base/base.controller.js';
import {AllowedSpfCustomModuleInterfaceDto} from './dto/spf-custom-module-schema.dto.js';
import {SpfCustomModuleSchemaResponseDto} from './dto/response/spf-custom-module-schema-response.dto.js';

/**
 * Controller for SPF custom module schema APIs.
 * Provides endpoints to retrieve the static schema (allowed types and interfaces) for custom SPF modules within a project.
 */
@ApiTags('spf-custom-module-schema')
@Controller('arc-api/v1/projects/:projectId')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
})
@ApiExtraModels(
  ApiResult,
  SpfCustomModuleSchemaResponseDto,
  AllowedSpfCustomModuleInterfaceDto,
)
export class SpfCustomModuleSchemaController extends BaseController {
  constructor() {
    super();
  }

  /**
   * Get the SPF custom module schema for a project.
   */
  @Get('spf-custom-module-schema')
  @ApiDocumentationWithExample({
    summary: 'Get SPF custom module schema for a project',
    description:
      'Returns the allowed module types and interfaces applicable to custom SPF modules within the given project\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/spf-custom-module-schema\n' +
      '```\n\n' +
      '**Response:**\n' +
      'Returns a `SpfCustomModuleSchemaDto` containing:\n' +
      '- `allowedTypes`: Array of allowed module types, each with a name and value\n' +
      '- `allowedInterfaces`: Array of allowed interfaces, each containing:\n' +
      '  - `type`: Interface type as a name-value pair\n' +
      '  - `allowedVersions`: Array of allowed versions for this interface type',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully retrieved SPF custom module schema',
        dto: SpfCustomModuleSchemaResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Internal server error',
      },
    ],
  })
  async getSpfCustomModuleSchema(
    @Param('projectId') _projectId: string,
  ): Promise<ApiResult<SpfCustomModuleSchemaResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException(
      'getSpfCustomModuleSchema is not implemented yet',
    );
  }
}
