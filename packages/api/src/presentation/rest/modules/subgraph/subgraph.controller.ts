/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  NotImplementedException,
  Post,
  Get,
  Patch,
  Put,
  Delete,
  BadRequestException,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
  UseInterceptors,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {ApiTags, ApiParam, ApiExtraModels, ApiQuery} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {
  SubgraphResponseDto,
  SubgraphPropertiesResponseDto,
  UpdateScenarioResponseDto,
  UpdateVsidResponseDto,
  VcpmCkvResponseDto,
  CreateVcpmCkvResponseDto,
} from './dto/subgraph-response.dto.js';
import {SubgraphPairResponseDto} from './dto/subgraph-pair-response.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ComponentsResponseDto} from '../../common/dto/component-collection-response.dto.js';
import {ConfigElementDto} from '../../common/dto/element-data/elements/config-element/config-element.dto.js';
import {ElementTemplateArrayDto} from '../../common/dto/element-data/elements/element-template-array.dto.js';
import {StructDto} from '../../common/dto/element-data/elements/struct.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {UsecaseResponseDto} from '../usecase/dto/usecase-response.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../common/result/to-api-result.js';
import {PropertyResponseDto} from '../../common/dto/property-response.dto.js';
import {CkvCalDataResponseDto} from '../../common/dto/tuning-data/ckv-cal-data-response.dto.js';
import {
  PatchSubgraphRequestDto,
  UpdateSubgraphContainerIdRequestDto,
  CreateVcpmCkvRequestDto,
} from './dto/subgraph-request.dto.js';
import {UpdatePropertyRequestDto} from '../../common/dto/update-property-request.dto.js';
import {UpdateSpfModuleCalDataRequestDto} from '../spf-module/dto/request/update-spf-module-cal-data-request.dto.js';
import {ParameterSummaryDto} from '../../common/dto/parameter-summary.dto.js';
import {PropertySummaryDto} from '../../common/dto/property-summary.dto.js';
import {ConfigElementSummaryDto} from '../../common/dto/element-data/elements/config-element-summary.dto.js';
import {ElementTemplateArraySummaryDto} from '../../common/dto/element-data/elements/element-template-array-summary.dto.js';
import {StructSummaryDto} from '../../common/dto/element-data/elements/struct-summary.dto.js';
import {SessionGuard} from '../../../../guards/session-guard.js';
import {ArcSession} from '../../../../guards/arc-session.decorator.js';
import {
  QueryBus,
  CommandBus,
  GetComponentsQuery,
  GetSubgraphPropertiesQuery,
  UpdateSubgraphScenarioCommand,
  UpdateSubgraphVsidCommand,
  PatchSubgraphCommand,
  UpdateSubgraphPropertyCommand,
  UpdateSubgraphContainerIdCommand,
  GetVcpmCkvQuery,
  GetVcpmCalDataQuery,
  CreateVcpmCkvCommand,
  DeleteVcpmCkvCommand,
  UpdateVcpmCalDataCommand,
  Result,
  RESULT_KIND,
  type ActiveSession,
  COMPONENT_SCOPE_TYPE,
  type ComponentCollectionDto as CoreComponentCollectionDto,
  type ScenarioChangeDto,
  type VsidUpdateDto,
  type VcpmCkvDto,
  type CreateVcpmCkvDto,
  type CkvCalDataDto,
  type PutVcpmCalDataResult,
  type ParameterElementSummaryDto,
} from '@arc/core';
/**
 * Controller to support all subgraph related APIs for usecase design.
 * Provides subgraph related APIs for usecase design.
 */
