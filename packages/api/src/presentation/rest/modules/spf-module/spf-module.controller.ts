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
  HttpCode,
  HttpStatus,
  UseInterceptors,
  BadRequestException,
  NotImplementedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {ApiTags, ApiExtraModels, ApiParam, ApiQuery} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {SpfModuleDto} from './dto/shared/spf-module.dto.js';
import {CalDataDto} from '../../common/dto/tuning-data/cal-data.dto.js';
import {UpdateSpfModuleCalDataRequest} from './dto/request/update-spf-module-cal-data-request.dto.js';
import {UpdateSpfModuleTagDataRequest} from './dto/request/update-spf-module-tag-data-request.dto.js';
import {TagDataDto} from '../../common/dto/tuning-data/tag-data.dto.js';
import {ParameterDetailDto} from '../../common/dto/parameter.dto.js';
import {ConfigElementDto} from '../../common/dto/element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from '../../common/dto/element-data/elements/element-template-array.dto.js';
import {StructDto} from '../../common/dto/element-data/elements/struct.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {
  CreateSpfModuleRequest,
  CloneSpfModuleRequest,
} from './dto/request/spf-module-request.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {ApiErrorItem} from '../../common/dto/api-response/api-error-item.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {
  QueryBus,
  SpfModulesQuery as SpfModuleQuery,
  GetCkvCalibrationDataQuery,
  PARAMETER_ELEMENT_TYPE,
  type DisplayType,
  type SpfModuleDetailedReadModel,
  type SpfModuleReadModel,
  type DataPortReadModel,
  type ControlPortReadModel,
  type Result,
  type CkvReadModel,
  type TkvReadModel,
  type TagReadModel,
  type CkvCalibrationReadModel,
  type ParameterCalibrationReadModel,
  type ParsedElementData,
  type ElementSchema,
  type StructArraySchema,
  type ConfigElementData,
  type ElementArrayData,
  type StructArrayData,
  type StructData,
} from '@arc/core';
import {
  DataPortDto,
  PortIoType,
  PortType,
} from '../../common/dto/data-port.dto.js';
import {
  ControlPortDto,
  ControlPortIntentDto,
} from '../../common/dto/control-port.dto.js';
import {NameValuePairDto} from '../../common/dto/element-data/elements/config-element/name-value-pair.dto.js';
import {DISPLAY_TYPE} from '../../common/dto/element-data/elements/config-element/types/display-type.js';
import {KeyValueDto, KeyDto, ValueDto} from '../../common/dto/key-value.dto.js';
import {CkvDto, TkvDto, TagInfoDto} from './dto/shared/tuning-config.dto.js';
import {KeyValueInfo, KeyInfo, ValueInfo} from '../../common/dto/kv.dto.js';

