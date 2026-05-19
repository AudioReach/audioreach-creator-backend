/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpException,
  UseGuards,
} from '@nestjs/common';
import {ApiTags, ApiExtraModels, ApiParam, ApiQuery} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {
  SpfModuleDto,
  SpfModulePropertiesDto,
} from './dto/shared/spf-module.dto.js';
import {SpfModuleTuningConfigResponseDto} from './dto/response/spf-module-tuning-config-response.dto.js';
import {SpfModuleCalDataResponseDto} from './dto/response/spf-module-cal-data-response.dto.js';
import {UpdateCalDataRequestDto} from './dto/request/update-cal-data-request.dto.js';
import {UpdateTagDataRequestDto} from './dto/request/update-tag-data-request.dto.js';
import {TagDataDto} from '../../common/dto/tuning-data/tag-data.dto.js';
import {ParameterDetailDto} from '../../common/dto/parameter.dto.js';
import {ConfigElementDto} from '../../common/dto/element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from '../../common/dto/element-data/elements/element-template-array.dto.js';
import {StructDto} from '../../common/dto/element-data/elements/struct.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {
  BaseSpfModuleRequest,
  DetailedSpfModuleRequest,
  CloneSpfModuleRequest,
} from './dto/request/spf-module-request.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';

/**
 * Controller to support all module related APIs for usecase design
 * Provides module related APIs for usecase design.
 */
@ApiTags('spf-modules')
@Controller('arc-api/v1/projects/:projectId/spf-modules')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
@ApiExtraModels(
  SpfModuleDto,
  SpfModuleTuningConfigResponseDto,
  SpfModuleCalDataResponseDto,
  UpdateCalDataRequestDto,
  TagDataDto,
  UpdateTagDataRequestDto,
  ParameterDetailDto,
  ConfigElementDto,
  ElementTemplateArrayDto,
  StructDto,
  BaseSpfModuleRequest,
  DetailedSpfModuleRequest,
  CloneSpfModuleRequest,
)
export class SpfModuleController extends BaseController {
  constructor() {
    super();
  }

