/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpStatus,
  NotImplementedException,
  Param,
  Query,
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
  GetAllContainerPropertyDefinitionsQuery,
  GetContainerPropertyDefinitionQuery,
  GetAllSubgraphPropertyDefinitionsQuery,
  GetSubgraphPropertyDefinitionQuery,
  type PropertyDefinitionSummaryReadModel,
  type PropertyDefinitionReadModel,
  type SubgraphPropertyDefinitionSummaryReadModel,
  type SubgraphPropertyDefinitionReadModel,
  type Result,
} from '@arc/core';
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {toApiResult} from '../../../common/result/to-api-result.js';
import {SubgraphPropertyDefinitionDetailResponseDto} from './dto/subgraph-property-definition-detail-response.dto.js';
import {ContainerPropertyDefinitionDetailResponseDto} from './dto/container-property-definition-detail-response.dto.js';
import {ContainerPropertyDefinitionSummaryResponseDto} from './dto/container-property-definition-summary-response.dto.js';
import {SubgraphPropertyDefinitionSummaryResponseDto} from './dto/subgraph-property-definition-summary-response.dto.js';
import {PropertyType} from './enums/property-type.enum.js';

@ApiTags('property-definition')
@Controller('arc-api/v1/projects')
@ApiExtraModels(ApiResult, SubgraphPropertyDefinitionDetailResponseDto)
@ApiExtraModels(ApiResult, SubgraphPropertyDefinitionSummaryResponseDto)
@ApiExtraModels(ApiResult, ContainerPropertyDefinitionDetailResponseDto)
@ApiExtraModels(ApiResult, ContainerPropertyDefinitionSummaryResponseDto)
export class PropertyDefinitionController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':projectId/definitions/subgraph/properties')
  @ApiOperation({
    summary: 'Return the list of subgraph property definitions',
    description:
      'Return the list of subgraph property definitions based on project id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiQuery({
    name: 'propertyDefinitionId',
    description: 'Filter by property definition id',
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
              items: {
                $ref: getSchemaPath(
                  SubgraphPropertyDefinitionSummaryResponseDto,
                ),
              },
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or property definition does not exist',
    type: ApiResult,
  })
  async getSubgraphPropertyDefinitions(
    @Param('projectId') projectId: string,
    @Query('propertyDefinitionId') propertyDefinitionId?: string,
  ): Promise<ApiResult<SubgraphPropertyDefinitionSummaryResponseDto[]>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    let parsedPropertyDefinitionId: number | undefined;
    if (propertyDefinitionId !== undefined) {
      parsedPropertyDefinitionId = Number.parseInt(propertyDefinitionId, 10);
      if (Number.isNaN(parsedPropertyDefinitionId)) {
        throw new BadRequestException(
          `Invalid property definition ID: ${propertyDefinitionId}`,
        );
      }
    }

    const query = new GetAllSubgraphPropertyDefinitionsQuery(
      parsedProjectId,
      parsedPropertyDefinitionId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<
        Result<SubgraphPropertyDefinitionSummaryReadModel[]>
      >(query);

    return toApiResult(result, data =>
      data.map(p => this.mapToSubgraphSummaryDto(p)),
    );
  }

  @Get(':projectId/definitions/subgraph/properties/:propertySystemId')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'propertySystemId',
    description: 'System id of subgraph property',
    required: true,
  })
  @ApiOperation({
    summary: 'Return subgraph property definition by property system id',
    description:
      'Return subgraph property definition based on project id and property definition system id',
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
              $ref: getSchemaPath(SubgraphPropertyDefinitionDetailResponseDto),
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or subgraph property not found',
    type: ApiResult,
  })
  async getSubgraphPropertyDefinition(
    @Param('projectId') projectId: string,
    @Param('propertySystemId') propertySystemId: string,
  ): Promise<ApiResult<SubgraphPropertyDefinitionDetailResponseDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const parsedPropertySystemId = Number.parseInt(propertySystemId, 10);
    if (Number.isNaN(parsedPropertySystemId)) {
      throw new BadRequestException(
        `Invalid property system ID: ${propertySystemId}`,
      );
    }

    const query = new GetSubgraphPropertyDefinitionQuery(
      parsedProjectId,
      parsedPropertySystemId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const property =
      await this.queryBus.execute<SubgraphPropertyDefinitionReadModel>(query);

    return {data: this.mapToSubgraphDetailDto(property)};
  }

  @Delete(':projectId/definitions/subgraph/properties/:propertySystemId')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'propertySystemId',
    description: 'System id of subgraph property',
    required: true,
  })
  @ApiOperation({
    summary: 'Delete subgraph property definition',
    description:
      'Delete subgraph property definition based on project id and property definition system id',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully deleted',
    type: ApiResult,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or subgraph property not found',
    type: ApiResult,
  })
  async deleteSpfSubgraphPropertyDefinition(
    @Param('projectId') _projectId: string,
    @Param('propertySystemId') _propertySystemId: string,
  ): Promise<ApiResult<SubgraphPropertyDefinitionDetailResponseDto>> {
    // implement logic here
    await Promise.resolve();
    throw new NotImplementedException(
      'deleteSpfSubgraphPropertyDefinition is not implemented yet',
    );
  }

  @Get(':projectId/definitions/container/properties')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiQuery({
    name: 'propertyDefinitionId',
    description: 'Filter by property definition id',
    required: false,
  })
  @ApiOperation({
    summary: 'Return the list of container property definitions',
    description:
      'Return the list of container property definitions based on project id',
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
              items: {
                $ref: getSchemaPath(
                  ContainerPropertyDefinitionSummaryResponseDto,
                ),
              },
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or property definition does not exist',
    type: ApiResult,
  })
  async getContainerPropertyDefinitions(
    @Param('projectId') projectId: string,
    @Query('propertyDefinitionId') propertyDefinitionId?: string,
  ): Promise<ApiResult<ContainerPropertyDefinitionSummaryResponseDto[]>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    let parsedPropertyDefinitionId: number | undefined;
    if (propertyDefinitionId !== undefined) {
      parsedPropertyDefinitionId = Number.parseInt(propertyDefinitionId, 10);
      if (Number.isNaN(parsedPropertyDefinitionId)) {
        throw new BadRequestException(
          `Invalid property definition ID: ${propertyDefinitionId}`,
        );
      }
    }

    const query = new GetAllContainerPropertyDefinitionsQuery(
      parsedProjectId,
      parsedPropertyDefinitionId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<Result<PropertyDefinitionSummaryReadModel[]>>(
        query,
      );

    return toApiResult(result, data => data.map(p => this.mapToSummaryDto(p)));
  }

  @Get(':projectId/definitions/container/properties/:propertySystemId')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'propertySystemId',
    description: 'System id of container property',
    required: true,
  })
  @ApiOperation({
    summary: 'Return container property definition by container system id',
    description:
      'Return container property definition based on project id and property definition system id',
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
              $ref: getSchemaPath(ContainerPropertyDefinitionDetailResponseDto),
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or container property not found',
    type: ApiResult,
  })
  async getContainerPropertyDefinition(
    @Param('projectId') projectId: string,
    @Param('propertySystemId') propertySystemId: string,
  ): Promise<ApiResult<ContainerPropertyDefinitionDetailResponseDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const parsedPropertySystemId = Number.parseInt(propertySystemId, 10);
    if (Number.isNaN(parsedPropertySystemId)) {
      throw new BadRequestException(
        `Invalid property system ID: ${propertySystemId}`,
      );
    }

    const query = new GetContainerPropertyDefinitionQuery(
      parsedProjectId,
      parsedPropertySystemId,
      'client-id', // TODO: get actual clientId from JWT
    );

    const property =
      await this.queryBus.execute<PropertyDefinitionReadModel>(query);

    return {data: this.mapToDetailDto(property)};
  }

  @Delete(':projectId/definitions/container/properties/:propertySystemId')
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'propertySystemId',
    description: 'System id of container property',
    required: true,
  })
  @ApiOperation({
    summary: 'Delete container property definition',
    description:
      'Delete container property definition based on project id and property definition system id',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully deleted',
    type: ApiResult,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or container property not found',
    type: ApiResult,
  })
  async deleteContainerPropertyDefinition(
    @Param('projectId') _projectId: string,
    @Param('propertySystemId') _propertySystemId: string,
  ): Promise<ApiResult<ContainerPropertyDefinitionDetailResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException(
      'deleteContainerPropertyDefinition is not implemented yet',
    );
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private mapToSummaryDto(
    m: PropertyDefinitionSummaryReadModel,
  ): ContainerPropertyDefinitionSummaryResponseDto {
    const dto = new ContainerPropertyDefinitionSummaryResponseDto();
    dto.systemId = String(m.systemId);
    dto.propertyId = m.propertyId;
    dto.name = m.name;
    dto.description = m.description ?? '';
    dto.type = m.propertyType as unknown as PropertyType;
    return dto;
  }

  private mapToDetailDto(
    m: PropertyDefinitionReadModel,
  ): ContainerPropertyDefinitionDetailResponseDto {
    const dto = new ContainerPropertyDefinitionDetailResponseDto();
    dto.systemId = String(m.systemId);
    dto.propertyId = m.propertyId;
    dto.name = m.name;
    dto.description = m.description ?? '';
    dto.type = m.propertyType as unknown as PropertyType;
    return dto;
  }

  private mapToSubgraphSummaryDto(
    m: SubgraphPropertyDefinitionSummaryReadModel,
  ): SubgraphPropertyDefinitionSummaryResponseDto {
    const dto = new SubgraphPropertyDefinitionSummaryResponseDto();
    dto.systemId = String(m.systemId);
    dto.propertyId = m.propertyId;
    dto.name = m.name;
    dto.description = m.description ?? '';
    dto.type = m.propertyType as unknown as PropertyType;
    dto.isVoice = m.isVoice;
    return dto;
  }

  private mapToSubgraphDetailDto(
    m: SubgraphPropertyDefinitionReadModel,
  ): SubgraphPropertyDefinitionDetailResponseDto {
    const dto = new SubgraphPropertyDefinitionDetailResponseDto();
    dto.systemId = String(m.systemId);
    dto.propertyId = m.propertyId;
    dto.name = m.name;
    dto.description = m.description ?? '';
    dto.type = m.propertyType as unknown as PropertyType;
    dto.isVoice = m.isVoice;
    return dto;
  }
}
