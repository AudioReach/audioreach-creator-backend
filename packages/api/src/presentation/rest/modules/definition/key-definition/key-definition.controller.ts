/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

// key-definition.controller.ts
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
  ApiQuery,
  ApiBody,
  ApiExtraModels,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import {AuthGuard} from '@nestjs/passport';
import {ApiDocumentationWithExample} from '../../../common/swagger-doc/swagger.decorator.js';
import {KeyType} from '../../../common/enums/key-definition/key-type.enum.js';
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {CreateKeyDefinitionRequestDto} from './dto/request/create-key-definition-request.dto.js';
import {CreateTagDefinitionRequestDto} from './dto/request/create-tag-definition-request.dto.js';
import {CreateValueDefinitionRequestDto} from './dto/request/create-value-definition-request.dto.js';
import {PatchKeyDefinitionRequestDto} from './dto/request/patch-key-definition-request.dto.js';
import {PatchTagDefinitionRequestDto} from './dto/request/patch-tag-definition-request.dto.js';
import {PatchValueDefinitionRequestDto} from './dto/request/patch-value-definition-request.dto.js';
import {KeyDefinitionResponseDto} from './dto/response/key-definition-response.dto.js';
import {TagDefinitionResponseDto} from './dto/response/tag-definition-response.dto.js';
import {TagKeyDefinitionResponseDto} from './dto/response/tag-key-definition-response.dto.js';
import {ValueDefinitionResponseDto} from './dto/response/value-definition-response.dto.js';

@ApiTags('key-definition')
@Controller('arc-api/v1/projects')
@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(ApiResult, KeyDefinitionResponseDto)
@ApiExtraModels(ApiResult, TagDefinitionResponseDto)
@ApiExtraModels(ApiResult, TagKeyDefinitionResponseDto)
@ApiExtraModels(ApiResult, ValueDefinitionResponseDto)
export class KeyDefinitionController {
  // #region Key Definition

