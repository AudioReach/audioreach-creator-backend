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
  UseGuards,
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
  type ContainerPropertyDefinitionDto,
  type ContainerPropertyDefinitionSummaryDto,
  type SubgraphPropertyDefinitionDto,
  type SubgraphPropertyDefinitionSummaryDto,
  type Result,
} from '@arc/core';
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {toApiResult} from '../../../common/result/to-api-result.js';
import {SubgraphPropertyDefinitionResponseDto} from './dto/subgraph-property-definition-response.dto.js';
import {ContainerPropertyDefinitionResponseDto} from './dto/container-property-definition-response.dto.js';
import {ContainerPropertyDefinitionSummaryResponseDto} from './dto/container-property-definition-summary-response.dto.js';
import {SubgraphPropertyDefinitionSummaryResponseDto} from './dto/subgraph-property-definition-summary-response.dto.js';
import {AuthGuard} from '@nestjs/passport';
import {ClientId} from '../../../../../decorators/client-id.decorator.js';

@ApiTags('property-definition')
@Controller('arc-api/v1/projects')
@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(ApiResult, SubgraphPropertyDefinitionResponseDto)
@ApiExtraModels(ApiResult, SubgraphPropertyDefinitionSummaryResponseDto)
@ApiExtraModels(ApiResult, ContainerPropertyDefinitionResponseDto)
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
    @ClientId() clientId: string,
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
      clientId,
    );

    const result =
      await this.queryBus.execute<
        Result<SubgraphPropertyDefinitionSummaryDto[]>
      >(query);

    return toApiResult(result);
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
              $ref: getSchemaPath(SubgraphPropertyDefinitionResponseDto),
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
    @ClientId() clientId: string,
  ): Promise<ApiResult<SubgraphPropertyDefinitionResponseDto>> {
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
      clientId,
    );

    const property =
      await this.queryBus.execute<SubgraphPropertyDefinitionDto>(query);

    return {data: property};
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
  ): Promise<ApiResult<SubgraphPropertyDefinitionResponseDto>> {
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
    @ClientId() clientId: string,
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
      clientId,
    );

    const result =
      await this.queryBus.execute<
        Result<ContainerPropertyDefinitionSummaryDto[]>
      >(query);

    return toApiResult(result);
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
              $ref: getSchemaPath(ContainerPropertyDefinitionResponseDto),
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
    @ClientId() clientId: string,
  ): Promise<ApiResult<ContainerPropertyDefinitionResponseDto>> {
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
      clientId,
    );

    const property =
      await this.queryBus.execute<ContainerPropertyDefinitionDto>(query);

    return {data: property};
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
  ): Promise<ApiResult<ContainerPropertyDefinitionResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException(
      'deleteContainerPropertyDefinition is not implemented yet',
    );
  }
}
