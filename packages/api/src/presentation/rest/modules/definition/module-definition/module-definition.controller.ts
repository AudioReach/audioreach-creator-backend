/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotImplementedException,
  Param,
  Patch,
  Put,
  Query,
  //UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import {
  QueryBus,
  GetAllSpfModuleDefinitionsQuery,
  GetSpfModuleDefinitionQuery,
  GetSpfCustomModuleMetadataQuery,
  GetAllDriverModuleDefinitionsQuery,
  GetDriverModuleDefinitionQuery,
  type Result,
  type SpfModuleDefinitionSummaryWithCustomData,
  type CustomModuleMetadataReadModel,
  type ParameterDefinitionSummaryReadModel,
  type BaseModuleDefinitionSummaryReadModel,
} from '@arc/core';
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {toApiResult} from '../../../common/result/to-api-result.js';
import {NameValueDto} from '../../../common/dto/name-value.dto.js';
import {
  DATA_TYPE,
  createDataType,
  type DataType,
} from '../../../common/utils/data-type.factory.js';
import {PartialSuccessInterceptor} from '../../../common/interceptors/partial-success.interceptor.js';
import {SpfModuleDefinitionResponseDto} from './dto/spf-module-definition-response.dto.js';
import {DriverModuleDefinitionResponseDto} from './dto/driver-module-definition-response.dto.js';
import {SpfCustomModuleMetadataDto} from './dto/spf-custom-module-metadata.dto.js';
import {SpfCustomModuleMetadataResponseDto} from './dto/spf-custom-module-metadata-response.dto.js';
import {DeleteSpfCustomModuleMetadataResponseDto} from './dto/delete-spf-custom-module-metadata-response.dto.js';
import {UpdateSpfCustomModuleMetadataRequestDto} from './dto/update-spf-custom-module-metadata-request.dto.js';
import {PatchSpfModuleDefinitionRequestDto} from './dto/patch-spf-module-definition-request.dto.js';
import {ParameterDefinitionSummaryDto} from './dto/parameter-definition-summary-response.dto.js';
import {ParameterDefinitionSummaryInfo} from './info/parameter-definition-summary-info.js';
import {ModuleInfo, ContainerTypeInfo} from './info/module-info.js';
import {ProcessorInfo} from './info/processor-info.js';
import {
  DataPortInfo,
  StaticCtrlPortInfo,
  IntentInfo,
  PortInfo,
} from './info/port-info.js';
import {ToolPolicy} from './enums/tool-policy.emum.js';
import {
  DefinitionConfigElementDto,
  DefinitionConfigElementArrayDto,
  DefinitionStructDto,
  DefinitionStructArrayDto,
} from './dto/definition-element.dto.js';

