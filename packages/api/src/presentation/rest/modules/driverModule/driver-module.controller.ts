/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Get,
  Param,
  Query,
  HttpStatus,
  HttpException,
  UseGuards,
} from '@nestjs/common';
import {ApiTags, ApiExtraModels, ApiParam, ApiQuery} from '@nestjs/swagger';
import {AuthGuard} from '@nestjs/passport';
import {BaseController} from '../base/base.controller.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {DriverModuleResponseDto} from './dto/response/driver-module-response.dto.js';
import {DriverModuleCalDataResponseDto} from './dto/response/driver-module-cal-data-response.dto.js';
import {ConfigElementDto} from '../../common/dto/element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from '../../common/dto/element-data/elements/element-template-array.dto.js';
import {StructDto} from '../../common/dto/element-data/elements/struct.dto.js';
import {NameValuePairDto} from '../../common/dto/element-data/elements/config-element/name-value-pair.dto.js';
import {BitFieldDto} from '../../common/dto/element-data/elements/config-element/bit-field.dto.js';

/**
 * Controller for driver module APIs.
 * Provides endpoints to retrieve driver modules.
 */
@ApiTags('driver-modules')
@Controller('arc-api/v1/projects/:projectId/driver-modules')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
})
@ApiExtraModels(
  ApiResult,
  DriverModuleResponseDto,
  DriverModuleCalDataResponseDto,
  ConfigElementDto,
  ElementTemplateArrayDto,
  StructDto,
  NameValuePairDto,
  BitFieldDto,
)
export class DriverModuleController extends BaseController {
  constructor() {
    super();
  }

  //#region Module Operations

  //#region GET Methods

  //#region Get Driver Modules

