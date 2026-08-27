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
  DeleteSpfModuleCommand,
  LINK_DELETION_MODE,
  isLinkDeletionMode,
  AddCkvsCommand,
  type AddCkvsResult,
  RemoveCkvsCommand,
  type RemoveCkvsResult,
  AddTagsCommand,
  type AddTagsResult,
  RemoveTagsCommand,
  type RemoveTagsResult,
  AddTkvsCommand,
  type AddTkvsResult,
  RemoveTkvsCommand,
  type RemoveTkvsResult,
  AddCkvParametersCommand,
  type AddCkvParametersResult,
  RemoveCkvParametersCommand,
  type RemoveCkvParametersResult,
  AddTkvParametersCommand,
  type AddTkvParametersResult,
  RemoveTkvParametersCommand,
  type RemoveTkvParametersResult,
} from '@arc/core';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {SessionGuard} from '../../../../guards/session-guard.js';
import {ArcSession} from '../../../../guards/arc-session.decorator.js';
import {AuthGuard} from '@nestjs/passport';
import {ClientId} from '../../../../decorators/client-id.decorator.js';
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
@UseGuards(AuthGuard('jwt'))
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
   * Get SPF modules with optional data inclusion.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiQuery({
    name: 'systemId',
    required: true,
    type: String,
    description: 'Comma-separated SPF module system IDs',
    example: '101,102',
  })
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
      'Get SPF modules for provided systemIds with optional data inclusion.\n\n' +
      '**Optional Query Parameters:**\n' +
      '- `include`: Comma-separated list of optional data to include\n' +
      '  - `ckvs`: Include Calibration Key-Values\n' +
      '  - `tags`: Include Tags with Tag Key-Values\n' +
      '  - `properties`: Include module properties\n\n' +
      '**Examples:**\n' +
      '```\n' +
      'GET /spf-modules?systemId=101,102\n' +
      'GET /spf-modules?systemId=101,102&include=ckvs\n' +
      'GET /spf-modules?systemId=101,102&include=ckvs,tags\n' +
      'GET /spf-modules?systemId=101,102&include=ckvs,tags,properties\n' +
      '```',
    requestDtoDescription:
      'System IDs are supplied through the systemId query parameter',
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
    @Query('systemId') systemId: string,
    @ClientId() clientId: string,
    @Query('include') include?: string,
  ): Promise<ApiResult<SpfModuleResponseDto[]>> {
    if (!systemId?.trim()) {
      throw new BadRequestException(
        'systemId query parameter is required and cannot be empty',
      );
    }

    const includeOptions = new Set(
      include?.split(',').map(s => s.trim().toLowerCase()) ?? [],
    );

    // Parse string IDs to integers — radix 10 guards against octal misparse on '0'-prefixed strings
    const systemIds = systemId
      .split(',')
      .map(id => id.trim())
      .filter(Boolean)
      .map(id => {
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
      clientId,
    );

    const result = await this.queryBus.execute<Result<SpfModuleDto[]>>(query);

    return toApiResult(result, data => data.map(m => this.addLinks(m)));
  }

  /**
   * Create a new SPF module for a given module id and processor id.
   */
  @Post()
  @UseGuards(SessionGuard)
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
    @ClientId() clientId: string,
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
      clientId,
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
    @ClientId() clientId: string,
    @Query('param-system-ids') paramSystemIds?: string,
  ): Promise<ApiResult<CkvCalDataResponseDto>> {
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
    @ClientId() clientId: string,
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
    @ClientId() clientId: string,
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
      clientId,
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
  @HttpCode(HttpStatus.OK)
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
        status: HttpStatus.MULTI_STATUS,
        description: 'Partial success - some CKVs were not added',
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
  @UseGuards(SessionGuard)
  async addCkvs(
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: CreateCkvsRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<AddCkvsResponseDto>> {
    const command = new AddCkvsCommand(spfModuleSystemId, request.ckvs);
    const result = await this.commandBus.execute<Result<AddCkvsResult>>(
      command,
      session,
    );
    return toApiResult(result, data => ({
      addedCkvs: data.addedCkvs,
      removedCkvSystemIds: data.removedCkvSystemIds.map(String),
    }));
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
        status: HttpStatus.MULTI_STATUS,
        description: 'Partial success - some CKVs were not removed',
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
  @UseGuards(SessionGuard)
  async removeCkvs(
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: DeleteCkvsRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<CkvResponseDto[]>> {
    const command = new RemoveCkvsCommand(
      spfModuleSystemId,
      request.ckvSystemIds,
    );
    const result = await this.commandBus.execute<Result<RemoveCkvsResult>>(
      command,
      session,
    );
    return toApiResult(result, data => data.removedCkvs);
  }

  /**
   * Add (associate) one or more tags to an SPF module.
   * Creates module_tag_id_map entries linking the module to existing tag definitions.
   */
  @Post('/:spfModuleSystemId/tags')
  @HttpCode(HttpStatus.OK)
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
        status: HttpStatus.MULTI_STATUS,
        description: 'Partial success - some tags were not added',
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
  @UseGuards(SessionGuard)
  async addTags(
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: CreateTagsRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<TagInfoResponseDto[]>> {
    const command = new AddTagsCommand(
      spfModuleSystemId,
      request.tagDefinitionSystemIds,
    );
    const result = await this.commandBus.execute<Result<AddTagsResult>>(
      command,
      session,
    );
    return toApiResult(result, data =>
      data.addedTags.map(tag => ({
        systemId: String(tag.systemId),
        naturalId: tag.naturalId,
        tagName: tag.tagName,
        tkvs: [],
      })),
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
        status: HttpStatus.MULTI_STATUS,
        description: 'Partial success - some tags were not removed',
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
  @UseGuards(SessionGuard)
  async removeTags(
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: DeleteTagsRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<TagInfoResponseDto[]>> {
    const command = new RemoveTagsCommand(
      spfModuleSystemId,
      request.tagSystemIds,
    );
    const result = await this.commandBus.execute<Result<RemoveTagsResult>>(
      command,
      session,
    );
    return toApiResult(result, data =>
      data.removedTags.map(tag => ({
        systemId: String(tag.systemId),
        naturalId: tag.naturalId,
        tagName: tag.tagName,
        tkvs: tag.tkvs,
      })),
    );
  }

  /**
   * Add one or more TKVs to a specific tag.
   * Creates tag bins with parameter payloads.
   */
  @Post('/:spfModuleSystemId/tags/:tagSystemId/tkvs')
  @HttpCode(HttpStatus.OK)
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
        status: HttpStatus.MULTI_STATUS,
        description: 'Partial success - some TKVs were not added',
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
  @UseGuards(SessionGuard)
  async addTkvs(
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Param('tagSystemId') tagSystemId: string,
    @Body() request: CreateTkvsRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<TkvResponseDto[]>> {
    const command = new AddTkvsCommand(
      spfModuleSystemId,
      tagSystemId,
      request.tkvs,
    );
    const result = await this.commandBus.execute<Result<AddTkvsResult>>(
      command,
      session,
    );
    return toApiResult(result, data => data.addedTkvs);
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
        status: HttpStatus.MULTI_STATUS,
        description: 'Partial success - some TKVs were not removed',
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
  @UseGuards(SessionGuard)
  async removeTkvs(
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Param('tagSystemId') tagSystemId: string,
    @Body() request: DeleteTkvsRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<TkvResponseDto[]>> {
    const command = new RemoveTkvsCommand(
      spfModuleSystemId,
      tagSystemId,
      request.tkvSystemIds,
    );
    const result = await this.commandBus.execute<Result<RemoveTkvsResult>>(
      command,
      session,
    );
    return toApiResult(result, data => data.removedTkvs);
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
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') _spfModuleSystemId: string,
  ): Promise<ApiResult<CkvParametersResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException(
      'Get CKV parameters is not implemented yet.',
    );
  }

  /**
   * Add parameter(s) to ALL CKVs in the module.
   * Creates parameter payloads for all existing CKVs.
   */
  @Post('/:spfModuleSystemId/ckv-parameters')
  @HttpCode(HttpStatus.OK)
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
        status: HttpStatus.MULTI_STATUS,
        description: 'Partial success - some CKV parameters were not added',
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
  @UseGuards(SessionGuard)
  async addCkvParameters(
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: CreateCkvParametersRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<CkvParametersResponseDto>> {
    const command = new AddCkvParametersCommand(
      spfModuleSystemId,
      request.parameterSystemIds,
    );
    const result = await this.commandBus.execute<
      Result<AddCkvParametersResult>
    >(command, session);
    return toApiResult(result, data => ({parameters: data.parameters}));
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
  @UseGuards(SessionGuard)
  async removeCkvParameters(
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: DeleteCkvParametersRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<CkvParameterRemovalResponseDto>> {
    const command = new RemoveCkvParametersCommand(
      spfModuleSystemId,
      request.parameterSystemIds,
    );
    const result = await this.commandBus.execute<
      Result<RemoveCkvParametersResult>
    >(command, session);
    return toApiResult(result, data => ({
      removedParameterSystemIds: data.removedParameterSystemIds.map(String),
      removedCkvSystemIds: data.removedCkvSystemIds.map(String),
      affectedCkvSystemIds: data.affectedCkvSystemIds.map(String),
    }));
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
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') _spfModuleSystemId: string,
  ): Promise<ApiResult<TkvParametersResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException(
      'Get TKV parameters is not implemented yet.',
    );
  }

  /**
   * Add parameter(s) to specific TKV(s).
   * Creates parameter payloads for the specified TKVs.
   */
  @Post('/:spfModuleSystemId/tkv-parameters')
  @HttpCode(HttpStatus.OK)
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
        status: HttpStatus.MULTI_STATUS,
        description: 'Partial success - some TKV parameters were not added',
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
  @UseGuards(SessionGuard)
  async addTkvParameters(
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: CreateTkvParametersRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<TkvParametersResponseDto>> {
    const command = new AddTkvParametersCommand(
      spfModuleSystemId,
      request.updates,
    );
    const result = await this.commandBus.execute<
      Result<AddTkvParametersResult>
    >(command, session);
    return toApiResult(result, data => ({
      tkvParameters: data.tkvParameters.map(item => ({
        tkvSystemId: String(item.tkvSystemId),
        parameters: item.parameters,
      })),
    }));
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
        status: HttpStatus.MULTI_STATUS,
        description: 'Partial success - some TKV parameters were not removed',
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
  @UseGuards(SessionGuard)
  async removeTkvParameters(
    @Param('projectId') _projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Body() request: RemoveTkvParametersRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<TkvParameterRemovalResponseDto>> {
    const command = new RemoveTkvParametersCommand(
      spfModuleSystemId,
      request.updates,
    );
    const result = await this.commandBus.execute<
      Result<RemoveTkvParametersResult>
    >(command, session);
    return toApiResult(result, data => ({
      updates: data.updates.map(update => ({
        tkvSystemId: String(update.tkvSystemId),
        removedParameterSystemIds: update.removedParameterSystemIds.map(String),
      })),
    }));
  }

  /**
   * Delete an SPF module.
   * Returns the deleted module system ID and any container or subgraph that was
   * cascade-deleted because this was the last module in its container.
   */
  @UseGuards(SessionGuard)
  @Delete('/:spfModuleSystemId')
  @ApiParam({
    name: 'spfModuleSystemId',
    required: true,
    type: String,
    description: 'System id of an SPF module',
    example: '12345',
  })
  @ApiQuery({
    name: 'linkDeletionMode',
    required: false,
    enum: [LINK_DELETION_MODE.Full, LINK_DELETION_MODE.SegmentOnly],
    description:
      'Delete every route segment (full, default) or only segments incident to the module (segmentOnly).',
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
    @Param('projectId', ParseIntPipe) _projectId: number,
    @Param('spfModuleSystemId', ParseIntPipe) spfModuleSystemId: number,
    @ArcSession() session: ActiveSession,
    @Query('linkDeletionMode') linkDeletionMode?: string,
  ): Promise<ApiResult<RemoveSpfModuleResponseDto>> {
    if (
      linkDeletionMode !== undefined &&
      !isLinkDeletionMode(linkDeletionMode)
    ) {
      throw new BadRequestException(
        'linkDeletionMode must be either "full" or "segmentOnly".',
      );
    }
    const commandResult = await this.commandBus.execute<{
      groupId: string;
      response: RemoveSpfModuleResponseDto;
    }>(
      new DeleteSpfModuleCommand(
        spfModuleSystemId,
        linkDeletionMode ?? LINK_DELETION_MODE.Full,
      ),
      session,
    );
    return {data: commandResult.response};
  }
}