  /**
   * Query SPF modules.
   */
  @Post('query')
  @ApiDocumentationWithExample({
    summary: 'Query SPF modules for provided systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of SPF module system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [SpfModuleDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Some SPF modules are not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get SPF modules',
      },
    ],
  })
  async querySpfModules(
    @Param('projectId') projectId: string,
    @Body() spfModuleSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<SpfModuleDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Getting SPF modules in project:',
      projectId,
      'with system IDs:',
      spfModuleSystemIds,
    );
    throw new HttpException(
      'SPF modules retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Create a new SPF module for a given module id and processor id.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create a new SPF module for a given module id',
    requestDto: BaseSpfModuleRequest,
    requestDtoExample: {
      className: 'NewSpfModuleRequestExample',
    },
    responses: [
      {
        status: HttpStatus.OK,
        description: 'New created SPF module information',
        dto: SpfModuleDto,
        example: {
          className: 'SpfModuleDTOExample',
        },
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to add a new SPF module',
      },
    ],
  })
  async addSpfModule(
    @Param('projectId') projectId: string,
    @Body() request: BaseSpfModuleRequest,
  ): Promise<ApiResult<SpfModuleDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'addSpfModule request received for projectId:',
      projectId,
      'with request:',
      request,
    ); // Placeholder usage to satisfy linter
    throw new HttpException(
      'This functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Get all property data for an SPF module (subgraph, container, subsystem, module).
   */
  @Get('/:spfModuleSystemId/properties')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all property data for an SPF module',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: SpfModulePropertiesDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'SPF module is not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get SPF module properties',
      },
    ],
  })
  async getSpfModuleProperties(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
  ): Promise<ApiResult<SpfModulePropertiesDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Getting properties in project:',
      projectId,
      'for SPF module:',
      spfModuleSystemId,
    );
    throw new HttpException(
      'SPF module properties retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Get all tuning configuration (CKVS and TKVS) for an SPF module.
   */
  @Get('/:spfModuleSystemId/tuning-config')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all tuning configuration (CKVS and TKVS) for an SPF module',
    description:
      'Retrieves the complete tuning configuration for a specific SPF module, including:\n\n' +
      '**CKVS (Calibration Key-Values):** Module-level calibration configuration parameters\n' +
      '**Tags with TKVS:** Tag-specific configuration where each tag contains its own Tag Key-Values\n\n' +
      'The response structure includes:\n' +
      '- Module CKVs for calibration (each CKV has systemId and key-value pairs)\n' +
      '- Tags with their TKVs (each tag has systemId, tagId, tagName, and array of TKVs)\n' +
      '- Each TKV has systemId and key-value pairs\n\n' +
      'Parameter payloads and UI persistence data are available through separate APIs.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Tuning configuration retrieved successfully',
        dto: SpfModuleTuningConfigResponseDto,
        example: {
          className: 'SpfModuleTuningConfigExample',
        },
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get tuning configuration',
      },
    ],
  })
  async getSpfModuleTuningConfig(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
  ): Promise<ApiResult<SpfModuleTuningConfigResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Getting tuning config for SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
    );
    throw new HttpException(
      'SPF module tuning configuration retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Get calibration data for an SPF module.
   */
  @Get('/:spfModuleSystemId/cal-data/:ckvSystemId')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiParam({
    name: 'ckvSystemId',
    required: true,
    type: String,
    description: 'CKV (Calibration Key-Value) system ID for calibration data',
    example: '101',
  })
  @ApiQuery({
    name: 'param-system-ids',
    required: false,
    type: String,
    description:
      'Optional comma-separated list of parameter system IDs. Example: ?param-system-ids=1,2,3 or omit for all parameter IDs under the SPF module.',
    example: '1,2,3',
  })
  @ApiDocumentationWithExample({
    summary: 'Get calibration data for an SPF module',
    description:
      'Retrieves calibration data for a specific SPF module with configElements containing name, value, type, ranges etc.\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj123/spf-modules/12345/cal-data/101\n' +
      'GET /arc-api/v1/projects/proj123/spf-modules/12345/cal-data/101?param-system-ids=1,2,3\n' +
      '```\n\n' +
      '**Required Parameters:**\n' +
      '- `ckvSystemId`: CKV system ID for calibration data (path parameter)\n\n' +
      '**Optional Parameters:**\n' +
      '- `param-system-ids`: Comma-separated list of parameter system IDs\n\n' +
      '**Parameter Filtering Logic:**\n' +
      '- If `param-system-ids` are provided: Only return data for the specified parameter system IDs\n' +
      '- If `param-system-ids` are not provided: Return all parameter data under the SPF module\n\n' +
      '**Response Format:**\n' +
      'JSON format including all configElements with name, value, type, ranges etc.\n\n' +
      '**isActive Flag:**\n' +
      '- Default: `false` (for RTGM - Real-Time Graph Manager)\n' +
      '- Set to `true` only in RTC (Real-Time Control) context',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Calibration data retrieved successfully',
        dto: SpfModuleCalDataResponseDto,
      },
      {
        status: HttpStatus.FORBIDDEN,
        description: 'Module license required to access calibration data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'SPF module or CKV system ID not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get calibration data',
      },
    ],
  })
  async getCalibrationData(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Param('ckvSystemId') ckvSystemId: string,
    @Query('param-system-ids') paramSystemIds?: string,
  ): Promise<ApiResult<SpfModuleCalDataResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Getting calibration data for SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with CKV system ID:',
      ckvSystemId,
      paramSystemIds
        ? 'and parameter system IDs:'
        : 'for all parameter system IDs',
      paramSystemIds || '',
    );
    throw new HttpException(
      'Calibration data retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Update calibration data for an SPF module.
   */
  @Put('/:spfModuleSystemId/cal-data/:ckvSystemId')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiParam({
    name: 'ckvSystemId',
    required: true,
    type: String,
    description: 'CKV (Calibration Key-Value) system ID for calibration data',
    example: '101',
  })
  @ApiDocumentationWithExample({
    summary: 'Update calibration data for an SPF module',
    description:
      'Updates calibration data for a specific SPF module. Supports updating multiple PIDs in a single request.\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PUT /arc-api/v1/projects/proj123/spf-modules/12345/cal-data/101\n' +
      '```\n\n' +
      '**Required Parameters:**\n' +
      '- `ckvSystemId`: CKV system ID for calibration data (path parameter)\n\n' +
      '**Request Body:**\n' +
      'Array of PID-specific calibration data updates. Each item contains:\n' +
      '- `pid`: Parameter ID to update\n' +
      '- `elements`: Array of calibration elements with updated values\n\n' +
      '**Response Format:**\n' +
      'Returns the updated calibration data in the same format as the GET endpoint.\n\n' +
      '**Batch Updates:**\n' +
      'Multiple PIDs can be updated in a single request by providing multiple items in the data array.',
    requestDto: UpdateCalDataRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Calibration data updated successfully',
        dto: SpfModuleCalDataResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input data',
      },
      {
        status: HttpStatus.FORBIDDEN,
        description: 'Module license required to update calibration data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'SPF module or CKV system ID not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update calibration data',
      },
    ],
  })
  async updateCalibrationData(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Param('ckvSystemId') ckvSystemId: string,
    @Body() updateRequest: UpdateCalDataRequestDto,
  ): Promise<ApiResult<SpfModuleCalDataResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Updating calibration data for SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with CKV system ID:',
      ckvSystemId,
      'for parameters:',
      updateRequest.data.map(item => item.parameterId).join(', '),
    );
    throw new HttpException(
      'Calibration data update functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Get tag data for an SPF module.
   */
  @Get('/:spfModuleSystemId/tag-data/:tagSystemId/:tkvSystemId')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiParam({
    name: 'tagSystemId',
    required: true,
    type: String,
    description: 'Tag system ID for tag data',
    example: '201',
  })
  @ApiParam({
    name: 'tkvSystemId',
    required: true,
    type: String,
    description: 'TKV (Tag Key-Value) system ID for tag data',
    example: '301',
  })
  @ApiQuery({
    name: 'param-system-ids',
    required: false,
    type: String,
    description:
      'Optional comma-separated list of parameter system IDs. Example: ?param-system-ids=1,2,3 or omit for all parameter IDs under the SPF module.',
    example: '1,2,3',
  })
  @ApiDocumentationWithExample({
    summary: 'Get tag data for an SPF module',
    description:
      'Retrieves tag-specific data for an SPF module with configElements containing name, value, type, ranges etc.\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj123/spf-modules/12345/tag-data/201/301\n' +
      'GET /arc-api/v1/projects/proj123/spf-modules/12345/tag-data/201/301?param-system-ids=1,2,3\n' +
      '```\n\n' +
      '**Required Parameters:**\n' +
      '- `tagSystemId`: Tag system ID for tag data (path parameter)\n' +
      '- `tkvSystemId`: TKV system ID for tag data (path parameter)\n\n' +
      '**Optional Parameters:**\n' +
      '- `param-system-ids`: Comma-separated list of parameter system IDs\n\n' +
      '**Parameter Filtering Logic:**\n' +
      '- If `param-system-ids` are provided: Only return data for the specified parameter system IDs\n' +
      '- If `param-system-ids` are not provided: Return all parameter data under the SPF module\n\n' +
      '**Response Format:**\n' +
      'JSON format including tagSystemId, tkvSystemId, and array of PID data with configElements.\n\n' +
      '**Tag Context:**\n' +
      'The response includes tag-specific context (tagSystemId, tkvSystemId) along with the same\n' +
      'PID data structure as calibration data, allowing for tag-specific configuration management.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Tag data retrieved successfully',
        dto: TagDataDto,
      },
      {
        status: HttpStatus.FORBIDDEN,
        description: 'Module license required to access tag data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'SPF module, tag system ID, or TKV system ID not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get tag data',
      },
    ],
  })
  async getTagData(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Param('tagSystemId') tagSystemId: string,
    @Param('tkvSystemId') tkvSystemId: string,
    @Query('param-system-ids') paramSystemIds?: string,
  ): Promise<ApiResult<TagDataDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Getting tag data for SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with tag system ID:',
      tagSystemId,
      'and TKV system ID:',
      tkvSystemId,
      paramSystemIds
        ? 'and parameter system IDs:'
        : 'for all parameter system IDs',
      paramSystemIds || '',
    );
    throw new HttpException(
      'Tag data retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Update tag data for an SPF module.
   */
  @Put('/:spfModuleSystemId/tag-data/:tagSystemId/:tkvSystemId')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiParam({
    name: 'tagSystemId',
    required: true,
    type: String,
    description: 'Tag system ID for tag data',
    example: '201',
  })
  @ApiParam({
    name: 'tkvSystemId',
    required: true,
    type: String,
    description: 'TKV (Tag Key-Value) system ID for tag data',
    example: '301',
  })
  @ApiDocumentationWithExample({
    summary: 'Update tag data for an SPF module',
    description:
      'Updates tag-specific data for an SPF module. Supports updating multiple PIDs in a single request.\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PUT /arc-api/v1/projects/proj123/spf-modules/12345/tag-data/201/301\n' +
      '```\n\n' +
      '**Required Parameters:**\n' +
      '- `tagSystemId`: Tag system ID for tag data (path parameter)\n' +
      '- `tkvSystemId`: TKV system ID for tag data (path parameter)\n\n' +
      '**Request Body:**\n' +
      'Array of PID-specific tag data updates. Each item contains:\n' +
      '- `pid`: Parameter ID to update\n' +
      '- `elements`: Array of configuration elements with updated values\n\n' +
      '**Response Format:**\n' +
      'Returns the updated tag data in the same format as the GET endpoint, including\n' +
      'tagSystemId, tkvSystemId, and updated PID data.\n\n' +
      '**Batch Updates:**\n' +
      'Multiple PIDs can be updated in a single request by providing multiple items in the data array.\n\n' +
      '**Tag-Specific Updates:**\n' +
      'Updates are scoped to the specific tag context identified by tagSystemId and tkvSystemId.',
    requestDto: UpdateTagDataRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Tag data updated successfully',
        dto: TagDataDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input data',
      },
      {
        status: HttpStatus.FORBIDDEN,
        description: 'Module license required to update tag data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'SPF module, tag system ID, or TKV system ID not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update tag data',
      },
    ],
  })
  async updateTagData(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Param('tagSystemId') tagSystemId: string,
    @Param('tkvSystemId') tkvSystemId: string,
    @Body() updateRequest: UpdateTagDataRequestDto,
  ): Promise<ApiResult<TagDataDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Updating tag data for SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with tag system ID:',
      tagSystemId,
      'and TKV system ID:',
      tkvSystemId,
      'for parameters:',
      updateRequest.data.map(item => item.parameterId).join(', '),
    );
    throw new HttpException(
      'Tag data update functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