  // #region Read
  @Get(':projectId/definitions/keys')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiQuery({
    name: 'keyDefinitionId',
    description: 'Filter by key definition id',
    required: false,
    example: '1',
  })
  @ApiDocumentationWithExample({
    summary: 'Return the list of key definitions',
    description:
      'Return the list of key definitions based on project id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/definitions/keys\n' +
      'GET /arc-api/v1/projects/proj-001/definitions/keys?keyDefinitionId=1\n' +
      '```\n\n' +
      '**Optional Query Parameters:**\n' +
      '- `keyDefinitionId`: Filter results to a specific key definition by its id',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully fetched information',
        dto: [KeyDefinitionResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or key definition does not exist',
      },
    ],
  })
  async getKeyDefinitions(
    @Param('projectId') _projectId: string,
    @Query('keyDefinitionId') _keyDefinitionId?: string,
  ): Promise<ApiResult<KeyDefinitionResponseDto[]>> {
    await Promise.resolve();
    const mockKeyDefinition = new KeyDefinitionResponseDto();

    mockKeyDefinition.keyId = 1;
    mockKeyDefinition.name = 'SampleKey';
    mockKeyDefinition.description = 'A sample key definition';
    mockKeyDefinition.cHeaderAttribute = {
      enumValue: 'SAMPLE_KEY_ENUM_VALUE',
      enumName: 'SAMPLE_KEY_ENUM_NAME',
    };
    mockKeyDefinition.keyType = KeyType.Calibration;
    mockKeyDefinition.values = [];

    const result = new ApiResult<KeyDefinitionResponseDto[]>();
    result.success = true;
    result.message = 'Successfully fetched key definitions';
    result.data = [mockKeyDefinition];
    return result;
  }

  @Get(':projectId/definitions/keys/:keySystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
    example: 'key-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Return key definition by key system id',
    description:
      'Return key definition based on project id and key definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/definitions/keys/key-sys-001\n' +
      '```',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully fetched information',
        dto: KeyDefinitionResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or key definition not found',
      },
    ],
  })
  async getKeyDefinition(
    @Param('projectId') _projectId: string,
    @Param('keySystemId') _keySystemId: string,
  ): Promise<ApiResult<KeyDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<KeyDefinitionResponseDto>();
  }
  // #endregion Read

  // #region Create
  @Post(':projectId/definitions/keys')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Create a new key definition',
    description:
      'Create a new key definition for the given project\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'POST /arc-api/v1/projects/proj-001/definitions/keys\n' +
      '```\n\n' +
      '**Request Body (optional):**\n' +
      'All fields in the request body are optional. The behavior depends on what is provided:\n\n' +
      '**Without request body:**\n' +
      '- A key definition is created with system-generated defaults\n' +
      '- `keyId`, `name`, `description`, `keyType`, `cHeaderAttribute` will be empty or default values\n' +
      '- No values will be associated\n\n' +
      '**With request body:**\n' +
      '- `keyId`: Unique numeric identifier for the key (optional — auto-assigned if omitted)\n' +
      '- `name`: Human-readable name for the key definition\n' +
      '- `description`: Optional description of the key\n' +
      '- `keyType`: Type of key (e.g. `Calibration`, `Tag`)\n' +
      '- `cHeaderAttribute`: C-header enum metadata (`enumValue`, `enumName`)\n' +
      '- `values`: Array of initial value definitions to associate with the key\n\n' +
      '**Conflict:**\n' +
      'Returns 409 if a key definition with the same `keyId` already exists in the project.',
    requestDto: CreateKeyDefinitionRequestDto,
    requestDtoDescription:
      'Key definition data to create (all fields optional)',
    requestRequired: false,
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Successfully created key definition',
        dto: KeyDefinitionResponseDto,
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
        description: 'Key definition with the same keyId already exists',
      },
    ],
  })
  async createKeyDefinition(
    @Param('projectId') _projectId: string,
    @Body() _createKeyDefinitionRequestDto?: CreateKeyDefinitionRequestDto,
  ): Promise<ApiResult<KeyDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<KeyDefinitionResponseDto>();
  }

  @Post(':projectId/definitions/keys/:keySystemId/values')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
    example: 'key-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Add a value to a key definition',
    description:
      'Add a new value to an existing key definition\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'POST /arc-api/v1/projects/proj-001/definitions/keys/key-sys-001/values\n' +
      '```\n\n' +
      '**Request Body (optional):**\n' +
      'All fields in the request body are optional:\n\n' +
      '**Without request body:**\n' +
      '- A value is created with system-generated defaults\n' +
      '- `valueId`, `name`, `description` will be empty or default values\n\n' +
      '**With request body:**\n' +
      '- `valueId`: Unique numeric identifier for the value (optional — auto-assigned if omitted)\n' +
      '- `name`: Human-readable name for the value\n' +
      '- `description`: Optional description of the value\n\n' +
      '**Conflict:**\n' +
      'Returns 409 if a value with the same `valueId` already exists under the key definition.',
    requestDto: CreateValueDefinitionRequestDto,
    requestDtoDescription: 'Value definition data to add (all fields optional)',
    requestRequired: false,
    responses: [
      {
        status: HttpStatus.CREATED,
        description: 'Successfully added value to key definition',
        dto: ValueDefinitionResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or key definition not found',
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input data',
      },
      {
        status: HttpStatus.CONFLICT,
        description: 'Value with the same valueId already exists',
      },
    ],
  })
  async createValueDefinition(
    @Param('projectId') _projectId: string,
    @Param('keySystemId') _keySystemId: string,
    @Body() _createValueDefinitionRequestDto?: CreateValueDefinitionRequestDto,
  ): Promise<ApiResult<ValueDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<ValueDefinitionResponseDto>();
  }
  // #endregion Create

  // #region Update
  @Patch(':projectId/definitions/keys/:keySystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
    example: 'key-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Update a key definition',
    description:
      'Partially update an existing key definition based on project id and key definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PATCH /arc-api/v1/projects/proj-001/definitions/keys/key-sys-001\n' +
      '```\n\n' +
      '**Request Body:**\n' +
      'All fields are optional — only the provided fields will be updated:\n' +
      '- `keyId`: Update the numeric key identifier\n' +
      '- `name`: Update the human-readable name\n' +
      '- `description`: Update the description\n' +
      '- `keyType`: Update the key type (e.g. `Calibration`, `Tag`)\n' +
      '- `cHeaderAttribute`: Update C-header enum metadata (`enumValue`, `enumName`)\n' +
      '- `values`: Update the associated value definitions',
    requestDto: PatchKeyDefinitionRequestDto,
    requestDtoDescription:
      'Fields to update on the key definition (all optional)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully updated key definition',
        dto: KeyDefinitionResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or key definition not found',
      },
    ],
  })
  async updateKeyDefinition(
    @Param('projectId') _projectId: string,
    @Param('keySystemId') _keySystemId: string,
    @Body() _patchKeyDefinitionRequestDto: PatchKeyDefinitionRequestDto,
  ): Promise<ApiResult<KeyDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<KeyDefinitionResponseDto>();
  }
  // #endregion Update

  // #region Delete
  @Delete(':projectId/definitions/keys/:keySystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
    example: 'key-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Delete key definition',
    description:
      'Delete key definition based on project id and key definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'DELETE /arc-api/v1/projects/proj-001/definitions/keys/key-sys-001\n' +
      '```\n\n' +
      '**Response:**\n' +
      'Returns the deleted key definition data.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully deleted key definition',
        dto: KeyDefinitionResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or key definition not found',
      },
    ],
  })
  async deleteKeyDefinition(
    @Param('projectId') _projectId: string,
    @Param('keySystemId') _keySystemId: string,
  ): Promise<ApiResult<KeyDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<KeyDefinitionResponseDto>();
  }

  @Patch(':projectId/definitions/keys/:keySystemId/values/:valueSystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
    example: 'key-sys-001',
  })
  @ApiParam({
    name: 'valueSystemId',
    description: 'System id of value definition',
    required: true,
    example: 'val-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Update a value in a key definition',
    description:
      'Partially update an existing value in a key definition\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PATCH /arc-api/v1/projects/proj-001/definitions/keys/key-sys-001/values/val-sys-001\n' +
      '```\n\n' +
      '**Request Body:**\n' +
      'All fields are optional — only the provided fields will be updated:\n' +
      '- `valueId`: Update the numeric value identifier\n' +
      '- `name`: Update the human-readable name\n' +
      '- `description`: Update the description',
    requestDto: PatchValueDefinitionRequestDto,
    requestDtoDescription:
      'Fields to update on the value definition (all optional)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully updated value',
        dto: ValueDefinitionResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input data',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project, key definition or value not found',
      },
    ],
  })
  async updateValueDefinition(
    @Param('projectId') _projectId: string,
    @Param('keySystemId') _keySystemId: string,
    @Param('valueSystemId') _valueSystemId: string,
    @Body() _patchValueDefinitionRequestDto: PatchValueDefinitionRequestDto,
  ): Promise<ApiResult<ValueDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<ValueDefinitionResponseDto>();
  }

  @Delete(':projectId/definitions/keys/:keySystemId/values/:valueSystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
    example: 'key-sys-001',
  })
  @ApiParam({
    name: 'valueSystemId',
    description: 'System id of value definition',
    required: true,
    example: 'val-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Delete a value from a key definition',
    description:
      'Delete a specific value from an existing key definition\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'DELETE /arc-api/v1/projects/proj-001/definitions/keys/key-sys-001/values/val-sys-001\n' +
      '```\n\n' +
      '**Response:**\n' +
      'Returns the deleted value definition data.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully deleted value',
        dto: ValueDefinitionResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project, key definition or value not found',
      },
    ],
  })
  async deleteValueDefinition(
    @Param('projectId') _projectId: string,
    @Param('keySystemId') _keySystemId: string,
    @Param('valueSystemId') _valueSystemId: string,
  ): Promise<ApiResult<ValueDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<ValueDefinitionResponseDto>();
  }
  // #endregion Delete

  // #endregion Key Definition

  // #region Tag Definition

  // #region Read
  @Get(':projectId/definitions/tags')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiQuery({
    name: 'tagDefinitionId',
    description: 'Filter by tag definition id',
    required: false,
    example: '1',
  })
  @ApiDocumentationWithExample({
    summary: 'Return list of tag definitions',
    description:
      'Return list of tag definitions based on project id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/definitions/tags\n' +
      'GET /arc-api/v1/projects/proj-001/definitions/tags?tagDefinitionId=1\n' +
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
        status: HttpStatus.NOT_FOUND,
        description: 'Project or tag definition does not exist',
      },
    ],
  })
  async getTagDefinitions(
    @Param('projectId') _projectId: string,
    @Query('tagDefinitionId') _tagDefinitionId?: string,
  ): Promise<ApiResult<TagDefinitionResponseDto[]>> {
    await Promise.resolve();
    return new ApiResult<TagDefinitionResponseDto[]>();
  }

  @Get(':projectId/definitions/tags/:tagSystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
    example: 'tag-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Return tag definition by tag system id',
    description:
      'Return tag definition based on project id and tag definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/definitions/tags/tag-sys-001\n' +
      '```',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully fetched information',
        dto: TagDefinitionResponseDto,
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
  @Post(':projectId/definitions/tags')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Create a new tag definition',
    description:
      'Create a new tag definition for the given project\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'POST /arc-api/v1/projects/proj-001/definitions/tags\n' +
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

  @Post(':projectId/definitions/tags/:tagSystemId/keys')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
    example: 'tag-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Add key definitions to a tag',
    description:
      'Add one or more existing key definitions to a tag based on project id and tag definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'POST /arc-api/v1/projects/proj-001/definitions/tags/tag-sys-001/keys\n' +
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
        dto: [TagKeyDefinitionResponseDto],
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
          example: ['key-sys-001', 'key-sys-002'],
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
              items: {$ref: getSchemaPath(TagKeyDefinitionResponseDto)},
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
  ): Promise<ApiResult<TagKeyDefinitionResponseDto[]>> {
    await Promise.resolve();
    return new ApiResult<TagKeyDefinitionResponseDto[]>();
  }
  // #endregion Create

  // #region Update
  @Patch(':projectId/definitions/tags/:tagSystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
    example: 'tag-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Update a tag definition',
    description:
      'Partially update an existing tag definition based on project id and tag definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PATCH /arc-api/v1/projects/proj-001/definitions/tags/tag-sys-001\n' +
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
  @Delete(':projectId/definitions/tags/:tagSystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
    example: 'tag-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Delete tag definition',
    description:
      'Delete tag definition based on project id and tag definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'DELETE /arc-api/v1/projects/proj-001/definitions/tags/tag-sys-001\n' +
      '```\n\n' +
      '**Response:**\n' +
      'Returns the deleted tag definition data.',
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
    ],
  })
  async deleteTagDefinition(
    @Param('projectId') _projectId: string,
    @Param('tagSystemId') _tagSystemId: string,
  ): Promise<ApiResult<TagDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<TagDefinitionResponseDto>();
  }

  @Delete(':projectId/definitions/tags/:tagSystemId/keys/:keySystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
    example: 'proj-001',
  })
  @ApiParam({
    name: 'tagSystemId',
    description: 'System id of tag definition',
    required: true,
    example: 'tag-sys-001',
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
    example: 'key-sys-001',
  })
  @ApiDocumentationWithExample({
    summary: 'Delete a key definition from a tag',
    description:
      'Delete a specific key definition from an existing tag definition\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'DELETE /arc-api/v1/projects/proj-001/definitions/tags/tag-sys-001/keys/key-sys-001\n' +
      '```\n\n' +
      '**Response:**\n' +
      'Returns the removed tag-key association data.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully deleted key definition from tag',
        dto: TagKeyDefinitionResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project, tag definition or key definition not found',
      },
    ],
  })
  async deleteTagKeyDefinitionFromTag(
    @Param('projectId') _projectId: string,
    @Param('tagSystemId') _tagSystemId: string,
    @Param('keySystemId') _keySystemId: string,
  ): Promise<ApiResult<TagKeyDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<TagKeyDefinitionResponseDto>();
  }
  // #endregion Delete

  // #endregion Tag Definition
}