  /**
   * Get list of driver modules for a project.
   */
  @Get()
  @ApiQuery({
    name: 'moduleId',
    required: false,
    type: Number,
    description: 'Filter driver modules by module ID',
  })
  @ApiQuery({
    name: 'includeTuningConfiguration',
    required: false,
    type: Boolean,
    description:
      'When set to true, includes CKV tuning configuration in the response. If not set or set to false, CKV tuning configuration will not be included.',
  })
  @ApiDocumentationWithExample({
    summary: 'Get list of driver modules for a project',
    description:
      'Returns all driver modules available for the given project\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/driver-modules?moduleId=12345&includeTuningConfiguration=true\n' +
      '```\n\n' +
      '**Query Parameters:**\n' +
      '- `moduleId` (optional): Filter results by specific module ID. If provided, only driver modules with this module ID will be returned\n' +
      '- `includeTuningConfiguration` (optional, default: false): \n' +
      '  - When set to `true`: CKV tuning configuration will be included in the response\n' +
      '  - When set to `false` or not provided: CKV tuning configuration will NOT be included in the response\n\n' +
      '**Response:**\n' +
      'Returns an array of driver modules, each containing:\n' +
      '- `systemId`: Unique system identifier of the driver module\n' +
      '- `moduleId`: Numeric identifier of the driver module\n' +
      '- `name`: Name of the driver module\n' +
      '- `displayName`: Display name of the driver module\n' +
      '- `description`: Description of the driver module\n' +
      '- `deprecated`: Optional deprecation flag\n' +
      '- `ckvTuningConfiguration`: CKV tuning configuration (only included when includeTuningConfiguration=true)\n' +
      '- `changeInfo`: Change tracking information\n' +
      '  - `changeType`: Type of change (NONE, CREATE, UPDATE, DELETE)\n' +
      '  - `changeId`: Change set identifier (present when changeType is not NONE)\n' +
      '  - `changeStatus`: Change status (STAGED, UNSTAGED)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully retrieved driver modules',
        dto: [DriverModuleResponseDto],
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input parameters',
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
  async getDriverModules(
    @Param('projectId') projectId: string,
    @Query('moduleId') moduleId?: number,
    @Query('includeTuningConfiguration')
    includeTuningConfiguration?: boolean,
  ): Promise<ApiResult<DriverModuleResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting driver modules for project ${projectId}, moduleId: ${moduleId}, includeTuningConfiguration: ${includeTuningConfiguration}`,
    );
    throw new HttpException(
      'Driver modules retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  //#endregion

  //#region Get Driver Module By ID

  /**
   * Get a specific driver module by its instance system ID.
   */
  @Get(':moduleInstanceSystemId')
  @ApiParam({
    name: 'moduleInstanceSystemId',
    type: 'string',
    description: 'The unique system identifier of the driver module instance',
  })
  @ApiQuery({
    name: 'includeTuningConfiguration',
    required: false,
    type: Boolean,
    description:
      'When set to true, includes CKV tuning configuration in the response. If not set or set to false, CKV tuning configuration will not be included.',
  })
  @ApiDocumentationWithExample({
    summary: 'Get a specific driver module by instance system ID',
    description:
      'Returns detailed information about a specific driver module instance for the given project\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/driver-modules/driver-mod-001?includeTuningConfiguration=true\n' +
      '```\n\n' +
      '**Query Parameters:**\n' +
      '- `includeTuningConfiguration` (optional, default: false): \n' +
      '  - When set to `true`: CKV tuning configuration will be included in the response\n' +
      '  - When set to `false` or not provided: CKV tuning configuration will NOT be included in the response\n\n' +
      '**Response:**\n' +
      'Returns a driver module object containing:\n' +
      '- `systemId`: Unique system identifier of the driver module instance\n' +
      '- `moduleId`: Numeric identifier of the driver module\n' +
      '- `name`: Name of the driver module\n' +
      '- `displayName`: Display name of the driver module\n' +
      '- `description`: Description of the driver module\n' +
      '- `deprecated`: Optional deprecation flag\n' +
      '- `ckvTuningConfiguration`: CKV tuning configuration (only included when includeTuningConfiguration=true)\n' +
      '- `changeInfo`: Change tracking information\n' +
      '  - `changeType`: Type of change (NONE, CREATE, UPDATE, DELETE)\n' +
      '  - `changeId`: Change set identifier (present when changeType is not NONE)\n' +
      '  - `changeStatus`: Change status (STAGED, UNSTAGED)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully retrieved driver module',
        dto: DriverModuleResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input parameters',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or driver module not found',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Internal server error',
      },
    ],
  })
  async getDriverModuleById(
    @Param('projectId') projectId: string,
    @Param('moduleInstanceSystemId') moduleInstanceSystemId: string,
    @Query('includeTuningConfiguration')
    includeTuningConfiguration?: boolean,
  ): Promise<ApiResult<DriverModuleResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting driver module ${moduleInstanceSystemId} for project ${projectId}, includeTuningConfiguration: ${includeTuningConfiguration}`,
    );
    throw new HttpException(
      'Driver module retrieval by ID functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  //#endregion

  //#endregion

  //#endregion

  //#region Calibration Operations

  //#region GET Methods

  //#region Get Calibration Data

  /**
   * Get calibration data for a specific driver module and CKV.
   */
  @Get(':moduleInstanceSystemId/cal-data/:ckvSystemId')
  @ApiParam({
    name: 'moduleInstanceSystemId',
    required: true,
    type: String,
    description: 'System identifier of the module instance',
  })
  @ApiParam({
    name: 'ckvSystemId',
    required: true,
    type: String,
    description: 'System identifier of the Calibration Key-Value (CKV)',
  })
  @ApiDocumentationWithExample({
    summary: 'Get calibration data for a specific driver module and CKV',
    description:
      'Returns the calibration data for a given module system ID and CKV system ID.\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/driver-modules/driver-mod-001/cal-data/ckv-sys-001\n' +
      '```\n\n' +
      '**Response:**\n' +
      'Returns a `CalDataResponseDto` containing an array of parameter data, ' +
      'one entry per PID. Each entry includes:\n' +
      '- `systemId`: System identifier\n' +
      '- `pid`: Parameter ID\n' +
      '- `name`: Human-readable parameter name\n' +
      '- `description`: Description of the parameter\n' +
      '- `elements`: Array of calibration elements (ConfigElement, ConfigElementArray, Struct, StructArray)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully retrieved calibration data',
        dto: DriverModuleCalDataResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input parameters',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project, module, or CKV not found',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Internal server error',
      },
    ],
  })
  async getModuleCalData(
    @Param('projectId') projectId: string,
    @Param('moduleInstanceSystemId') moduleInstanceSystemId: string,
    @Param('ckvSystemId') ckvSystemId: string,
  ): Promise<ApiResult<DriverModuleCalDataResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting cal data for module ${moduleInstanceSystemId}, CKV ${ckvSystemId} in project ${projectId}`,
    );
    throw new HttpException(
      'Calibration data retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  //#endregion

  //#endregion

  //#endregion
}
