/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  BadRequestException,
  NotImplementedException,
  InternalServerErrorException,
  UseGuards,
} from '@nestjs/common';
import {ApiTags, ApiExtraModels, ApiParam, ApiQuery} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {SpfModuleResponseDto} from './dto/shared/spf-module-response.dto.js';
import {CkvCalDataResponseDto} from '../../common/dto/tuning-data/ckv-cal-data-response.dto.js';

import {UpdateTkvRequestDto} from './dto/request/update-tkv-request.dto.js';
import {TkvCalDataResponseDto} from '../../common/dto/tuning-data/tkv-cal-data-response.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {
  CreateSpfModuleRequestDto,
  CloneSpfModuleRequestDto,
  CreateCkvsRequestDto,
  DeleteCkvsRequestDto,
  CreateTagsRequestDto,
  DeleteTagsRequestDto,
  CreateTkvsRequestDto,
  DeleteTkvsRequestDto,
  CreateCkvParametersRequestDto,
  DeleteCkvParametersRequestDto,
  CreateTkvParametersRequestDto,
  RemoveTkvParametersRequestDto,
} from './dto/request/spf-module-request.dto.js';
import {PatchSpfModuleRequestDto} from './dto/request/patch-spf-module-request.dto.js';
import {UpdateSpfModuleCalDataRequestDto} from './dto/request/update-spf-module-cal-data-request.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {
  Result,
  RESULT_KIND,
  QueryBus,
  CommandBus,
  PatchSpfModuleCommand,
  CreateModuleCommand,
  PutCkvCalDataCommand,
  type PutCkvCalDataResult,
  UpdateTkvCalDataCommand,
  type UpdateTkvCalDataResult,
  SpfModulesQuery as SpfModuleQuery,
  GetCkvCalibrationDataQuery,
  GetTkvCalibrationDataQuery,
  type SpfModuleDto,
  type ActiveSession,
  type ParameterDto,
} from '@arc/core';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {SessionGuard} from '../../../../guards/session-guard.js';
import {ArcSession} from '../../../../guards/arc-session.decorator.js';
import {CkvResponseDto} from './dto/shared/ckv-response.dto.js';
import {TkvResponseDto} from './dto/shared/tkv-response.dto.js';
import {TagInfoResponseDto} from './dto/shared/tag-info-response.dto.js';
import {
  AddCkvsResponseDto,
  CkvParameterRemovalResponseDto,
  CkvParametersResponseDto,
  RemoveSpfModuleResponseDto,
  TkvParameterItem,
  TkvParameterRemovalResponseDto,
  TkvParametersResponseDto,
} from './dto/response/spf-module-response.dto.js';

/**
 * Controller to support all module related APIs for usecase design
 * Provides module related APIs for usecase design.
 */
