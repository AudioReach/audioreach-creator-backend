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
  ModuleInstanceDto,
  ModuleInstancePropertiesDto,
} from './dto/module-instance.dto.js';
import {ModuleInstanceTuningConfigDto} from './dto/tuning-config.dto.js';
import {
  CalDataResponseDto,
  UpdateCalDataRequestDto,
  TkvDataDto,
  UpdateTagDataRequestDto,
  PidDataDto,
  ConfigElementDto,
  ConfigArrayDto,
  ConfigStructDto,
  ConfigStructArrayDto,
} from './dto/cal-tag-data.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {
  BaseModuleInstanceRequest,
  DetailedModuleInstanceRequest,
  CloneModuleInstanceRequest,
} from './dto/module-instance-request.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';

/**
 * Controller to support all module related APIs for usecase design
 * Provides module related APIs for usecase design.
 */
@ApiTags('module-instances')
@Controller('arc-api/v1/projects/:projectId/module-instances')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
@ApiExtraModels(
  ModuleInstanceDto,
  ModuleInstanceTuningConfigDto,
  CalDataResponseDto,
  UpdateCalDataRequestDto,
  TkvDataDto,
  UpdateTagDataRequestDto,
  PidDataDto,
  ConfigElementDto,
  ConfigArrayDto,
  ConfigStructDto,
  ConfigStructArrayDto,
  BaseModuleInstanceRequest,
  DetailedModuleInstanceRequest,
  CloneModuleInstanceRequest,
)
export class ModuleInstanceController extends BaseController {
  constructor() {
    super();
  }