@ApiTags('module-definition')
@Controller('arc-api/v1/projects')
//@UseGuards(AuthGuard('jwt'))
@UseInterceptors(PartialSuccessInterceptor)
@ApiExtraModels(ApiResult, SpfModuleDefinitionResponseDto)
@ApiExtraModels(ApiResult, ParameterDefinitionSummaryDto)
@ApiExtraModels(ApiResult, DriverModuleDefinitionResponseDto)
@ApiExtraModels(ApiResult, SpfCustomModuleMetadataDto)
@ApiExtraModels(ApiResult, SpfCustomModuleMetadataResponseDto)
@ApiExtraModels(ApiResult, DeleteSpfCustomModuleMetadataResponseDto)
@ApiExtraModels(ApiResult, UpdateSpfCustomModuleMetadataRequestDto)
@ApiExtraModels(
  DefinitionConfigElementDto,
  DefinitionConfigElementArrayDto,
  DefinitionStructDto,
  DefinitionStructArrayDto,
)
export class ModuleDefinitionController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get('/:projectId/spf-module-definitions')
  @ApiOperation({
    summary: 'Return the list of spf module definitions',
    description:
      'Return the list of spf module definitions based on project id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiQuery({
    name: 'processorId',
    description: 'Filter by processor id',
    required: false,
  })
  @ApiQuery({
    name: 'moduleDefinitionId',
    description: 'Filter by module definition id',
    required: false,
  })
  @ApiQuery({
    name: 'parameterId',
    description: 'Filter by parameter id',
    required: false,
  })
  @ApiQuery({
    name: 'includeCustomData',
    description:
      'Include custom module data in the response. Defaults to false.\n\n' +
      'To get the schema for custom module data, first call GET /arc-api/v1/projects/:projectId/spf-custom-module-schema',
    required: false,
    type: Boolean,
  })
  @ApiResponse({
    description: 'Successfully fetched information',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'array',
              items: {$ref: getSchemaPath(SpfModuleDefinitionResponseDto)},
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.MULTI_STATUS,
    description:
      'Partial success — some custom module data could not be retrieved (see issues array)',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'array',
              items: {$ref: getSchemaPath(SpfModuleDefinitionResponseDto)},
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description:
      'Project, processor, module definition or parameter does not exist',
    type: ApiResult,
  })
  async getAllSpfModuleDefinitions(
    @Param('projectId') projectId: string,
    @Query('processorId') processorId?: string,
    @Query('moduleDefinitionId') moduleDefinitionId?: string,
    @Query('parameterId') parameterId?: string,
    @Query('includeCustomData') includeCustomData: boolean = false,
  ): Promise<ApiResult<SpfModuleDefinitionResponseDto[]>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const query = new GetAllSpfModuleDefinitionsQuery(
      parsedProjectId,
      {
        processorNaturalId: parseOptionalInt(processorId),
        moduleDefinitionNaturalId: parseOptionalInt(moduleDefinitionId),
        parameterNaturalId: parseOptionalInt(parameterId),
      },
      includeCustomData,
      'client-id', // TODO: extract real clientId from JWT once auth wiring is done
    );

    const result =
      await this.queryBus.execute<
        Result<SpfModuleDefinitionSummaryWithCustomData[]>
      >(query);

    return toApiResult(result, data =>
      data.map(d => this.mapToSpfModuleDefinitionDto(d)),
    );
  }

  @Get('/:projectId/spf-module-definitions/:moduleSystemId')
  @ApiOperation({
    summary: 'Return spf module definition  by module system id',
    description:
      'Return spf module definition based on project id and module definition system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of module',
    required: true,
  })
  @ApiQuery({
    name: 'includeCustomData',
    description:
      'Include custom module data in the response. Defaults to false.\n\n' +
      'To get the schema for custom module data, first call GET /arc-api/v1/projects/:projectId/spf-custom-module-schema',
    required: false,
    type: Boolean,
  })
  @ApiResponse({
    description: 'Successfully fetched information',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(SpfModuleDefinitionResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or module not found',
    type: ApiResult,
  })
  async getSpfModuleDefinition(
    @Param('projectId') projectId: string,
    @Param('moduleSystemId') moduleSystemId: string,
    @Query('includeCustomData') includeCustomData: boolean = false,
  ): Promise<ApiResult<SpfModuleDefinitionResponseDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const parsedModuleSystemId = Number.parseInt(moduleSystemId, 10);
    if (Number.isNaN(parsedModuleSystemId)) {
      throw new BadRequestException(
        `Invalid module system ID: ${moduleSystemId}`,
      );
    }

    const query = new GetSpfModuleDefinitionQuery(
      parsedProjectId,
      parsedModuleSystemId,
      includeCustomData,
      'client-id', // TODO: extract real clientId from JWT once auth wiring is done
    );

    const result =
      await this.queryBus.execute<SpfModuleDefinitionSummaryWithCustomData>(
        query,
      );

    return {data: this.mapToSpfModuleDefinitionDto(result)};
  }

  @Patch('/:projectId/spf-module-definitions/:moduleSystemId')
  @ApiOperation({
    summary: 'Partially update a spf module definition',
    description:
      'Partially update a spf module definition based on project id and module system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of module',
    required: true,
  })
  @ApiQuery({
    name: 'includeCustomData',
    description:
      'Include custom module data in the response. Defaults to false.\n\n' +
      'To get the schema for custom module data, first call GET /arc-api/v1/projects/:projectId/spf-custom-module-schema',
    required: false,
    type: Boolean,
  })
  @ApiResponse({
    description: 'Successfully updated spf module definition',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(SpfModuleDefinitionResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or module not found',
    type: ApiResult,
  })
  async patchSpfModuleDefinition(
    @Param('projectId') _projectId: string,
    @Param('moduleSystemId') _moduleSystemId: string,
    @Body() _patchSpfModuleDefinitionDto: PatchSpfModuleDefinitionRequestDto,
    @Query('includeCustomData') _includeCustomData: boolean = false,
  ): Promise<ApiResult<SpfModuleDefinitionResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException(
      'patchSpfModuleDefinition is not implemented yet',
    );
  }

  @Get(
    '/:projectId/spf-module-definitions/:moduleSystemId/custom-module-metadata',
  )
  @ApiOperation({
    summary: 'Return custom module metadata for a spf module',
    description:
      'Return custom module metadata based on project id and module system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of module',
    required: true,
  })
  @ApiResponse({
    description: 'Successfully fetched custom module metadata',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(SpfCustomModuleMetadataResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Module is not a custom module',
    type: ApiResult,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or module not found',
    type: ApiResult,
  })
  async getSpfCustomModuleMetadata(
    @Param('projectId') projectId: string,
    @Param('moduleSystemId') moduleSystemId: string,
  ): Promise<ApiResult<SpfCustomModuleMetadataResponseDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const parsedModuleSystemId = Number.parseInt(moduleSystemId, 10);
    if (Number.isNaN(parsedModuleSystemId)) {
      throw new BadRequestException(
        `Invalid module system ID: ${moduleSystemId}`,
      );
    }

    const query = new GetSpfCustomModuleMetadataQuery(
      parsedProjectId,
      parsedModuleSystemId,
      'client-id', // TODO: extract real clientId from JWT once auth wiring is done
    );

    const result =
      await this.queryBus.execute<CustomModuleMetadataReadModel>(query);

    return {data: this.mapToCustomModuleMetadataDto(result)};
  }

  @Put(
    '/:projectId/spf-module-definitions/:moduleSystemId/custom-module-metadata',
  )
  @ApiOperation({
    summary: 'Update custom module metadata for a spf module',
    description:
      'Update custom module metadata based on project id and module system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of module',
    required: true,
  })
  @ApiResponse({
    description: 'Successfully updated custom module metadata',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(SpfCustomModuleMetadataResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request body or module is not a custom module',
    type: ApiResult,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or module not found',
    type: ApiResult,
  })
  async updateSpfCustomModuleMetadata(
    @Param('projectId') _projectId: string,
    @Param('moduleSystemId') _moduleSystemId: string,
    @Body()
    _updateSpfCustomModuleMetadataDto: UpdateSpfCustomModuleMetadataRequestDto,
  ): Promise<ApiResult<SpfCustomModuleMetadataResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException(
      'updateSpfCustomModuleMetadata is not implemented yet',
    );
  }

  @Delete(
    '/:projectId/spf-module-definitions/:moduleSystemId/custom-module-metadata',
  )
  @ApiOperation({
    summary: 'Delete custom module metadata for a spf module',
    description:
      'Delete custom module metadata based on project id and module system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of module',
    required: true,
  })
  @ApiResponse({
    description: 'Successfully deleted custom module metadata',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              $ref: getSchemaPath(DeleteSpfCustomModuleMetadataResponseDto),
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Module is not a custom module',
    type: ApiResult,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or module not found',
    type: ApiResult,
  })
  async deleteSpfCustomModuleMetadata(
    @Param('projectId') _projectId: string,
    @Param('moduleSystemId') _moduleSystemId: string,
  ): Promise<ApiResult<DeleteSpfCustomModuleMetadataResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException(
      'deleteSpfCustomModuleMetadata is not implemented yet',
    );
  }

  @Get('/:projectId/driver-module-definitions')
  @ApiOperation({
    summary: 'Return the list of driver module definitions',
    description:
      'Return the list of driver module definitions based on project id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiQuery({
    name: 'moduleDefinitionId',
    description: 'Filter by module definition id',
    required: false,
  })
  @ApiQuery({
    name: 'parameterId',
    description: 'Filter by parameter id',
    required: false,
  })
  @ApiResponse({
    description: 'Successfully fetched information',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'array',
              items: {$ref: getSchemaPath(DriverModuleDefinitionResponseDto)},
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project, module definition or parameter does not exist',
    type: ApiResult,
  })
  async getAllDriverModuleDefinitions(
    @Param('projectId') projectId: string,
    @Query('moduleDefinitionId') moduleDefinitionId?: string,
    @Query('parameterId') parameterId?: string,
  ): Promise<ApiResult<DriverModuleDefinitionResponseDto[]>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const query = new GetAllDriverModuleDefinitionsQuery(
      parsedProjectId,
      parseOptionalInt(moduleDefinitionId),
      parseOptionalInt(parameterId),
      'client-id', // TODO: extract real clientId from JWT once auth wiring is done
    );

    const result =
      await this.queryBus.execute<
        Result<BaseModuleDefinitionSummaryReadModel[]>
      >(query);

    return toApiResult(result, data =>
      data.map(d => this.mapToDriverModuleDefinitionDto(d)),
    );
  }

  @Get('/:projectId/driver-module-definitions/:moduleSystemId')
  @ApiOperation({
    summary: 'Return driver module definition by module system id',
    description:
      'Return driver module definition based on project id and module definition system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of driver module',
    required: true,
  })
  @ApiResponse({
    description: 'Successfully fetched information',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(DriverModuleDefinitionResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or driver module not found',
    type: ApiResult,
  })
  async getDriverModuleDefinition(
    @Param('projectId') projectId: string,
    @Param('moduleSystemId') moduleSystemId: string,
  ): Promise<ApiResult<DriverModuleDefinitionResponseDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const parsedModuleSystemId = Number.parseInt(moduleSystemId, 10);
    if (Number.isNaN(parsedModuleSystemId)) {
      throw new BadRequestException(
        `Invalid module system ID: ${moduleSystemId}`,
      );
    }

    const query = new GetDriverModuleDefinitionQuery(
      parsedProjectId,
      parsedModuleSystemId,
      'client-id', // TODO: extract real clientId from JWT once auth wiring is done
    );

    const result =
      await this.queryBus.execute<BaseModuleDefinitionSummaryReadModel>(query);

    return {data: this.mapToDriverModuleDefinitionDto(result)};
  }

  // ── Private mappers ──────────────────────────────────────────────────────

  /**
   * Maps SpfModuleDefinitionSummaryWithCustomData → SpfModuleDefinitionResponseDto.
   * changeInfo is left undefined — edit-session mechanics deferred per LLD.
   * customModuleData: both "not requested" (undefined) and "resolution
   * failed" (null) collapse to undefined at the API boundary — that
   * distinction doesn't need to survive to the client.
   */
  private mapToSpfModuleDefinitionDto(
    row: SpfModuleDefinitionSummaryWithCustomData,
  ): SpfModuleDefinitionResponseDto {
    const dto = new SpfModuleDefinitionResponseDto();
    dto.systemId = String(row.systemId);
    dto.moduleId = row.moduleId;
    dto.name = row.name;
    dto.displayName = row.displayName ?? '';
    dto.description = row.description ?? '';
    dto.paramDefinitionsSummaryInfo = row.parameterDefinitions.map(p =>
      this.mapToParameterSummaryInfo(p),
    );
    dto.deprecated = row.deprecated;
    dto.processorInfo = this.mapToProcessorInfo(row.processorInfo);
    dto.modSearchKeys = row.modSearchKeys ?? '';
    // TODO(schema): isOffloadable/builtIn/vocoderModuleType/moduleDirectionType
    // have no backing column yet — dto fields are commented out.
    dto.moduleInfo = this.mapToModuleInfoDto(row.moduleInfo);
    dto.isLoadedAtBootup = row.isLoadedAtBootup;
    dto.isCustomModule = row.isCustomModule;
    dto.customModuleData = row.customModuleData
      ? this.mapToCustomModuleMetadataDto(row.customModuleData)
      : undefined;
    return dto;
  }

  private mapToProcessorInfo(
    p: SpfModuleDefinitionSummaryWithCustomData['processorInfo'],
  ): ProcessorInfo {
    const info = new ProcessorInfo();
    info.systemId = String(p.systemId);
    info.processorId = p.processorId;
    info.name = p.name;
    return info;
  }

  private mapToModuleInfoDto(
    m: SpfModuleDefinitionSummaryWithCustomData['moduleInfo'],
  ): ModuleInfo {
    const dto = new ModuleInfo();
    // TODO(schema): pidFramework has no backing column yet — dto field is
    // commented out in info/module-info.ts.
    dto.stackSize = m.stackSize;
    dto.containerTypeInfo = m.containerTypeInfo.map(ct => {
      const info = new ContainerTypeInfo();
      info.name = ct.name;
      info.value = ct.value;
      return info;
    });
    // TODO(schema): metaData/reserved have no backing column yet — dto
    // fields are commented out.
    dto.inputDataPortInfo = this.mapToDataPortInfo(m.inputDataPortInfo);
    dto.outputDataPortInfo = this.mapToDataPortInfo(m.outputDataPortInfo);
    dto.staticCtrlPorts = m.staticCtrlPorts.map(p => {
      const info = new StaticCtrlPortInfo();
      info.systemId = String(p.systemId);
      info.portId = p.portId;
      info.portName = p.portName;
      info.portIntents = (p.staticIntents ?? []).map(i => {
        const intent = new IntentInfo();
        intent.systemId = String(i.systemId);
        intent.intentId = i.intentId;
        intent.name = i.name;
        intent.maxPorts = 0;
        return intent;
      });
      return info;
    });
    dto.dynamicIntents = m.dynamicIntents.map(d => {
      const intent = new IntentInfo();
      intent.systemId = String(d.systemId);
      intent.intentId = d.intentId;
      intent.name = d.name;
      intent.maxPorts = d.maxPort;
      return intent;
    });
    // TODO(schema): moduleTypeInfo/mdfModuleType have no backing column
    // yet — dto fields are commented out.
    return dto;
  }

  private mapToDataPortInfo(
    group: SpfModuleDefinitionSummaryWithCustomData['moduleInfo']['inputDataPortInfo'],
  ): DataPortInfo {
    const dto = new DataPortInfo();
    dto.systemId = group ? String(group.systemId) : '';
    dto.maxPorts = group?.maxAllowedPortCount ?? 0;
    dto.ports = (group?.ports ?? []).map(p => {
      const port = new PortInfo();
      port.portId = p.dataPortId;
      port.portName = p.name;
      return port;
    });
    return dto;
  }

  /**
   * toolPolicies is a raw stored string (JSON.stringify(ToolPolicy[])) on
   * the read model, but the DTO still has the old singular toolPolicy
   * field — the toolPolicy → toolPolicies DTO correction is a separate,
   * deferred phase. Temporary shim: parse the stored array and take the
   * first entry, falling back to Calibration if empty/unparseable.
   */
  private mapToParameterSummaryInfo(
    p: ParameterDefinitionSummaryReadModel,
  ): ParameterDefinitionSummaryInfo {
    const info = new ParameterDefinitionSummaryInfo();
    info.systemId = String(p.systemId);
    info.paramId = p.paramId;
    info.name = p.name ?? '';
    info.description = p.description ?? '';
    // TODO(schema): isHidden/deprecated have no backing column yet — dto
    // fields are commented out in info/parameter-definition-summary-info.ts.
    info.isReadOnly = p.isReadOnly ?? false;
    info.toolPolicy = this.parseFirstToolPolicy(p.toolPolicies);
    info.pidType = p.pidType as ParameterDefinitionSummaryInfo['pidType'];
    return info;
  }

  private parseFirstToolPolicy(stored: string): ToolPolicy {
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    const first: unknown = Array.isArray(parsed)
      ? (parsed as unknown[])[0]
      : undefined;
    return first && Object.values(ToolPolicy).includes(first as ToolPolicy)
      ? (first as ToolPolicy)
      : ToolPolicy.Calibration;
  }

  /**
   * Maps DriverModuleDefinitionSummaryReadModel → DriverModuleDefinitionResponseDto.
   * displayName/deprecated (module-level) and isHidden/isReadOnly/deprecated/
   * toolPolicy/pidType (parameter-level) are always undefined on the read
   * model today — no backing DTO field or column exists yet, see
   * driver-module-definition-query-lld.md §6.
   */
  private mapToDriverModuleDefinitionDto(
    row: BaseModuleDefinitionSummaryReadModel,
  ): DriverModuleDefinitionResponseDto {
    const dto = new DriverModuleDefinitionResponseDto();
    dto.systemId = String(row.systemId);
    dto.moduleId = row.moduleId;
    dto.name = row.name;
    dto.displayName = row.displayName ?? '';
    dto.description = row.description ?? '';
    dto.paramDefinitionsSummaryInfo = row.parameterDefinitions.map(p =>
      this.mapToDriverParameterSummaryInfo(p),
    );
    return dto;
  }

  private mapToDriverParameterSummaryInfo(
    p: ParameterDefinitionSummaryReadModel,
  ): ParameterDefinitionSummaryInfo {
    const info = new ParameterDefinitionSummaryInfo();
    info.systemId = String(p.systemId);
    info.paramId = p.paramId;
    info.name = p.name ?? '';
    info.description = p.description ?? '';
    info.isReadOnly = p.isReadOnly ?? false;
    info.toolPolicy = this.parseFirstToolPolicy(p.toolPolicies);
    info.pidType = (p.pidType ??
      '') as ParameterDefinitionSummaryInfo['pidType'];
    return info;
  }

  /**
   * type/interface.type/interface.version each map to a fixed underlying
   * data type per LLD §2.3.3 — UINT32 for the module type, UINT16 for
   * interface type/version — not derived from the read model.
   */
  private mapToCustomModuleMetadataDto(
    m: CustomModuleMetadataReadModel,
  ): SpfCustomModuleMetadataResponseDto {
    const dto = new SpfCustomModuleMetadataResponseDto();
    dto.type = this.mapToNameValueDto(m.type, DATA_TYPE.UInt32);
    dto.interface = {
      type: this.mapToNameValueDto(m.interface.type, DATA_TYPE.UInt16),
      version: this.mapToNameValueDto(m.interface.version, DATA_TYPE.UInt16),
    };
    dto.fileName = m.fileName;
    dto.endPointFunctionTag = m.endPointFunctionTag;
    return dto;
  }

  private mapToNameValueDto(
    nv: {name: string; value: string},
    dataType: DataType,
  ): NameValueDto {
    const dto = new NameValueDto();
    dto.name = nv.name;
    dto.value = nv.value;
    dto.valueDataType = createDataType(dataType);
    return dto;
  }

  // @Get(':projectId/definitions/modules/spf/:moduleSystemId/parameters')
  // @ApiOperation({ summary: 'Return param definitions for a spf module', description: 'Return param definitions based on project id and spf module definition system id' })
  // @ApiParam({ name: 'projectId', description: 'Id of project', required: true })
  // @ApiParam({ name: 'moduleSystemId', description: 'System identifier of spf module', required: true })
  // @ApiResponse({
  //   description: 'Successfully fetched information',
  //   status: HttpStatus.OK,
  //   schema: {
  //     allOf: [
  //       { $ref: getSchemaPath(ApiResult) },
  //       {
  //         properties: {
  //           data: { type: 'array', items: { $ref: getSchemaPath(ParameterDefinitionDetailDto) } },
  //         },
  //       },
  //     ],
  //   },
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Project or module not found',
  //   type: ApiResult,
  // })
  // async getSpfParamDefinitions(@Param('projectId') _projectId: string, @Param('moduleSystemId') _moduleSystemId: string): Promise<ApiResult<ParameterDefinitionDetailDto[]>> {
  //   await Promise.resolve();
  //   return new ApiResult<ParameterDefinitionDetailDto[]>();
  // }

  // @Get(':projectId/definitions/modules/spf/:moduleSystemId/parameters/:paramSystemId')
  // @ApiOperation({ summary: 'Return param definition by parameter system id', description: 'Return param definition based on project id, spf module definition system id and parameter system id' })
  // @ApiParam({ name: 'projectId', description: 'Id of project', required: true })
  // @ApiParam({ name: 'moduleSystemId', description: 'System identifier of spf module', required: true })
  // @ApiParam({ name: 'paramSystemId', description: 'System identifier of parameter', required: true })
  // @ApiResponse({
  //   description: 'Successfully fetched information',
  //   status: HttpStatus.OK,
  //   schema: {
  //     allOf: [
  //       { $ref: getSchemaPath(ApiResult) },
  //       {
  //         properties: {
  //           data: { $ref: getSchemaPath(ParameterDefinitionDetailDto) },
  //         },
  //       },
  //     ],
  //   },
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Project, module or param not found',
  //   type: ApiResult,
  // })
  // async getSpfParamDefinition(@Param('projectId') _projectId: string, @Param('moduleSystemId') _moduleSystemId: string, @Param('paramSystemId') _paramSystemId: string): Promise<ApiResult<ParameterDefinitionDetailDto>> {
  //   await Promise.resolve();
  //   return new ApiResult<ParameterDefinitionDetailDto>();
  // }

  // @Get(':projectId/definitions/modules/driver/:moduleSystemId/parameters')
  // @ApiOperation({ summary: 'Return param definitions for a driver module', description: 'Return param definitions based on project id and driver module definition system id' })
  // @ApiParam({ name: 'projectId', description: 'Id of project', required: true })
  // @ApiParam({ name: 'moduleSystemId', description: 'System identifier of driver module', required: true })
  // @ApiResponse({
  //   description: 'Successfully fetched information',
  //   status: HttpStatus.OK,
  //   schema: {
  //     allOf: [
  //       { $ref: getSchemaPath(ApiResult) },
  //       {
  //         properties: {
  //           data: { type: 'array', items: { $ref: getSchemaPath(ParameterDefinitionDetailDto) } },
  //         },
  //       },
  //     ],
  //   },
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Project or driver module not found',
  //   type: ApiResult,
  // })
  // async getDriverParamDefinitions(@Param('projectId') _projectId: string, @Param('moduleSystemId') _moduleSystemId: string): Promise<ApiResult<ParameterDefinitionDetailDto[]>> {
  //   await Promise.resolve();
  //   return new ApiResult<ParameterDefinitionDetailDto[]>();
  // }

  // @Get(':projectId/definitions/modules/driver/:moduleSystemId/parameters/:paramSystemId')
  // @ApiOperation({ summary: 'Return param definition by parameter system id', description: 'Return param definition based on project id, driver module definition system id and parameter system id' })
  // @ApiParam({ name: 'projectId', description: 'Id of project', required: true })
  // @ApiParam({ name: 'moduleSystemId', description: 'System identifier of driver module', required: true })
  // @ApiParam({ name: 'paramSystemId', description: 'System identifier of parameter', required: true })
  // @ApiResponse({
  //   description: 'Successfully fetched information',
  //   status: HttpStatus.OK,
  //   schema: {
  //     allOf: [
  //       { $ref: getSchemaPath(ApiResult) },
  //       {
  //         properties: {
  //           data: { $ref: getSchemaPath(ParameterDefinitionDetailDto) },
  //         },
  //       },
  //     ],
  //   },
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Project, driver module or param not found',
  //   type: ApiResult,
  // })
  // async getDriverParamDefinition(@Param('projectId') _projectId: string, @Param('moduleSystemId') _moduleSystemId: string, @Param('paramSystemId') _paramSystemId: string): Promise<ApiResult<ParameterDefinitionDetailDto>> {
  //   await Promise.resolve();
  //   return new ApiResult<ParameterDefinitionDetailDto>();
  // }
}

function parseOptionalInt(value?: string): number | undefined {
  return value === undefined ? undefined : Number.parseInt(value, 10);
}