@ApiTags('spf-modules')
@Controller('arc-api/v1/projects/:projectId/spf-modules')
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
@ApiExtraModels(
  SpfModuleResponseDto,
  CkvCalDataResponseDto,
  UpdateSpfModuleCalDataRequestDto,
  TkvCalDataResponseDto,
  UpdateTkvRequestDto,
  CreateSpfModuleRequestDto,
  CloneSpfModuleRequestDto,
  CreateCkvsRequestDto,
  DeleteCkvsRequestDto,
  CreateTagsRequestDto,
  DeleteTagsRequestDto,
  CreateTkvsRequestDto,
  DeleteTkvsRequestDto,
  CreateCkvParametersRequestDto,
  DeleteCkvParametersRequestDto,
  CreateTkvParametersRequestDto,
  RemoveTkvParametersRequestDto,
  PatchSpfModuleRequestDto,
  CkvResponseDto,
  TagInfoResponseDto,
  TkvResponseDto,
  CkvParametersResponseDto,
  TkvParametersResponseDto,
  CkvParameterRemovalResponseDto,
  TkvParameterRemovalResponseDto,
  TkvParameterItem,
  AddCkvsResponseDto,
  RemoveSpfModuleResponseDto,
)
export class SpfModuleController extends BaseController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {
    super();
  }

  /**
   * Query SPF modules with optional data inclusion.
   */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiQuery({
    name: 'include',
    required: false,
    type: String,
    description:
      'Comma-separated list of optional data to include (ckvs, tags, properties)',
    example: 'ckvs,tags',
  })
  @ApiDocumentationWithExample({
    summary: 'Query SPF modules with optional data inclusion',
    description:
      'Query SPF modules for provided systemIds with optional data inclusion.\n\n' +
      '**Optional Query Parameters:**\n' +
      '- `include`: Comma-separated list of optional data to include\n' +
      '  - `ckvs`: Include Calibration Key-Values\n' +
      '  - `tags`: Include Tags with Tag Key-Values\n' +
      '  - `properties`: Include module properties\n\n' +
      '**Examples:**\n' +
      '```\n' +
      'POST /spf-modules/query\n' +
      'POST /spf-modules/query?include=ckvs\n' +
      'POST /spf-modules/query?include=ckvs,tags\n' +
      'POST /spf-modules/query?include=ckvs,tags,properties\n' +
      '```',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of SPF module system ids',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'All SPF modules found successfully',
        dto: [SpfModuleResponseDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some SPF modules could not be retrieved (see errors array)',
        dto: [SpfModuleResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
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
    @Query('include') include?: string,
  ): Promise<ApiResult<SpfModuleResponseDto[]>> {
    const includeOptions = new Set(
      include?.split(',').map(s => s.trim().toLowerCase()) ?? [],
    );

    // Parse string IDs to integers — radix 10 guards against octal misparse on '0'-prefixed strings
    const systemIds = spfModuleSystemIds.systemIds.map(id => {
      const parsed = Number.parseInt(id, 10);
      if (Number.isNaN(parsed)) {
        throw new BadRequestException(`Invalid system ID: ${id}`);
      }
      return parsed;
    });

    const query = new SpfModuleQuery(
      systemIds,
      Number.parseInt(projectId, 10), // radix 10 — see above
      includeOptions.has('ckvs'),
      includeOptions.has('tags'),
      'client-id', // TODO: extract real clientId from JWT once auth wiring is done
    );

    const result = await this.queryBus.execute<Result<SpfModuleDto[]>>(query);

    return toApiResult(result, data => data.map(m => this.addLinks(m)));
  }

  /**
   * Create a new SPF module for a given module id and processor id.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create a new SPF module',
    description:
      'Creates a new SPF module with the specified module definition system ID and processor system ID.\n\n' +
      '**Required Parameters:**\n' +
      '- `moduleDefinitionSystemId`: Module definition system ID\n' +
      '- `processorSystemId`: Processor system ID\n\n' +
      '**Optional Parameters:**\n' +
      '- `parentSystemId`: Parent subsystem system ID\n' +
      '- `subgraphSystemId`: Existing subgraph system ID (if not provided, creates new subgraph)\n' +
      '- `containerSystemId`: Existing container system ID (if not provided, creates new container)\n' +
      '- `ckvData`: CKV calibration data array (if not provided, creates zero CKV and defaults)\n' +
      '- `tagData`: Tag data array with TKVs (if not provided, creates default tag data)\n\n' +
      '**Auto-Creation Logic:**\n' +
      'When subgraphSystemId or containerSystemId are not provided, the system automatically creates them with default configurations.',
    requestDto: CreateSpfModuleRequestDto,
    requestDtoExample: {
      className: 'CreateSpfModuleRequestExample',
    },
    responses: [
      {
        status: HttpStatus.OK,
        description: 'SPF module created successfully',
        dto: SpfModuleResponseDto,
        example: {
          className: 'SpfModuleDTOExample',
        },
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input parameters',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description:
          'Project not found, or module definition or processor not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to create SPF module',
      },
    ],
  })
  async addSpfModule(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() request: CreateSpfModuleRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<SpfModuleResponseDto>> {
    const cmd = new CreateModuleCommand(
      Number(request.moduleDefinitionSystemId),
      Number(request.processorSystemId),
      request.parentSystemId != null ? Number(request.parentSystemId) : null,
      request.subgraphSystemId != null
        ? Number(request.subgraphSystemId)
        : null,
      request.containerSystemId != null
        ? Number(request.containerSystemId)
        : null,
    );

    const {moduleSystemId} = await this.commandBus.execute<{
      groupId: string;
      moduleSystemId: number;
    }>(cmd, session);

    const query = new SpfModuleQuery(
      [moduleSystemId],
      projectId,
      false,
      false,
      'api-client',
    );
    const readResult =
      await this.queryBus.execute<Result<SpfModuleDto[]>>(query);
    return toApiResult(readResult, data => this.addLinks(data[0]));
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
        dto: CkvCalDataResponseDto,
      },
      {
        status: HttpStatus.FORBIDDEN,
        description: 'Module license required to access calibration data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project, SPF module, or CKV system ID not found',
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
  ): Promise<ApiResult<CkvCalDataResponseDto>> {
    const clientId = 'client-id'; // TODO: extract real clientId from JWT once auth wiring is done
    const query = new GetCkvCalibrationDataQuery(
      projectId,
      spfModuleSystemId,
      ckvSystemId,
      clientId,
      paramSystemIds,
    );
    const result =
      await this.queryBus.execute<Result<CkvCalDataResponseDto>>(query);
    return toApiResult(result);
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
    requestDto: UpdateSpfModuleCalDataRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Calibration data updated successfully',
        dto: CkvCalDataResponseDto,
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
        description: 'Project, SPF module, or CKV system ID not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update calibration data',
      },
    ],
  })
  @UseGuards(SessionGuard)
  async updateCalibrationData(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Param('ckvSystemId') ckvSystemId: string,
    @Body() updateRequest: UpdateSpfModuleCalDataRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<CkvCalDataResponseDto>> {
    const command = new PutCkvCalDataCommand(
      spfModuleSystemId,
      ckvSystemId,
      updateRequest.parameters as unknown as ParameterDto[],
      updateRequest.uiPersistence,
    );

    const putResult = await this.commandBus.execute<
      Result<PutCkvCalDataResult>
    >(command, session);
    if (putResult.kind === RESULT_KIND.Fail) {
      return toApiResult(putResult as unknown as Result<CkvCalDataResponseDto>);
    }

    let data: CkvCalDataResponseDto | undefined;
    if (putResult.data.succeededParamSystemIds.length > 0) {
      const clientId = 'client-id'; // TODO: extract real clientId from JWT once auth wiring is done
      const query = new GetCkvCalibrationDataQuery(
        projectId,
        spfModuleSystemId,
        ckvSystemId,
        clientId,
        putResult.data.succeededParamSystemIds.join(','),
      );
      const readResult =
        await this.queryBus.execute<Result<CkvCalDataResponseDto>>(query);
      data = readResult.kind !== RESULT_KIND.Fail ? readResult.data : undefined;
    }

    const issues = putResult.issues ?? [];
    const resultEnvelope =
      issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    return toApiResult(resultEnvelope);
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
        dto: TkvCalDataResponseDto,
      },
      {
        status: HttpStatus.FORBIDDEN,
        description: 'Module license required to access tag data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description:
          'Project, SPF module, tag system ID, or TKV system ID not found',
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
  ): Promise<ApiResult<TkvCalDataResponseDto>> {
    const clientId = 'client-id'; // TODO: extract real clientId from JWT once auth wiring is done
    const query = new GetTkvCalibrationDataQuery(
      projectId,
      spfModuleSystemId,
      tagSystemId,
      tkvSystemId,
      clientId,
      paramSystemIds,
    );
    const result =
      await this.queryBus.execute<Result<TkvCalDataResponseDto>>(query);
    return toApiResult(result);
  }

  /**
   * Update tag data for an SPF module.
   */
  @UseGuards(SessionGuard)
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
    requestDto: UpdateTkvRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Tag data updated successfully',
        dto: TkvCalDataResponseDto,
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
          'Project, SPF module, tag system ID, or TKV system ID not found',
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
    @Body() updateRequest: UpdateTkvRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<TkvCalDataResponseDto>> {
    const command = new UpdateTkvCalDataCommand(
      spfModuleSystemId,
      tagSystemId,
      tkvSystemId,
      updateRequest.parameters,
      updateRequest.uiPersistence,
    );
    const putResult = await this.commandBus.execute<
      Result<UpdateTkvCalDataResult>
    >(command, session);
    if (putResult.kind === RESULT_KIND.Fail)
      throw new InternalServerErrorException(
        'UpdateTkvCalDataHandler returned unexpected Fail result',
      );

    let data: TkvCalDataResponseDto | undefined;
    if (putResult.data.succeededParamSystemIds.length > 0) {
      const clientId = 'client-id';
      const query = new GetTkvCalibrationDataQuery(
        projectId,
        spfModuleSystemId,
        tagSystemId,
        tkvSystemId,
        clientId,
        putResult.data.succeededParamSystemIds.join(','),
      );
      const readResult =
        await this.queryBus.execute<Result<TkvCalDataResponseDto>>(query);
      data = readResult.kind !== RESULT_KIND.Fail ? readResult.data : undefined;
    }

    const issues = putResult.issues ?? [];
    const resultEnvelope =
      issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    return toApiResult(resultEnvelope);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private addLinks(m: SpfModuleDto) {
    return {
      ...m,
      relatedEndPointLinks: [
        {
          hypertextRef: `/components/${m.systemId}/properties`,
          method: 'GET',
          description: 'Get properties for this module instance.',
        },
      ],
      dataPorts: m.dataPorts.map(p => ({...p, relatedEndPointLinks: []})),
      controlPorts: m.controlPorts.map(p => ({...p, relatedEndPointLinks: []})),
    };
  }

  /**
   * Partially update SPF module properties.
   */
  @Patch('/:spfModuleSystemId')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Partially update SPF module properties',
    description:
      'Partially updates an SPF module. Only provided fields are updated; absent fields remain unchanged.\n\n' +
      '**Patchable Fields:**\n' +
      '- `alias`: Module alias (max 255 characters)\n' +
      '- `containerSystemId`: System ID of the container to move the module to. If not found, a new container is created with defaults copied from the current container\n' +
      '- `maxInputPortsSupported`: Maximum input ports (validated against module definition)\n' +
      '- `maxOutputPortsSupported`: Maximum output ports (validated against module definition)\n' +
      '- `maxControlPortsSupported`: Maximum control ports (validated against module definition)\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PATCH /arc-api/v1/projects/proj123/spf-modules/12345\n' +
      '{ "alias": "my-module" }\n' +
      '```',
    requestDto: PatchSpfModuleRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'SPF module updated successfully',
        dto: SpfModuleResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'No fields provided',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description:
          'Business rule violation (e.g., max ports exceeds definition limit, container type incompatible)',
      },
    ],
  })
  @UseGuards(SessionGuard)
  async patchSpfModule(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('spfModuleSystemId', ParseIntPipe) spfModuleSystemId: number,
    @Body() dto: PatchSpfModuleRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<SpfModuleResponseDto>> {
    const cmd = new PatchSpfModuleCommand(
      spfModuleSystemId,
      dto.alias,
      dto.containerSystemId != null ? Number(dto.containerSystemId) : undefined,
      dto.maxInputPortsSupported,
      dto.maxOutputPortsSupported,
      dto.maxControlPortsSupported,
    );

    await this.commandBus.execute<{groupId: string}>(cmd, session);

    const query = new SpfModuleQuery(
      [spfModuleSystemId],
      projectId,
      false,
      false,
      'api-client',
    );
    const readResult =
      await this.queryBus.execute<Result<SpfModuleDto[]>>(query);
    return toApiResult(readResult, data => this.addLinks(data[0]));
  }

  /**
   * Add one or more CKVs to an SPF module.
   * Creates calibration bins with default parameter payloads for all parameters supporting CALIBRATION.
   * Returns the created CKVs and any CKVs implicitly removed as a side effect (e.g. zero placeholder).
   */
  @Post('/:spfModuleSystemId/ckvs')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Add CKVs to an SPF module',
    requestDto: CreateCkvsRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'CKVs added successfully',
        dto: AddCkvsResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to add CKVs',
      },
    ],
  })
  async addCkvs(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: CreateCkvsRequestDto,
  ): Promise<ApiResult<AddCkvsResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Adding CKVs to SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with request:',
      request,
    );
    throw new NotImplementedException(
      'Add CKVs functionality is not implemented yet.',
    );
  }

  /**
   * Remove one or more CKVs from an SPF module.
   * Returns the removed CKVs for undo/redo support.
   */
  @Delete('/:spfModuleSystemId/ckvs')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Remove CKVs from an SPF module',
    requestDto: DeleteCkvsRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'CKVs removed successfully',
        dto: [CkvResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to remove CKVs',
      },
    ],
  })
  async removeCkvs(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: DeleteCkvsRequestDto,
  ): Promise<ApiResult<CkvResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Removing CKVs from SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with request:',
      request,
    );
    throw new NotImplementedException(
      'Remove CKVs functionality is not implemented yet.',
    );
  }

  /**
   * Add (associate) one or more tags to an SPF module.
   * Creates module_tag_id_map entries linking the module to existing tag definitions.
   */
  @Post('/:spfModuleSystemId/tags')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Add tags to an SPF module',
    requestDto: CreateTagsRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Tags added successfully',
        dto: [TagInfoResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to add tags',
      },
    ],
  })
  async addTags(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: CreateTagsRequestDto,
  ): Promise<ApiResult<TagInfoResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Adding tags to SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with request:',
      request,
    );
    throw new NotImplementedException(
      'Add tags functionality is not implemented yet.',
    );
  }

  /**
   * Remove (disassociate) one or more tags from an SPF module.
   * Returns the removed tags for undo/redo support.
   */
  @Delete('/:spfModuleSystemId/tags')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Remove tags from an SPF module',
    requestDto: DeleteTagsRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Tags removed successfully',
        dto: [TagInfoResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to remove tags',
      },
    ],
  })
  async removeTags(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: DeleteTagsRequestDto,
  ): Promise<ApiResult<TagInfoResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Removing tags from SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with request:',
      request,
    );
    throw new NotImplementedException(
      'Remove tags functionality is not implemented yet.',
    );
  }

  /**
   * Add one or more TKVs to a specific tag.
   * Creates tag bins with parameter payloads.
   */
  @Post('/:spfModuleSystemId/tags/:tagSystemId/tkvs')
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
    description: 'Tag system ID (module_tag_id_map system ID)',
    example: '201',
  })
  @ApiDocumentationWithExample({
    summary: 'Add TKVs to a tag on an SPF module',
    requestDto: CreateTkvsRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'TKVs added successfully',
        dto: [TkvResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project, SPF module, or tag not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to add TKVs',
      },
    ],
  })
  async addTkvs(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Param('tagSystemId') tagSystemId: string,
    @Body() request: CreateTkvsRequestDto,
  ): Promise<ApiResult<TkvResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Adding TKVs to tag:',
      tagSystemId,
      'in SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with request:',
      request,
    );
    throw new NotImplementedException(
      'Add TKVs functionality is not implemented yet.',
    );
  }

  /**
   * Remove one or more TKVs from a tag.
   * Returns the removed TKVs for undo/redo support.
   */
  @Delete('/:spfModuleSystemId/tags/:tagSystemId/tkvs')
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
    description: 'Tag system ID (module_tag_id_map system ID)',
    example: '201',
  })
  @ApiDocumentationWithExample({
    summary: 'Remove TKVs from a tag on an SPF module',
    requestDto: DeleteTkvsRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'TKVs removed successfully',
        dto: [TkvResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project, SPF module, or tag not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to remove TKVs',
      },
    ],
  })
  async removeTkvs(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Param('tagSystemId') tagSystemId: string,
    @Body() request: DeleteTkvsRequestDto,
  ): Promise<ApiResult<TkvResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Removing TKVs from tag:',
      tagSystemId,
      'in SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with request:',
      request,
    );
    throw new NotImplementedException(
      'Remove TKVs functionality is not implemented yet.',
    );
  }

  /**
   * Get list of parameters that support CALIBRATION for this module.
   */
  @Get('/:spfModuleSystemId/ckv-parameters')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Get parameters that support calibration for an SPF module',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'CKV parameters retrieved successfully',
        dto: CkvParametersResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get CKV parameters',
      },
    ],
  })
  async getCkvParameters(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
  ): Promise<ApiResult<CkvParametersResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Getting CKV parameters for SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
    );
    throw new NotImplementedException(
      'Get CKV parameters functionality is not implemented yet.',
    );
  }

  /**
   * Add parameter(s) to ALL CKVs in the module.
   * Creates parameter payloads for all existing CKVs.
   */
  @Post('/:spfModuleSystemId/ckv-parameters')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Add parameters to all CKVs in an SPF module',
    requestDto: CreateCkvParametersRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'CKV parameters added successfully',
        dto: CkvParametersResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to add CKV parameters',
      },
    ],
  })
  async addCkvParameters(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: CreateCkvParametersRequestDto,
  ): Promise<ApiResult<CkvParametersResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Adding CKV parameters to SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with request:',
      request,
    );
    throw new NotImplementedException(
      'Add CKV parameters functionality is not implemented yet.',
    );
  }

  /**
   * Remove parameter(s) from ALL CKVs in the module.
   * Returns information about removed parameters and affected CKVs for undo/redo support.
   */
  @Delete('/:spfModuleSystemId/ckv-parameters')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Remove parameters from all CKVs in an SPF module',
    requestDto: DeleteCkvParametersRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'CKV parameters removed successfully',
        dto: CkvParameterRemovalResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to remove CKV parameters',
      },
    ],
  })
  async removeCkvParameters(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: DeleteCkvParametersRequestDto,
  ): Promise<ApiResult<CkvParameterRemovalResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Removing CKV parameters from SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with request:',
      request,
    );
    throw new NotImplementedException(
      'Remove CKV parameters functionality is not implemented yet.',
    );
  }

  /**
   * Get parameters per TKV (dictionary format).
   * Returns a mapping of TKV system IDs to their supported parameter lists.
   */
  @Get('/:spfModuleSystemId/tkv-parameters')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Get parameters per TKV for an SPF module',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'TKV parameters retrieved successfully',
        dto: TkvParametersResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get TKV parameters',
      },
    ],
  })
  async getTkvParameters(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
  ): Promise<ApiResult<TkvParametersResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Getting TKV parameters for SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
    );
    throw new NotImplementedException(
      'Get TKV parameters functionality is not implemented yet.',
    );
  }

  /**
   * Add parameter(s) to specific TKV(s).
   * Creates parameter payloads for the specified TKVs.
   */
  @Post('/:spfModuleSystemId/tkv-parameters')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Add parameters to specific TKVs in an SPF module',
    requestDto: CreateTkvParametersRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'TKV parameters added successfully',
        dto: TkvParametersResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to add TKV parameters',
      },
    ],
  })
  async addTkvParameters(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: CreateTkvParametersRequestDto,
  ): Promise<ApiResult<TkvParametersResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Adding TKV parameters to SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with request:',
      request,
    );
    throw new NotImplementedException(
      'Add TKV parameters functionality is not implemented yet.',
    );
  }

  /**
   * Remove parameter(s) from specific TKV(s).
   * Returns information about removed parameters per TKV for undo/redo support.
   */
  @Delete('/:spfModuleSystemId/tkv-parameters')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Remove parameters from specific TKVs in an SPF module',
    requestDto: RemoveTkvParametersRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'TKV parameters removed successfully',
        dto: TkvParameterRemovalResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to remove TKV parameters',
      },
    ],
  })
  async removeTkvParameters(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: RemoveTkvParametersRequestDto,
  ): Promise<ApiResult<TkvParameterRemovalResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Removing TKV parameters from SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
      'with request:',
      request,
    );
    throw new NotImplementedException(
      'Remove TKV parameters functionality is not implemented yet.',
    );
  }

  /**
   * Delete an SPF module.
   * Returns the deleted module system ID and any container or subgraph that was
   * cascade-deleted because this was the last module in its container.
   */
  @Delete('/:spfModuleSystemId')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Delete an SPF module',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'SPF module deleted successfully',
        dto: RemoveSpfModuleResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or SPF module not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to delete SPF module',
      },
    ],
  })
  async deleteSpfModule(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
  ): Promise<ApiResult<RemoveSpfModuleResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Deleting SPF module:',
      spfModuleSystemId,
      'in project:',
      projectId,
    );
    throw new NotImplementedException(
      'Delete SPF module functionality is not implemented yet.',
    );
  }
}