  /**
   * Get module instances.
   */
  @Post('get')
  @ApiDocumentationWithExample({
    summary: 'Get module instances for provided systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of module instance system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [ModuleInstanceDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Some module instances are not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get module instances',
      },
    ],
  })
  async getModuleInstances(
    @Param('projectId') projectId: string,
    @Body() moduleInstanceSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<ModuleInstanceDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting module instances in project ${projectId}: ${JSON.stringify(moduleInstanceSystemIds)}`,
    );
    throw new HttpException(
      'module instances retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Create a new module instance for a given module id and processor id.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create a new module instance for a given module id',
    requestDto: BaseModuleInstanceRequest,
    requestDtoExample: {
      className: 'NewModuleInstanceRequestExample',
    },
    responses: [
      {
        status: HttpStatus.OK,
        description: 'New created module information',
        dto: ModuleInstanceDto,
        example: {
          className: 'ModuleInstanceDTOExample',
        },
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to add a new module',
      },
    ],
  })
  async addModuleInstance(
    @Param('projectId') projectId: string,
    @Body() request: BaseModuleInstanceRequest,
  ): Promise<ApiResult<ModuleInstanceDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'addModuleInstance request received for projectId:',
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
   * Get all property data for a module instance (subgraph, container, subsystem, module).
   */
  @Get('/:moduleInstanceSystemId/properties')
  @ApiParam({
    name: 'moduleInstanceSystemId',
    required: true,
    type: String,
    description: 'System id of a module instance',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all property data for a module instance',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: ModuleInstancePropertiesDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Module instance is not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get module instance properties',
      },
    ],
  })
  async getModuleInstanceProperties(
    @Param('projectId') projectId: string,
    @Param('moduleInstanceSystemId') moduleInstanceSystemId: string,
  ): Promise<ApiResult<ModuleInstancePropertiesDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting properties in project ${projectId} for module instance ${moduleInstanceSystemId}`,
    );
    throw new HttpException(
      'Module instance properties retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Get all tuning configuration (CKVS and TKVS) for a module instance.
   */
  @Get('/:moduleInstanceSystemId/tuning-config')
  @ApiParam({
    name: 'moduleInstanceSystemId',
    required: true,
    type: String,
    description: 'System id of a module instance',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary:
      'Get all tuning configuration (CKVS and TKVS) for a module instance',
    description:
      'Retrieves the complete tuning configuration for a specific module instance, including:\n\n' +
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
        dto: ModuleInstanceTuningConfigDto,
        example: {
          className: 'ModuleInstanceTuningConfigExample',
        },
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Module instance not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get tuning configuration',
      },
    ],
  })
  async getModuleInstanceTuningConfig(
    @Param('projectId') projectId: string,
    @Param('moduleInstanceSystemId') moduleInstanceSystemId: string,
  ): Promise<ApiResult<ModuleInstanceTuningConfigDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting tuning config for module instance ${moduleInstanceSystemId} in project ${projectId}`,
    );
    throw new HttpException(
      'Module instance tuning configuration retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Get calibration data for a module instance.
   */
  @Get('/:moduleInstanceSystemId/cal-data/:ckvSystemId')
  @ApiParam({
    name: 'moduleInstanceSystemId',
    required: true,
    type: String,
    description: 'System id of a module instance',
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
      'Optional comma-separated list of parameter system IDs. Example: ?param-system-ids=1,2,3 or omit for all parameter IDs under the module-instance.',
    example: '1,2,3',
  })
  @ApiDocumentationWithExample({
    summary: 'Get calibration data for a module instance',
    description:
      'Retrieves calibration data for a specific module instance with configElements containing name, value, type, ranges etc.\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj123/module-instances/12345/cal-data/101\n' +
      'GET /arc-api/v1/projects/proj123/module-instances/12345/cal-data/101?param-system-ids=1,2,3\n' +
      '```\n\n' +
      '**Required Parameters:**\n' +
      '- `ckvSystemId`: CKV system ID for calibration data (path parameter)\n\n' +
      '**Optional Parameters:**\n' +
      '- `param-system-ids`: Comma-separated list of parameter system IDs\n\n' +
      '**Parameter Filtering Logic:**\n' +
      '- If `param-system-ids` are provided: Only return data for the specified parameter system IDs\n' +
      '- If `param-system-ids` are not provided: Return all parameter data under the module-instance\n\n' +
      '**Response Format:**\n' +
      'JSON format including all configElements with name, value, type, ranges etc.\n\n' +
      '**isActive Flag:**\n' +
      '- Default: `false` (for RTGM - Real-Time Graph Manager)\n' +
      '- Set to `true` only in RTC (Real-Time Control) context',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Calibration data retrieved successfully',
        dto: CalDataResponseDto,
      },
      {
        status: HttpStatus.FORBIDDEN,
        description: 'Module license required to access calibration data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Module instance or CKV system ID not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get calibration data',
      },
    ],
  })
  async getCalibrationData(
    @Param('projectId') projectId: string,
    @Param('moduleInstanceSystemId') moduleInstanceSystemId: string,
    @Param('ckvSystemId') ckvSystemId: string,
    @Query('param-system-ids') paramSystemIds?: string,
  ): Promise<ApiResult<CalDataResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting calibration data for module instance ${moduleInstanceSystemId} in project ${projectId}`,
      `with CKV system ID: ${ckvSystemId}`,
      paramSystemIds
        ? `and parameter system IDs: ${paramSystemIds}`
        : 'for all parameter system IDs',
    );
    throw new HttpException(
      'Calibration data retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Update calibration data for a module instance.
   */
  @Put('/:moduleInstanceSystemId/cal-data/:ckvSystemId')
  @ApiParam({
    name: 'moduleInstanceSystemId',
    required: true,
    type: String,
    description: 'System id of a module instance',
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
    summary: 'Update calibration data for a module instance',
    description:
      'Updates calibration data for a specific module instance. Supports updating multiple PIDs in a single request.\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PUT /arc-api/v1/projects/proj123/module-instances/12345/cal-data/101\n' +
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
        dto: CalDataResponseDto,
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
        description: 'Module instance or CKV system ID not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update calibration data',
      },
    ],
  })
  async updateCalibrationData(
    @Param('projectId') projectId: string,
    @Param('moduleInstanceSystemId') moduleInstanceSystemId: string,
    @Param('ckvSystemId') ckvSystemId: string,
    @Body() updateRequest: UpdateCalDataRequestDto,
  ): Promise<ApiResult<CalDataResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Updating calibration data for module instance ${moduleInstanceSystemId} in project ${projectId}`,
      `with CKV system ID: ${ckvSystemId}`,
      `for PIDs: ${updateRequest.data.map(item => item.pid).join(', ')}`,
    );
    throw new HttpException(
      'Calibration data update functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Get tag data for a module instance.
   */
  @Get('/:moduleInstanceSystemId/tag-data/:tagSystemId/:tkvSystemId')
  @ApiParam({
    name: 'moduleInstanceSystemId',
    required: true,
    type: String,
    description: 'System id of a module instance',
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
      'Optional comma-separated list of parameter system IDs. Example: ?param-system-ids=1,2,3 or omit for all parameter IDs under the module-instance.',
    example: '1,2,3',
  })
  @ApiDocumentationWithExample({
    summary: 'Get tag data for a module instance',
    description:
      'Retrieves tag-specific data for a module instance with configElements containing name, value, type, ranges etc.\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj123/module-instances/12345/tag-data/201/301\n' +
      'GET /arc-api/v1/projects/proj123/module-instances/12345/tag-data/201/301?param-system-ids=1,2,3\n' +
      '```\n\n' +
      '**Required Parameters:**\n' +
      '- `tagSystemId`: Tag system ID for tag data (path parameter)\n' +
      '- `tkvSystemId`: TKV system ID for tag data (path parameter)\n\n' +
      '**Optional Parameters:**\n' +
      '- `param-system-ids`: Comma-separated list of parameter system IDs\n\n' +
      '**Parameter Filtering Logic:**\n' +
      '- If `param-system-ids` are provided: Only return data for the specified parameter system IDs\n' +
      '- If `param-system-ids` are not provided: Return all parameter data under the module-instance\n\n' +
      '**Response Format:**\n' +
      'JSON format including tagSystemId, tkvSystemId, and array of PID data with configElements.\n\n' +
      '**Tag Context:**\n' +
      'The response includes tag-specific context (tagSystemId, tkvSystemId) along with the same\n' +
      'PID data structure as calibration data, allowing for tag-specific configuration management.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Tag data retrieved successfully',
        dto: TkvDataDto,
      },
      {
        status: HttpStatus.FORBIDDEN,
        description: 'Module license required to access tag data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description:
          'Module instance, tag system ID, or TKV system ID not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get tag data',
      },
    ],
  })
  async getTagData(
    @Param('projectId') projectId: string,
    @Param('moduleInstanceSystemId') moduleInstanceSystemId: string,
    @Param('tagSystemId') tagSystemId: string,
    @Param('tkvSystemId') tkvSystemId: string,
    @Query('param-system-ids') paramSystemIds?: string,
  ): Promise<ApiResult<TkvDataDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting tag data for module instance ${moduleInstanceSystemId} in project ${projectId}`,
      `with tag system ID: ${tagSystemId} and TKV system ID: ${tkvSystemId}`,
      paramSystemIds
        ? `and parameter system IDs: ${paramSystemIds}`
        : 'for all parameter system IDs',
    );
    throw new HttpException(
      'Tag data retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Update tag data for a module instance.
   */
  @Put('/:moduleInstanceSystemId/tag-data/:tagSystemId/:tkvSystemId')
  @ApiParam({
    name: 'moduleInstanceSystemId',
    required: true,
    type: String,
    description: 'System id of a module instance',
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
    summary: 'Update tag data for a module instance',
    description:
      'Updates tag-specific data for a module instance. Supports updating multiple PIDs in a single request.\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PUT /arc-api/v1/projects/proj123/module-instances/12345/tag-data/201/301\n' +
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
        dto: TkvDataDto,
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
        description:
          'Module instance, tag system ID, or TKV system ID not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update tag data',
      },
    ],
  })
  async updateTagData(
    @Param('projectId') projectId: string,
    @Param('moduleInstanceSystemId') moduleInstanceSystemId: string,
    @Param('tagSystemId') tagSystemId: string,
    @Param('tkvSystemId') tkvSystemId: string,
    @Body() updateRequest: UpdateTagDataRequestDto,
  ): Promise<ApiResult<TkvDataDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Updating tag data for module instance ${moduleInstanceSystemId} in project ${projectId}`,
      `with tag system ID: ${tagSystemId} and TKV system ID: ${tkvSystemId}`,
      `for PIDs: ${updateRequest.data.map(item => item.pid).join(', ')}`,
    );
    throw new HttpException(
      'Tag data update functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
