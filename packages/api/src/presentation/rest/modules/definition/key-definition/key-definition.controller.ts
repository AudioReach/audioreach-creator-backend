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
import {ApiTags, ApiParam, ApiExtraModels} from '@nestjs/swagger';
import {AuthGuard} from '@nestjs/passport';
import {ApiDocumentationWithExample} from '../../../common/swagger-doc/swagger.decorator.js';
import {KeyType} from '../../../common/enums/key-definition/key-type.enum.js';
import {ApiResult} from '../../../common/dto/api-response/api-result.dto.js';
import {CreateKeyDefinitionRequestDto} from './dto/request/create-key-definition-request.dto.js';
import {CreateValueDefinitionRequestDto} from './dto/request/create-value-definition-request.dto.js';
import {PatchKeyDefinitionRequestDto} from './dto/request/patch-key-definition-request.dto.js';
import {PatchValueDefinitionRequestDto} from './dto/request/patch-value-definition-request.dto.js';
import {GetKeyDefinitionsQueryDto} from './dto/request/get-key-definitions-query.dto.js';
import {KeyDefinitionResponseDto} from './dto/response/key-definition-response.dto.js';
import {ValueDefinitionResponseDto} from './dto/response/value-definition-response.dto.js';

@ApiTags('key-definitions')
@Controller('arc-api/v1/projects')
@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(ApiResult, KeyDefinitionResponseDto)
@ApiExtraModels(ApiResult, ValueDefinitionResponseDto)
export class KeyDefinitionController {
  // #region Key Definition

  // #region Read
  @Get(':projectId/key-definitions')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Return the list of key definitions',
    description:
      'Return the list of key definitions based on project id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/key-definitions\n' +
      'GET /arc-api/v1/projects/proj-001/key-definitions?keyDefinitionId=1\n' +
      'GET /arc-api/v1/projects/proj-001/key-definitions?keyType=CALIBRATION\n' +
      'GET /arc-api/v1/projects/proj-001/key-definitions?isVoice=true\n' +
      'GET /arc-api/v1/projects/proj-001/key-definitions?keyType=CALIBRATION&isVoice=true\n' +
      '```\n\n' +
      '**Optional Query Parameters:**\n' +
      '- `keyDefinitionId`: Filter results to a specific key definition by its id\n' +
      '- `keyType`: Filter by key type (CALIBRATION or GRAPH)\n' +
      '- `isVoice`: Filter by voice keys only (true/false)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully fetched information',
        dto: [KeyDefinitionResponseDto],
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description:
          'Invalid query parameters (e.g., invalid keyType or isVoice value)',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or key definition does not exist',
      },
    ],
  })
  async getKeyDefinitions(
    @Param('projectId') _projectId: string,
    @Query() _query: GetKeyDefinitionsQueryDto,
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

  @Get(':projectId/key-definitions/:keySystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Return key definition by key system id',
    description:
      'Return key definition based on project id and key definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'GET /arc-api/v1/projects/proj-001/key-definitions/key-sys-001\n' +
      '```',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Successfully fetched information',
        dto: KeyDefinitionResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid parameters',
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
  @Post(':projectId/key-definitions')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Create a new key definition',
    description:
      'Create a new key definition for the given project\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'POST /arc-api/v1/projects/proj-001/key-definitions\n' +
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

  @Post(':projectId/key-definitions/:keySystemId/values')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Add a value to a key definition',
    description:
      'Add a new value to an existing key definition\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'POST /arc-api/v1/projects/proj-001/key-definitions/key-sys-001/values\n' +
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
  @Patch(':projectId/key-definitions/:keySystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Update a key definition',
    description:
      'Partially update an existing key definition based on project id and key definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PATCH /arc-api/v1/projects/proj-001/key-definitions/key-sys-001\n' +
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
  @Delete(':projectId/key-definitions/:keySystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Delete key definition',
    description:
      'Delete key definition based on project id and key definition system id\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'DELETE /arc-api/v1/projects/proj-001/key-definitions/key-sys-001\n' +
      '```\n\n' +
      '**Response:**\n' +
      'Returns the deleted key definition data.\n' +
      'Returns 409 if the key definition is being used by other resources.',
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
      {
        status: HttpStatus.CONFLICT,
        description:
          'Key definition is being used by other resources and cannot be deleted until dependencies are removed',
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

  @Patch(':projectId/key-definitions/:keySystemId/values/:valueSystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
  })
  @ApiParam({
    name: 'valueSystemId',
    description: 'System id of value definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Update a value in a key definition',
    description:
      'Partially update an existing value in a key definition\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'PATCH /arc-api/v1/projects/proj-001/key-definitions/key-sys-001/values/val-sys-001\n' +
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

  @Delete(':projectId/key-definitions/:keySystemId/values/:valueSystemId')
  @ApiParam({
    name: 'projectId',
    description: 'Id of project',
    required: true,
  })
  @ApiParam({
    name: 'keySystemId',
    description: 'System id of key definition',
    required: true,
  })
  @ApiParam({
    name: 'valueSystemId',
    description: 'System id of value definition',
    required: true,
  })
  @ApiDocumentationWithExample({
    summary: 'Delete a value from a key definition',
    description:
      'Delete a specific value from an existing key definition\n\n' +
      '**Example Usage:**\n' +
      '```\n' +
      'DELETE /arc-api/v1/projects/proj-001/key-definitions/key-sys-001/values/val-sys-001\n' +
      '```\n\n' +
      '**Response:**\n' +
      'Returns the deleted value definition data.\n' +
      'Returns 409 if the value definition is being used by other resources.',
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
      {
        status: HttpStatus.CONFLICT,
        description:
          'Value definition is being used by other resources and cannot be deleted until dependencies are removed',
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
}