type ElementDtoUnion = ConfigElementDto | ElementTemplateArrayDto | StructDto;

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
  SpfModuleDto,
  CalDataDto,
  UpdateSpfModuleCalDataRequest,
  TagDataDto,
  UpdateSpfModuleTagDataRequest,
  ParameterDetailDto,
  ConfigElementDto,
  ElementTemplateArrayDto,
  StructDto,
  CreateSpfModuleRequest,
  CloneSpfModuleRequest,
)
export class SpfModuleController extends BaseController {
  constructor(private readonly queryBus: QueryBus) {
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
        dto: [SpfModuleDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some SPF modules could not be retrieved (see errors array)',
        dto: [SpfModuleDto],
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
  ): Promise<ApiResult<SpfModuleDto[]>> {
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

    const result =
      await this.queryBus.execute<Result<SpfModuleDetailedReadModel>>(query);

    if (result.isFailure) {
      throw new UnprocessableEntityException(
        result.errors?.[0]?.message ?? 'Failed to retrieve SPF modules',
      );
    }

    const {modules, ckvsByModule, tagsByModule} = result.data;
    const dtos = modules.map(m =>
      this.mapToSpfModuleDto(
        m,
        ckvsByModule?.get(m.systemId),
        tagsByModule?.get(m.systemId),
      ),
    );

    return {
      data: dtos,
      success: true,
      message: 'SPF modules retrieved successfully',
    };
  }

  /**
   * Create a new SPF module for a given module id and processor id.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create a new SPF module',
    description:
      'Creates a new SPF module with the specified module system ID and processor ID.\n\n' +
      '**Required Parameters:**\n' +
      '- `moduleSystemId`: Module definition system ID\n' +
      '- `procId`: Processor ID\n\n' +
      '**Optional Parameters:**\n' +
      '- `parentId`: Parent module ID\n' +
      '- `subgraphId`: Existing subgraph ID (if not provided, creates new subgraph)\n' +
      '- `containerId`: Existing container ID (if not provided, creates new container)\n' +
      '- `ckvData`: CKV calibration data array (if not provided, creates zero CKV and defaults)\n' +
      '- `tagData`: Tag data array with TKVs (if not provided, creates default tag data)\n\n' +
      '**Auto-Creation Logic:**\n' +
      'When subgraphId or containerId are not provided, the system automatically creates them with default configurations.',
    requestDto: CreateSpfModuleRequest,
    requestDtoExample: {
      className: 'CreateSpfModuleRequestExample',
    },
    responses: [
      {
        status: HttpStatus.OK,
        description: 'SPF module created successfully',
        dto: SpfModuleDto,
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
    @Param('projectId') projectId: string,
    @Body() request: CreateSpfModuleRequest,
  ): Promise<ApiResult<SpfModuleDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'addSpfModule request received for projectId:',
      projectId,
      'with request:',
      request,
    ); // Placeholder usage to satisfy linter
    throw new NotImplementedException('addSpfModule is not implemented yet');
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
        dto: CalDataDto,
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
  ): Promise<ApiResult<CalDataDto>> {
    const clientId = 'client-id'; // TODO: extract real clientId from JWT once auth wiring is done
    const query = new GetCkvCalibrationDataQuery(
      projectId,
      spfModuleSystemId,
      ckvSystemId,
      clientId,
      paramSystemIds,
    );
    const model = await this.queryBus.execute<CkvCalibrationReadModel>(query);

    const errors: ApiErrorItem[] = (model.missingParamSystemIds ?? []).map(
      id => ({
        id: String(id),
        code: 'PARAM_PAYLOAD_NOT_FOUND',
        message: `No calibration payload found for parameter system ID ${id}`,
      }),
    );

    return {
      data: this.transformToCalDataDto(model),
      success: true,
      message: 'Calibration data retrieved successfully',
      ...(errors.length > 0 && {errors}),
    };
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
    requestDto: UpdateSpfModuleCalDataRequest,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Calibration data updated successfully',
        dto: CalDataDto,
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
  async updateCalibrationData(
    @Param('projectId') projectId: string,
    @Param('spfModuleSystemId') spfModuleSystemId: string,
    @Param('ckvSystemId') ckvSystemId: string,
    @Body() updateRequest: UpdateSpfModuleCalDataRequest,
  ): Promise<ApiResult<CalDataDto>> {
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
    throw new NotImplementedException(
      'updateCalibrationData is not implemented yet',
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
    throw new NotImplementedException('getTagData is not implemented yet');
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
    requestDto: UpdateSpfModuleTagDataRequest,
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
    @Body() updateRequest: UpdateSpfModuleTagDataRequest,
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
    throw new NotImplementedException('updateTagData is not implemented yet');
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Maps SpfModuleReadModel → SpfModuleDto.
   * SpfModuleReadModel uses number systemIds and typed PortIoType/PortType enums.
   * SpfModuleDto uses string systemIds and the API-layer enum values.
   *
   * ckvsResult/tagsResult are per-module Results — undefined when not requested,
   * Result.fail(...) when that module's load errored (dto field left unset),
   * Result.ok([]) when the module genuinely has none.
   */
  private mapToSpfModuleDto(
    m: SpfModuleReadModel,
    ckvsResult?: Result<CkvReadModel[]>,
    tagsResult?: Result<TagReadModel[]>,
  ): SpfModuleDto {
    const dto = new SpfModuleDto(
      String(m.systemId),
      m.instanceId,
      m.moduleId,
      m.name,
      m.parentId,
    );
    dto.alias = m.alias;
    dto.subgraphId = m.subgraphId;
    dto.containerId = m.containerId;
    dto.maxInputPortsSupported = m.maxInputPortsSupported;
    dto.maxOutputPortsSupported = m.maxOutputPortsSupported;
    dto.maxControlPortsSupported = m.maxControlPortsSupported;
    dto.dataPorts = m.dataPorts.map(p => this.mapDataPortToDto(p));
    dto.controlPorts = m.controlPorts.map(p => this.mapControlPortToDto(p));
    dto.changeInfo = undefined;

    if (ckvsResult?.isSuccess)
      dto.ckvs = ckvsResult.data.map(c => this.mapCkvToDto(c));
    if (tagsResult?.isSuccess)
      dto.tags = tagsResult.data.map(t => this.mapTagToDto(t));

    return dto;
  }

  private mapCkvToDto(c: CkvReadModel): CkvDto {
    const keyValueCollection = (c.keyValuePairs ?? [])
      .filter(kv => kv?.key && kv?.value)
      .map(
        kv =>
          new KeyValueInfo(
            new KeyInfo(kv.key.keyId, kv.key.name, String(kv.key.systemId)),
            new ValueInfo(
              kv.value.valueId,
              kv.value.name,
              String(kv.value.systemId),
            ),
          ),
      );
    return new CkvDto(String(c.systemId), keyValueCollection, []);
  }

  private mapTkvToDto(t: TkvReadModel): TkvDto {
    const keyValueCollection = (t.keyValuePairs ?? [])
      .filter(kv => kv?.key && kv?.value)
      .map(
        kv =>
          new KeyValueInfo(
            new KeyInfo(kv.key.keyId, kv.key.name, String(kv.key.systemId)),
            new ValueInfo(
              kv.value.valueId,
              kv.value.name,
              String(kv.value.systemId),
            ),
          ),
      );
    return new TkvDto(String(t.systemId), keyValueCollection, []);
  }

  private mapTagToDto(t: TagReadModel): TagInfoDto {
    return new TagInfoDto(
      t.systemId,
      t.tagId,
      t.tagName,
      t.tkvs.map(tkv => this.mapTkvToDto(tkv)),
    );
  }

  /**
   * Maps DataPortReadModel → DataPortDto.
   * portIoType: domain PortIoType string → API PortIoType enum.
   * isStatic: boolean → API PortType enum (Static | Dynamic).
   */
  private mapDataPortToDto(p: DataPortReadModel): DataPortDto {
    const dto = new DataPortDto(
      String(p.systemId),
      p.portId,
      p.name,
      p.portIoType === 'Input' ? PortIoType.Input : PortIoType.Output,
      p.isStatic ? PortType.Static : PortType.Dynamic,
    );
    dto.totalLinksAtPort = p.totalLinksAtPort;
    return dto;
  }

  /**
   * Maps ControlPortReadModel → ControlPortDto.
   * Includes allocated intents — each intent has an intentId and a generated name.
   */
  private mapControlPortToDto(p: ControlPortReadModel): ControlPortDto {
    return new ControlPortDto(
      String(p.systemId),
      p.portId,
      p.name,
      p.isStatic ? PortType.Static : PortType.Dynamic,
      p.allocatedIntents.map(i => new ControlPortIntentDto(i.intentId, i.name)),
    );
  }

  private transformToCalDataDto(model: CkvCalibrationReadModel): CalDataDto {
    const dto = new CalDataDto();
    dto.systemId = model.ckv.systemId.toString();
    dto.changeInfo = undefined;
    dto.Ckv = model.ckv.keyValuePairs.map(kv => {
      const kvDto = new KeyValueDto();
      const keyDto = new KeyDto();
      keyDto.keyId = kv.key.keyId;
      keyDto.name = kv.key.name;
      keyDto.systemId = kv.key.systemId.toString();
      const valueDto = new ValueDto();
      valueDto.valueId = kv.value.valueId;
      valueDto.name = kv.value.name;
      valueDto.systemId = kv.value.systemId.toString();
      kvDto.key = keyDto;
      kvDto.value = valueDto;
      return kvDto;
    });
    dto.parameters = model.parameters.map(p => this.transformParameterDto(p));
    return dto;
  }

  private transformParameterDto(
    p: ParameterCalibrationReadModel,
  ): ParameterDetailDto {
    const dto = new ParameterDetailDto();
    dto.systemId = p.systemId.toString();
    dto.changeInfo = undefined;
    dto.parameterId = p.parameterId.toString();
    dto.name = p.name;
    dto.description = p.description;
    dto.isHidden = p.isHidden;
    dto.isReadOnly = p.isReadOnly;
    dto.pidType = p.pidType;
    dto.elements = p.parsedData ? this.transformElements(p.parsedData) : [];
    return dto;
  }

  private transformElements(elements: ParsedElementData[]): ElementDtoUnion[] {
    return elements.map(e => this.transformElement(e));
  }

  private transformElement(element: ParsedElementData): ElementDtoUnion {
    if (element.type === PARAMETER_ELEMENT_TYPE.ConfigElement) {
      return this.transformConfigElement(element);
    }
    if (element.type === PARAMETER_ELEMENT_TYPE.ElementArray) {
      return this.transformElementArray(element);
    }
    if (element.type === PARAMETER_ELEMENT_TYPE.StructArray) {
      return this.transformStructArray(element);
    }
    return this.transformStruct(element);
  }

  private mapDisplayType(
    raw: DisplayType | undefined,
  ): ConfigElementDto['displayType'] | undefined {
    if (!raw) return undefined;
    const map: Record<DisplayType, ConfigElementDto['displayType']> = {
      TEXTBOX: DISPLAY_TYPE.TextBox,
      DB_TEXTBOX: DISPLAY_TYPE.DbTextBox,
      QFORMATTED_VALUE: DISPLAY_TYPE.QFormattedValue,
      SLIDER: DISPLAY_TYPE.Slider,
      CHECKBOX: DISPLAY_TYPE.CheckBox,
      DROPDOWN: DISPLAY_TYPE.DropDown,
      DUMP: DISPLAY_TYPE.Dump,
      FILE: DISPLAY_TYPE.File,
      BITFIELD: DISPLAY_TYPE.BitField,
      FORMULA: DISPLAY_TYPE.Formula,
      STRINGFIELD: DISPLAY_TYPE.StringField,
    };
    return map[raw];
  }

  private transformConfigElement(e: ConfigElementData): ConfigElementDto {
    const dto = new ConfigElementDto();
    dto.name = e.name;
    dto.value = e.value;
    dto.dataType = e.dataType as ConfigElementDto['dataType'];
    dto.description = e.description;
    dto.group = e.group;
    dto.subgroup = e.subgroup;
    dto.isReadOnly = e.isReadOnly;
    dto.unit = e.unit;
    dto.displayType = this.mapDisplayType(e.displayType);
    dto.policy = e.policy as ConfigElementDto['policy'];
    dto.qFormat = e.qFormat;
    dto.precision = e.precision;
    dto.min = e.min === undefined ? undefined : Number.parseFloat(e.min);
    dto.max = e.max === undefined ? undefined : Number.parseFloat(e.max);
    dto.allowedValues = e.rangeList?.map(r => {
      const nv = new NameValuePairDto();
      nv.name = r.name;
      nv.value = r.value;
      return nv;
    });
    return dto;
  }

  private transformElementArray(e: ElementArrayData): ElementTemplateArrayDto {
    const dto = new ElementTemplateArrayDto();
    dto.name = e.name;
    dto.isReadOnly = e.isReadOnly;
    dto.description = e.description;
    dto.group = e.group;
    dto.subgroup = e.subgroup;
    dto.length = e.length;
    dto.lengthFormula = e.arrayLenFormulaStr;
    dto.template = [this.transformSchema(e.template)];
    dto.value = this.transformElements(e.value);
    return dto;
  }

  private transformStructArray(e: StructArrayData): ElementTemplateArrayDto {
    return this.transformElementArray(e as unknown as ElementArrayData);
  }

  private transformStruct(e: StructData): StructDto {
    const dto = new StructDto();
    dto.name = e.name;
    dto.isReadOnly = e.isReadOnly;
    dto.description = e.description;
    dto.group = e.group;
    dto.subgroup = e.subgroup;
    dto.structType = e.structureType;
    dto.value = this.transformElements(e.value);
    return dto;
  }

  private transformSchema(schema: ElementSchema): ElementDtoUnion {
    if (schema.type === PARAMETER_ELEMENT_TYPE.ConfigElement) {
      const dto = new ConfigElementDto();
      dto.name = schema.name;
      dto.value = schema.defaultValue ?? '';
      dto.dataType = schema.dataType as ConfigElementDto['dataType'];
      dto.description = schema.description;
      dto.group = schema.group;
      dto.subgroup = schema.subgroup;
      dto.isReadOnly = schema.isReadOnly;
      dto.unit = schema.unit;
      dto.displayType = this.mapDisplayType(schema.displayType);
      dto.policy = schema.policy as ConfigElementDto['policy'];
      dto.qFormat = schema.qFormat;
      dto.precision = schema.precision;
      dto.min =
        schema.min === undefined ? undefined : Number.parseFloat(schema.min);
      dto.max =
        schema.max === undefined ? undefined : Number.parseFloat(schema.max);
      dto.allowedValues = schema.rangeList?.map(r => {
        const nv = new NameValuePairDto();
        nv.name = r.name;
        nv.value = r.value;
        return nv;
      });
      return dto;
    }
    if (schema.type === PARAMETER_ELEMENT_TYPE.ElementArray) {
      const dto = new ElementTemplateArrayDto();
      dto.name = schema.name;
      dto.isReadOnly = schema.isReadOnly;
      dto.description = schema.description;
      dto.group = schema.group;
      dto.subgroup = schema.subgroup;
      dto.length = schema.length;
      dto.lengthFormula = schema.arrayLenFormulaStr;
      dto.template = [this.transformSchema(schema.template)];
      dto.value = [];
      return dto;
    }
    if (schema.type === PARAMETER_ELEMENT_TYPE.StructArray) {
      return this.transformStructArraySchema(schema);
    }
    const dto = new StructDto();
    dto.name = schema.name;
    dto.isReadOnly = schema.isReadOnly;
    dto.description = schema.description;
    dto.group = schema.group;
    dto.subgroup = schema.subgroup;
    dto.structType = schema.structureType;
    dto.value = [];
    return dto;
  }

  private transformStructArraySchema(
    schema: StructArraySchema,
  ): ElementTemplateArrayDto {
    const dto = new ElementTemplateArrayDto();
    dto.name = schema.name;
    dto.isReadOnly = schema.isReadOnly;
    dto.description = schema.description;
    dto.group = schema.group;
    dto.subgroup = schema.subgroup;
    dto.length = schema.length;
    dto.lengthFormula = schema.arrayLenFormulaStr;
    dto.template = [this.transformSchema(schema.template)];
    dto.value = [];
    return dto;
  }
}
