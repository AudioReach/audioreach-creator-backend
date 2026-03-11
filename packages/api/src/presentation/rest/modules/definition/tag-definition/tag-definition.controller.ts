/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Get,
  Delete,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiParam,
  ApiBody,
  ApiExtraModels,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {AuthGuard} from '@nestjs/passport';
import {ApiDocumentationWithExample} from '../../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {CreateTagDefinitionRequestDto} from './dto/request/create-tag-definition-request.dto.js';
import {GetTagDefinitionsQueryDto} from './dto/request/get-tag-definitions-query.dto.js';
import {TagDefinitionResponseDto} from './dto/response/tag-definition-response.dto.js';
import {TagDefinitionKeyResponseDto} from './dto/response/tag-definition-key-response.dto.js';
import {PatchTagDefinitionRequestDto} from './dto/request/patch-tag-definition-request.dto.js';

@ApiTags('tag-definitions')
@Controller('arc-api/v1/projects')
@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(ApiResult, TagDefinitionResponseDto)
@ApiExtraModels(ApiResult, TagDefinitionKeyResponseDto)
export class TagDefinitionController {
  // #region Read
  @Get(':projectId/tag-definitions')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Return list of tag definitions',
    description:
      'Return list of tag definitions based on project id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/tag-definitions\n' +
      'GET /arc-api/v1/projects/proj-001/tag-definitions?tagDefinitionId=1\n' +
      '```\n\n' +
      '**Optional Query Parameters:**\n' +
      '- `tagDefinitionId`: Filter results to a specific tag definition by its id',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully fetched information',
        dto: [TagDefinitionResponseDto],
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid query parameters',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or tag definition does not exist',
      },
    ],
  })
  async getTagDefinitions(
    @Param('projectId') _projectId: string,
    @Query() _query: GetTagDefinitionsQueryDto,
  ): Promise<ApiResult<TagDefinitionResponseDto[]>> {
    await Promise.resolve();
    return new ApiResult<TagDefinitionResponseDto[]>();
  }

  @Get(':projectId/tag-definitions/:tagSystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Return tag definition by tag system id',
    description:
      'Return tag definition based on project id and tag definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/tag-definitions/tag-sys-001\n' +
      '```',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully fetched information',
        dto: TagDefinitionResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid parameters',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or tag definition not found',
      },
    ],
  })
  async getTagDefinition(
    @Param('projectId') _projectId: string,
    @Param('tagSystemId') _tagSystemId: string,
  ): Promise<ApiResult<TagDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<TagDefinitionResponseDto>();
  }
  // #endregion Read

  // #region Create
  @Post(':projectId/tag-definitions')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Create a new tag definition',
    description:
      'Create a new tag definition for the given project\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'POST /arc-api/v1/projects/proj-001/tag-definitions\n' +
      '```\n\n' +
      '**Request Body (optional):**\n' +
      'All fields in the request body are optional:\n\n' +
      '**Without request body:**\n' +
      '- A tag definition is created with system-generated defaults\n' +
      '- `tagId`, `name`, `description` will be empty or default values\n\n' +
      '**With request body:**\n' +
      '- `tagId`: Unique numeric identifier for the tag (optional — auto-assigned if omitted)\n' +
      '- `name`: Human-readable name for the tag definition\n' +
      '- `description`: Optional description of the tag\n\n' +
      '**Conflict:**\n' +
      'Returns 409 if a tag definition with the same `tagId` already exists in the project.',
    requestDto: CreateTagDefinitionRequestDto,
    requestDtoDescription:
      'Tag definition data to create (all fields optional)',
    requestRequired: false,
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Successfully created tag definition',
        dto: TagDefinitionResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project does not exist',
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input data',
      },
      {
        status: HttpStatus.CONFLICT,
        description: 'Tag definition with the same tagId already exists',
      },
    ],
  })
  async createTagDefinition(
    @Param('projectId') _projectId: string,
    @Body() _createTagDefinitionRequestDto?: CreateTagDefinitionRequestDto,
  ): Promise<ApiResult<TagDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<TagDefinitionResponseDto>();
  }

  @Post(':projectId/tag-definitions/:tagSystemId/keys')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Add key definitions to a tag',
    description:
      'Add one or more existing key definitions to a tag based on project id and tag definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'POST /arc-api/v1/projects/proj-001/tag-definitions/tag-sys-001/keys\n' +
      '```\n\n' +
      '**Request Body (required):**\n' +
      '- `keySystemIds`: Array of existing key definition system ids to associate with the tag\n\n' +
      '**Example request body:**\n' +
      '```json\n' +
      '{ "keySystemIds": ["key-sys-001", "key-sys-002"] }\n' +
      '```\n\n' +
      '**Partial Success (207):**\n' +
      'If some system ids are invalid or already associated, the successfully added keys are returned in `data`.\n' +
      'The `message` field describes which ids failed and why.',
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Successfully added all key definitions to tag',
        dto: [TagDefinitionKeyResponseDto],
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or tag definition not found',
      },
    ],
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['keySystemIds'],
      properties: {
        keySystemIds: {
          type: 'array',
          items: {type: 'string'},
          description:
            'List of system ids of key definitions to add to the tag',
        },
      },
    },
  })
  @ApiResponse({
    status: 207,
    description:
      'Partially fulfilled - successfully added keys are returned in data, message field describes which systemIds are invalid or already exist',
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              type: 'array',
              items: {$ref: getSchemaPath(TagDefinitionKeyResponseDto)},
            },
          },
        },
      ],
    },
  })
  async createTagKeyDefinition(
    @Param('projectId') _projectId: string,
    @Param('tagSystemId') _tagSystemId: string,
    @Body('keySystemIds') _keySystemIds: string[],
  ): Promise<ApiResult<TagDefinitionKeyResponseDto[]>> {
    await Promise.resolve();
    return new ApiResult<TagDefinitionKeyResponseDto[]>();
  }
  // #endregion Create

  // #region Update
  @Patch(':projectId/tag-definitions/:tagSystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Update a tag definition',
    description:
      'Partially update an existing tag definition based on project id and tag definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PATCH /arc-api/v1/projects/proj-001/tag-definitions/tag-sys-001\n' +
      '```\n\n' +
      '**Request Body:**\n' +
      'All fields are optional — only the provided fields will be updated:\n' +
      '- `tagId`: Update the numeric tag identifier\n' +
      '- `name`: Update the human-readable name\n' +
      '- `description`: Update the description',
    requestDto: PatchTagDefinitionRequestDto,
    requestDtoDescription:
      'Fields to update on the tag definition (all optional)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully updated tag definition',
        dto: TagDefinitionResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or tag definition not found',
      },
    ],
  })
  async updateTagDefinition(
    @Param('projectId') _projectId: string,
    @Param('tagSystemId') _tagSystemId: string,
    @Body() _patchTagDefinitionRequestDto: PatchTagDefinitionRequestDto,
  ): Promise<ApiResult<TagDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<TagDefinitionResponseDto>();
  }
  // #endregion Update

  // #region Delete
  @Delete(':projectId/tag-definitions/:tagSystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Delete tag definition',
    description:
      'Delete tag definition based on project id and tag definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'DELETE /arc-api/v1/projects/proj-001/tag-definitions/tag-sys-001\n' +
      '```\n\n' +
      '**Response:**\n' +
      'Returns the deleted tag definition data.\n' +
      'Returns 409 if the tag definition is being used by other resources.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully deleted tag definition',
        dto: TagDefinitionResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or tag definition not found',
      },
      {
        status: HttpStatus.CONFLICT,
        description:
          'Tag definition is being used by other resources and cannot be deleted until dependencies are removed',
      },
    ],
  })
  async deleteTagDefinition(
    @Param('projectId') _projectId: string,
    @Param('tagSystemId') _tagSystemId: string,
  ): Promise<ApiResult<TagDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<TagDefinitionResponseDto>();
  }

  @Delete(':projectId/tag-definitions/:tagSystemId/keys/:keySystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Delete a key definition from a tag',
    description:
      'Delete a specific key definition from an existing tag definition\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'DELETE /arc-api/v1/projects/proj-001/tag-definitions/tag-sys-001/keys/key-sys-001\n' +
      '```\n\n' +
      '**Response:**\n' +
      'Returns the removed tag-key association data.\n' +
      'Returns 409 if the key definition association is being used by other resources.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully deleted key definition from tag',
        dto: TagDefinitionKeyResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project, tag definition or key definition not found',
      },
      {
        status: HttpStatus.CONFLICT,
        description:
          'Key definition association is being used by other resources and cannot be deleted until dependencies are removed',
      },
    ],
  })
  async deleteTagKeyDefinitionFromTag(
    @Param('projectId') _projectId: string,
    @Param('tagSystemId') _tagSystemId: string,
    @Param('keySystemId') _keySystemId: string,
  ): Promise<ApiResult<TagDefinitionKeyResponseDto>> {
    await Promise.resolve();
    return new ApiResult<TagDefinitionKeyResponseDto>();
  }
  // #endregion Delete
}
