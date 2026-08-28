/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

// key-definition.controller.ts
import {
  Controller,
  Get,
  Delete,
  BadRequestException,
  NotImplementedException,
  Param,
  Query,
  HttpStatus,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiExtraModels,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {TagDefinitionResponseDto} from './dto/tag-definition-response.dto.js';
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../../common/interceptors/partial-success.interceptor.js';
import {toApiResult} from '../../../common/result/to-api-result.js';
import {KeyDefinitionResponseDto} from './dto/key-definition-response.dto.js';
import {
  QueryBus,
  GetAllKeyDefinitionsQuery,
  GetKeyDefinitionQuery,
  GetAllTagDefinitionsQuery,
  GetTagDefinitionQuery,
  type KeyDefinitionDto,
  type TagDefinitionDto,
  type Result,
} from '@arc/core';
import {AuthGuard} from '@nestjs/passport';
import {ClientId} from '../../../../../decorators/client-id.decorator.js';

@ApiTags('key-definition')
@Controller('arc-api/v1/projects')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(PartialSuccessInterceptor)
@ApiExtraModels(ApiResult, KeyDefinitionResponseDto)
@ApiExtraModels(ApiResult, TagDefinitionResponseDto)
export class KeyDefinitionController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':projectId/definitions/keys')
  @ApiOperation({
    summary: 'Return the list of key definitions',
    description: 'Return the list of key definitions based on project id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiQuery({
    name: 'keyDefinitionId',
    description: 'Filter by key definition id',
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
              items: {$ref: getSchemaPath(KeyDefinitionResponseDto)},
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.MULTI_STATUS,
    description:
      'Partial success — some key definitions could not be resolved (see errors array)',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'array',
              items: {$ref: getSchemaPath(KeyDefinitionResponseDto)},
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or key definition does not exist',
    type: ApiResult,
  })
  async getKeyDefinitions(
    @Param('projectId') projectId: string,
    @ClientId() clientId: string,
    @Query('keyDefinitionId') keyDefinitionId?: string,
  ): Promise<ApiResult<KeyDefinitionResponseDto[]>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    let parsedKeyId: number | undefined;
    if (keyDefinitionId !== undefined) {
      parsedKeyId = Number.parseInt(keyDefinitionId, 10);
      if (Number.isNaN(parsedKeyId)) {
        throw new BadRequestException(
          `Invalid key definition ID: ${keyDefinitionId}`,
        );
      }
    }

    const query = new GetAllKeyDefinitionsQuery(
      parsedProjectId,
      parsedKeyId,
      clientId,
    );

    const result =
      await this.queryBus.execute<Result<KeyDefinitionDto[]>>(query);
    return toApiResult(result);
  }

  @Get(':projectId/definitions/keys/:keySystemId')
  @ApiOperation({
    summary: 'Return key definition by key system id',
    description:
      'Return key definition based on project id and key definition system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
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
            data: {
              $ref: getSchemaPath(KeyDefinitionResponseDto),
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or key definition not found',
    type: ApiResult,
  })
  async getKeyDefinition(
    @Param('projectId') projectId: string,
    @Param('keySystemId') keySystemId: string,
    @ClientId() clientId: string,
  ): Promise<ApiResult<KeyDefinitionResponseDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const parsedKeySystemId = Number.parseInt(keySystemId, 10);
    if (Number.isNaN(parsedKeySystemId)) {
      throw new BadRequestException(`Invalid key system ID: ${keySystemId}`);
    }

    const query = new GetKeyDefinitionQuery(
      parsedProjectId,
      parsedKeySystemId,
      clientId,
    );

    const result = await this.queryBus.execute<Result<KeyDefinitionDto>>(query);
    return toApiResult(result);
  }

  @Delete(':projectId/definitions/keys/:keySystemId')
  @ApiOperation({
    summary: 'Delete key definition',
    description:
      'Delete key definition based on project id and key definition system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully deleted',
    type: ApiResult,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or key definition not found',
    type: ApiResult,
  })
  async deleteKeyDefinition(
    @Param('projectId') _projectId: string,
    @Param('keySystemId') _keySystemId: string,
  ): Promise<ApiResult<KeyDefinitionResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException(
      'deleteKeyDefinition is not implemented yet',
    );
  }

  @Get(':projectId/definitions/tags')
  @ApiOperation({
    summary: 'Return list of tag definitions',
    description: 'Return list of tag definitions based on project id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiQuery({
    name: 'tagDefinitionId',
    description: 'Filter by tag definition id',
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
                $ref: getSchemaPath(TagDefinitionResponseDto),
              },
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.MULTI_STATUS,
    description:
      'Partial success — some tag definitions could not be resolved (see errors array)',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'array',
              items: {
                $ref: getSchemaPath(TagDefinitionResponseDto),
              },
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or tag definition does not exist',
    type: ApiResult,
  })
  async getTagDefinitions(
    @Param('projectId') projectId: string,
    @ClientId() clientId: string,
    @Query('tagDefinitionId') tagDefinitionId?: string,
  ): Promise<ApiResult<TagDefinitionResponseDto[]>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    let parsedTagId: number | undefined;
    if (tagDefinitionId !== undefined) {
      parsedTagId = Number.parseInt(tagDefinitionId, 10);
      if (Number.isNaN(parsedTagId)) {
        throw new BadRequestException(
          `Invalid tag definition ID: ${tagDefinitionId}`,
        );
      }
    }

    const query = new GetAllTagDefinitionsQuery(
      parsedProjectId,
      parsedTagId,
      clientId,
    );

    const result =
      await this.queryBus.execute<Result<TagDefinitionDto[]>>(query);
    return toApiResult(result);
  }

  @Get(':projectId/definitions/tags/:tagSystemId')
  @ApiOperation({
    summary: 'Return tag definition by tag system id',
    description:
      'Return tag definition based on project id and tag definition system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
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
            data: {
              $ref: getSchemaPath(TagDefinitionResponseDto),
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or tag definition not found',
    type: ApiResult,
  })
  async getTagDefinition(
    @Param('projectId') projectId: string,
    @Param('tagSystemId') tagSystemId: string,
    @ClientId() clientId: string,
  ): Promise<ApiResult<TagDefinitionResponseDto>> {
    const parsedProjectId = Number.parseInt(projectId, 10);
    if (Number.isNaN(parsedProjectId)) {
      throw new BadRequestException(`Invalid project ID: ${projectId}`);
    }

    const parsedTagSystemId = Number.parseInt(tagSystemId, 10);
    if (Number.isNaN(parsedTagSystemId)) {
      throw new BadRequestException(`Invalid tag system ID: ${tagSystemId}`);
    }

    const query = new GetTagDefinitionQuery(
      parsedProjectId,
      parsedTagSystemId,
      clientId,
    );

    const result = await this.queryBus.execute<Result<TagDefinitionDto>>(query);
    return toApiResult(result);
  }

  @Delete(':projectId/definitions/tags/:tagSystemId')
  @ApiOperation({
    summary: 'Delete tag key definition',
    description:
      'Delete tag definition based on project id and tag definition system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Successfully deleted',
    type: ApiResult,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or tag definition not found',
    type: ApiResult,
  })
  async deleteTagKeyDefinition(
    @Param('projectId') _projectId: string,
    @Param('tagSystemId') _tagSystemId: string,
  ): Promise<ApiResult<TagDefinitionResponseDto>> {
    await Promise.resolve();
    throw new NotImplementedException(
      'deleteTagKeyDefinition is not implemented yet',
    );
  }
}
