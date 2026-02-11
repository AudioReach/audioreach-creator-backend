/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

// key-definition.controller.ts
import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  HttpStatus,
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
import {AuthGuard} from '@nestjs/passport';
import {KeyDefinitionResponseDto} from './dto/key-definition-response.dto.js';

@ApiTags('key-definition')
@Controller('arc-api/v1/projects')
@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(ApiResult, KeyDefinitionResponseDto)
@ApiExtraModels(ApiResult, TagDefinitionResponseDto)
export class KeyDefinitionController {
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
    status: HttpStatus.NOT_FOUND,
    description: 'Project or key definition does not exist',
    type: ApiResult,
  })
  async getKeyDefinitions(
    @Param('projectId') _projectId: string,
    @Query('keyDefinitionId') _keyDefinitionId?: string,
  ): Promise<ApiResult<KeyDefinitionResponseDto[]>> {
    // implement logic here
    await Promise.resolve();
    return new ApiResult<KeyDefinitionResponseDto[]>();
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
    @Param('projectId') _projectId: string,
    @Param('keySystemId') _keySystemId: string,
  ): Promise<ApiResult<KeyDefinitionResponseDto>> {
    // implement logic here
    await Promise.resolve();
    return new ApiResult<KeyDefinitionResponseDto>();
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
    status: HttpStatus.NO_CONTENT,
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
  ): Promise<ApiResult<null>> {
    // implement logic here
    await Promise.resolve();
    return new ApiResult<null>();
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
    status: HttpStatus.NOT_FOUND,
    description: 'Project or tag definition does not exist',
    type: ApiResult,
  })
  async getTagDefinitions(
    @Param('projectId') _projectId: string,
    @Query('tagDefinitionId') _tagDefinitionId?: string,
  ): Promise<ApiResult<TagDefinitionResponseDto[]>> {
    // implement logic here
    await Promise.resolve();
    return new ApiResult<TagDefinitionResponseDto[]>();
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
    @Param('projectId') _projectId: string,
    @Param('tagSystemId') _tagSystemId: string,
  ): Promise<ApiResult<TagDefinitionResponseDto>> {
    // implement logic here
    await Promise.resolve();
    return new ApiResult<TagDefinitionResponseDto>();
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
    status: HttpStatus.NO_CONTENT,
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
  ): Promise<ApiResult<null>> {
    // implement logic here
    await Promise.resolve();
    return new ApiResult<null>();
  }
}
