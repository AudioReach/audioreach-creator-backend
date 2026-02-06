import {
  Controller,
  Delete,
  Get,
  HttpStatus,
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
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {SubgraphPropertyDefinitionDetailResponseDto} from './dto/subgraph-property-definition-detail-response.dto.js';
import {ContainerPropertyDefinitionDetailResponseDto} from './dto/container-property-definition-detail-response.dto.js';
import {ContainerPropertyDefinitionSummaryResponseDto} from './dto/container-property-definition-summary-response.dto.js';
import {SubgraphPropertyDefinitionSummaryResponseDto} from './dto/subgraph-property-definition-summary-response.dto.js';

@ApiTags('property-definition')
@Controller('arc-api/v1/projects')
@ApiExtraModels(ApiResult, SubgraphPropertyDefinitionDetailResponseDto)
@ApiExtraModels(ApiResult, SubgraphPropertyDefinitionSummaryResponseDto)
@ApiExtraModels(ApiResult, ContainerPropertyDefinitionDetailResponseDto)
@ApiExtraModels(ApiResult, ContainerPropertyDefinitionSummaryResponseDto)
export class PropertyDefinitionController {
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
    @Param('projectId') _projectId: string,
    @Query('propertyDefinitionId') _propertyDefinitionId?: string,
  ): Promise<ApiResult<SubgraphPropertyDefinitionSummaryResponseDto[]>> {
    // implement logic here
    await Promise.resolve();
    return new ApiResult<SubgraphPropertyDefinitionSummaryResponseDto[]>();
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
    @Param('projectId') _projectId: string,
    @Param('propertySystemId') _propertySystemId: string,
  ): Promise<ApiResult<SubgraphPropertyDefinitionDetailResponseDto>> {
    // implement logic here

    await Promise.resolve();
    return new ApiResult<SubgraphPropertyDefinitionDetailResponseDto>();
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
    status: HttpStatus.NO_CONTENT,
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
  ): Promise<ApiResult<null>> {
    // implement logic here

    await Promise.resolve();
    return new ApiResult<null>();
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
    @Param('projectId') _projectId: string,
    @Query('propertyDefinitionId') _propertyDefinitionId?: string,
  ): Promise<ApiResult<ContainerPropertyDefinitionSummaryResponseDto[]>> {
    // implement logic here
    await Promise.resolve();
    return new ApiResult<ContainerPropertyDefinitionSummaryResponseDto[]>();
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
    @Param('projectId') _projectId: string,
    @Param('propertySystemId') _propertySystemId: string,
  ): Promise<ApiResult<ContainerPropertyDefinitionDetailResponseDto>> {
    // implement logic here

    await Promise.resolve();
    return new ApiResult<ContainerPropertyDefinitionDetailResponseDto>();
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
    status: HttpStatus.NO_CONTENT,
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
  ): Promise<ApiResult<null>> {
    // implement logic here

    await Promise.resolve();
    return new ApiResult<null>();
  }
}