@ApiTags('subgraphs')
@Controller('arc-api/v1/projects/:projectId/subgraphs')
//@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(
  ConfigElementDto,
  ElementTemplateArrayDto,
  StructDto,
  ConfigElementSummaryDto,
  ElementTemplateArraySummaryDto,
  StructSummaryDto,
  ParameterSummaryDto,
  PropertySummaryDto,
  UpdateScenarioResponseDto,
  UpdateVsidResponseDto,
  PropertyResponseDto,
  VcpmCkvResponseDto,
  CreateVcpmCkvResponseDto,
  CkvCalDataResponseDto,
)
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class SubgraphController extends BaseController {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {
    super();
  }

  /**
   * Get all subgraphs in the project.
   */
  @Get()
  @ApiDocumentationWithExample({
    summary: 'Get all subgraphs in the project',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [SubgraphResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subgraphs',
      },
    ],
  })
  async getAllSubgraphs(
    @Param('projectId') projectId: string,
  ): Promise<ApiResult<SubgraphResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(`Getting all subgraphs in project ${projectId}`);
    throw new NotImplementedException('getAllSubgraphs is not implemented yet');
  }

  /**
   * Query subgraphs for subgraph system ids.
   */
  @Post('query')
  @ApiDocumentationWithExample({
    summary: 'Query subgraphs for subgraph systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of subgraph system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'All subgraphs found successfully',
        dto: [SubgraphResponseDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some subgraphs could not be retrieved (see errors array)',
        dto: [SubgraphResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subgraphs',
      },
    ],
  })
  async querySubgraphs(
    @Param('projectId') projectId: string,
    @Body() subgraphSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<SubgraphResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting subgraphs in project ${projectId}: ${JSON.stringify(subgraphSystemIds)}`,
    );
    throw new NotImplementedException('querySubgraphs is not implemented yet');
  }

  /**
   * Get all property data for a subgraph (subgraph, container, subsystem, module).
   */
  @Get('/:subgraphSystemId/properties')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all property data for a subgraph',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: SubgraphPropertiesResponseDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — one or more property payloads missing (see issues array)',
        dto: SubgraphPropertiesResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
    ],
  })
  async getSubgraphProperties(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<SubgraphPropertiesResponseDto>> {
    const query = new GetSubgraphPropertiesQuery(
      Number.parseInt(projectId, 10),
      Number.parseInt(subgraphSystemId, 10),
      'client-id',
    );
    const result =
      await this.queryBus.execute<Result<SubgraphPropertiesResponseDto>>(query);
    return toApiResult(result);
  }

  /**
   * Get property data for a single subgraph property by its system ID.
   */
  @Get('/:subgraphSystemId/properties/:propertySystemId')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @ApiParam({
    name: 'propertySystemId',
    required: true,
    type: String,
    description: 'System id of the property',
  })
  @ApiDocumentationWithExample({
    summary: 'Get property data for a single subgraph property',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: PropertyResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project, subgraph, or property not found',
      },
    ],
  })
  async getSubgraphProperty(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
    @Param('propertySystemId') propertySystemId: string,
  ): Promise<ApiResult<PropertyResponseDto>> {
    await Promise.resolve();
    console.log(
      `Getting property ${propertySystemId} for subgraph ${subgraphSystemId} in project ${projectId}`,
    );
    throw new NotImplementedException(
      'getSubgraphProperty is not implemented yet',
    );
  }

  /**
   * Set scenario property for a subgraph (Audio/Voice).
   */
  @Patch('/:subgraphSystemId/scenario')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @UseGuards(SessionGuard)
  @ApiDocumentationWithExample({
    summary: 'Set scenario property for a subgraph (Audio/Voice)',
    description:
      'Triggers a 4–7 step cascade. Returns a mutation log of properties and module CKVs added/removed.',
    requestDto: UpdatePropertyRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Scenario updated',
        dto: UpdateScenarioResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update scenario',
      },
    ],
  })
  async setSubgraphScenario(
    @Param('subgraphSystemId', ParseIntPipe) subgraphSystemId: number,
    @Body() dto: UpdatePropertyRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<UpdateScenarioResponseDto>> {
    const result = await this.commandBus.execute<ScenarioChangeDto>(
      new UpdateSubgraphScenarioCommand(subgraphSystemId, [dto]),
      session,
    );
    return toApiResult(Result.ok(result));
  }

  /**
   * Set VSID for a subgraph — propagates via BFS to all connected subgraphs.
   */
  @Patch('/:subgraphSystemId/vsid')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @UseGuards(SessionGuard)
  @ApiDocumentationWithExample({
    summary:
      'Set VSID for a subgraph — propagates via BFS to all connected subgraphs',
    requestDto: UpdatePropertyRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'VSID updated',
        dto: UpdateVsidResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update VSID',
      },
    ],
  })
  async setSubgraphVsid(
    @Param('subgraphSystemId', ParseIntPipe) subgraphSystemId: number,
    @Body() dto: UpdatePropertyRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<UpdateVsidResponseDto>> {
    const result = await this.commandBus.execute<VsidUpdateDto>(
      new UpdateSubgraphVsidCommand(subgraphSystemId, [dto]),
      session,
    );
    return toApiResult(Result.ok(result));
  }

  /**
   * Patch a subgraph — currently supports `name`.
   */
  @Patch('/:subgraphSystemId')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @UseGuards(SessionGuard)
  @ApiDocumentationWithExample({
    summary: 'Patch a subgraph',
    requestDto: PatchSubgraphRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Subgraph updated',
        dto: SubgraphResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'No fields provided',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph not found',
      },
    ],
  })
  async patchSubgraph(
    @Param('projectId') _projectId: string,
    @Param('subgraphSystemId', ParseIntPipe) subgraphSystemId: number,
    @Body() dto: PatchSubgraphRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<SubgraphResponseDto>> {
    await this.commandBus.execute<void>(
      new PatchSubgraphCommand(subgraphSystemId, dto.name),
      session,
    );
    throw new NotImplementedException(
      'patchSubgraph response not implemented yet',
    );
  }

  /**
   * Update a low-cascading subgraph property.
   * Returns 400 if propSystemId maps to a reserved property (scenario, VSID, ASoC).
   */
  @Patch('/:subgraphSystemId/properties/:propSystemId')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @ApiParam({
    name: 'propSystemId',
    required: true,
    type: String,
    description: 'System id of the property to update',
  })
  @UseGuards(SessionGuard)
  @ApiDocumentationWithExample({
    summary: 'Update a low-cascading subgraph property',
    description:
      'Returns 400 if propSystemId maps to a reserved property (scenario, VSID, ASoC) — use the dedicated endpoint instead.',
    requestDto: UpdatePropertyRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Property updated',
        dto: PropertyResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Reserved property — use dedicated endpoint',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph or property not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update property',
      },
    ],
  })
  async updateSubgraphProperty(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId', ParseIntPipe) subgraphSystemId: number,
    @Param('propSystemId', ParseIntPipe) propSystemId: number,
    @Body() dto: UpdatePropertyRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<SubgraphPropertiesResponseDto>> {
    await this.commandBus.execute<void>(
      new UpdateSubgraphPropertyCommand(subgraphSystemId, propSystemId, [dto]),
      session,
    );
    const query = new GetSubgraphPropertiesQuery(
      Number.parseInt(projectId, 10),
      subgraphSystemId,
      'api-client',
    );
    const result =
      await this.queryBus.execute<Result<SubgraphPropertiesResponseDto>>(query);
    return toApiResult(result);
  }

  /**
   * Update container ID for all modules in a subgraph.
   */
  @Patch('/:subgraphSystemId/container-id')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiDocumentationWithExample({
    summary: 'Update container ID for all modules in a subgraph',
    description:
      'Updates all modules within the subgraph to the specified container. Creates a new container if it does not exist.',
    requestDto: UpdateSubgraphContainerIdRequestDto,
    responses: [
      {
        status: HttpStatus.NO_CONTENT,
        description: 'Container ID updated',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Capability or domain mismatch',
      },
    ],
  })
  async updateSubgraphContainerId(
    @Param('subgraphSystemId', ParseIntPipe) subgraphSystemId: number,
    @Body() dto: UpdateSubgraphContainerIdRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<void> {
    await this.commandBus.execute<void>(
      new UpdateSubgraphContainerIdCommand(
        subgraphSystemId,
        dto.oldContainerId,
        dto.newContainerId,
      ),
      session,
    );
  }

  /**
   * Get all configured VCPM parameters and their associated CKVs for a subgraph.
   */
  @Get('/:subgraphSystemId/vcpm-ckv')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @ApiDocumentationWithExample({
    summary:
      'Get all configured VCPM parameters and their associated CKVs for a subgraph',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'VCPM CKVs returned',
        dto: VcpmCkvResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph not found',
      },
    ],
  })
  async getVcpmCkv(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<VcpmCkvResponseDto>> {
    const query = new GetVcpmCkvQuery(
      Number.parseInt(projectId, 10),
      Number.parseInt(subgraphSystemId, 10),
      'api-client',
    );
    const result = await this.queryBus.execute<Result<VcpmCkvDto>>(query);
    return toApiResult(result);
  }

  /**
   * Get VCPM calibration data for a specific CKV.
   */
  @Get('/:subgraphSystemId/vcpm-ckv/:ckvSystemId/cal-data')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @ApiParam({
    name: 'ckvSystemId',
    required: true,
    type: String,
    description: 'CKV system ID',
  })
  @ApiQuery({
    name: 'param-system-ids',
    required: false,
    type: String,
    description: 'Comma-separated parameter system IDs',
  })
  @ApiDocumentationWithExample({
    summary: 'Get VCPM calibration data for a specific CKV',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Cal data returned',
        dto: CkvCalDataResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph or CKV not found',
      },
    ],
  })
  async getVcpmCalData(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
    @Param('ckvSystemId') ckvSystemId: string,
    @Query('param-system-ids') paramSystemIds?: string,
  ): Promise<ApiResult<CkvCalDataResponseDto>> {
    const query = new GetVcpmCalDataQuery(
      projectId,
      subgraphSystemId,
      ckvSystemId,
      'api-client',
      paramSystemIds,
    );
    const result = await this.queryBus.execute<Result<CkvCalDataDto>>(query);
    return toApiResult(result);
  }

  /**
   * Create a new VCPM CKV entry for a subgraph.
   */
  @Post('/:subgraphSystemId/vcpm-ckv')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  @ApiDocumentationWithExample({
    summary: 'Create a new VCPM CKV entry for a subgraph',
    requestDto: CreateVcpmCkvRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'CKV created',
        dto: CreateVcpmCkvResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to create CKV',
      },
    ],
  })
  async createVcpmCkv(
    @Param('subgraphSystemId', ParseIntPipe) subgraphSystemId: number,
    @Body() dto: CreateVcpmCkvRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<CreateVcpmCkvResponseDto>> {
    const result = await this.commandBus.execute<CreateVcpmCkvDto>(
      new CreateVcpmCkvCommand(subgraphSystemId, dto.ckv),
      session,
    );
    return toApiResult(Result.ok(result));
  }

  /**
   * Delete a VCPM CKV entry.
   */
  @Delete('/:subgraphSystemId/vcpm-ckv/:ckvSystemId')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @ApiParam({
    name: 'ckvSystemId',
    required: true,
    type: String,
    description: 'CKV system ID to delete',
  })
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiDocumentationWithExample({
    summary: 'Delete a VCPM CKV entry',
    responses: [
      {
        status: HttpStatus.NO_CONTENT,
        description: 'CKV deleted',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph or CKV not found',
      },
    ],
  })
  async deleteVcpmCkv(
    @Param('subgraphSystemId', ParseIntPipe) subgraphSystemId: number,
    @Param('ckvSystemId', ParseIntPipe) ckvSystemId: number,
    @ArcSession() session: ActiveSession,
  ): Promise<void> {
    await this.commandBus.execute<void>(
      new DeleteVcpmCkvCommand(subgraphSystemId, ckvSystemId),
      session,
    );
  }

  /**
   * Update VCPM calibration data for a specific CKV.
   */
  @Put('/:subgraphSystemId/vcpm-ckv/:ckvSystemId/cal-data')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: String,
    description: 'System id of a subgraph',
  })
  @ApiParam({
    name: 'ckvSystemId',
    required: true,
    type: String,
    description: 'CKV system ID',
  })
  @UseGuards(SessionGuard)
  @ApiDocumentationWithExample({
    summary: 'Update VCPM calibration data for a specific CKV',
    requestDto: UpdateSpfModuleCalDataRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Cal data updated',
        dto: CkvCalDataResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Subgraph or CKV not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to update cal data',
      },
    ],
  })
  async updateVcpmCalData(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId', ParseIntPipe) subgraphSystemId: number,
    @Param('ckvSystemId', ParseIntPipe) ckvSystemId: number,
    @Body() dto: UpdateSpfModuleCalDataRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<CkvCalDataResponseDto>> {
    const putResult = await this.commandBus.execute<
      Result<PutVcpmCalDataResult>
    >(
      new UpdateVcpmCalDataCommand(
        subgraphSystemId,
        ckvSystemId,
        dto.parameters.map(parameter => ({
          systemId: Number(parameter.systemId),
          elements:
            parameter.elements as unknown as ParameterElementSummaryDto[],
        })),
      ),
      session,
    );
    if (putResult.kind === RESULT_KIND.Fail) {
      return toApiResult(putResult as unknown as Result<CkvCalDataResponseDto>);
    }

    let data: CkvCalDataDto | undefined;
    if (putResult.data.succeededParamSystemIds.length > 0) {
      const query = new GetVcpmCalDataQuery(
        projectId,
        String(subgraphSystemId),
        String(ckvSystemId),
        'api-client',
        putResult.data.succeededParamSystemIds.join(','),
      );
      const readResult =
        await this.queryBus.execute<Result<CkvCalDataDto>>(query);
      data = readResult.kind !== RESULT_KIND.Fail ? readResult.data : undefined;
    }

    const issues = putResult.issues ?? [];
    const resultEnvelope =
      issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    return toApiResult(resultEnvelope);
  }

  /**
   * Get all usecases for a given subgraph system id.
   */
  @Get('/:subgraphSystemId/usecases')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: 'string',
    description: 'The system ID of the subgraph to get usecases for',
    example: 'subgraph-123',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all usecases for a given subgraph system id',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Usecases are returned successfully',
        dto: [UsecaseResponseDto],
        example: {
          className: 'UseCaseIdentifierCollectionExample',
        },
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
    ],
  })
  async getUsecasesForSubgraph(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<UsecaseResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting all usecases for project: ${projectId} and subgraph: ${subgraphSystemId}`,
    );
    throw new NotImplementedException(
      'getUsecasesForSubgraph is not implemented yet',
    );
  }

  /**
   * Get all components (modules, data links, control links) for a subgraph.
   */
  @Get('/:subgraphSystemId/components')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: 'string',
    description: 'The system ID of the subgraph',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all components for a subgraph',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Components returned successfully',
        dto: ComponentsResponseDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some components could not be retrieved (see errors array)',
        dto: ComponentsResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get components',
      },
    ],
  })
  async getComponentsForSubgraph(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<ComponentsResponseDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    const parsedSubgraphId = Number.parseInt(subgraphSystemId, 10);

    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }
    if (Number.isNaN(parsedSubgraphId)) {
      throw new BadRequestException(
        `Invalid subgraph system ID: ${subgraphSystemId}`,
      );
    }

    const query = new GetComponentsQuery(
      {type: COMPONENT_SCOPE_TYPE.Subgraph, systemId: parsedSubgraphId},
      parsedProjectId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<Result<CoreComponentCollectionDto>>(query);

    return toApiResult(result);
  }

  /**
   * Get all subgraph pairs where the given subgraph is source or destination.
   */
  @Get('/:subgraphSystemId/subgraph-pairs')
  @ApiParam({
    name: 'subgraphSystemId',
    required: true,
    type: 'string',
    description: 'The system ID of the subgraph',
    example: '12345',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all subgraph pairs for a subgraph (as source or destination)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Subgraph pairs returned successfully',
        dto: [SubgraphPairResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subgraph not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subgraph pairs',
      },
    ],
  })
  async getSubgraphPairs(
    @Param('projectId') projectId: string,
    @Param('subgraphSystemId') subgraphSystemId: string,
  ): Promise<ApiResult<SubgraphPairResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting subgraph pairs for project: ${projectId} and subgraph: ${subgraphSystemId}`,
    );
    throw new NotImplementedException(
      'getSubgraphPairs is not implemented yet',
    );
  }
}
