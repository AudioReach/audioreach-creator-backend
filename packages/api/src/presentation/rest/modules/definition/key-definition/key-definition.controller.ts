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
  //UseGuards,
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
import {ValueDefinitionInfo} from './info/value-definition-info.js';
import {TagKeyDefinitionInfo} from './info/tag-key-definition-info.js';
import {TagValueDefinitionInfo} from './info/tag-value-definition-info.js';
import {SpecialKey} from './enums/special-key.enum.js';
import {
  QueryBus,
  GetAllKeyDefinitionsQuery,
  GetKeyDefinitionQuery,
  GetAllTagDefinitionsQuery,
  GetTagDefinitionQuery,
  type KeyDefinitionReadModel,
  type ValueDefinitionReadModel,
  type TagDefinitionReadModel,
  type Result,
} from '@arc/core';

@ApiTags('key-definition')
@Controller('arc-api/v1/projects')
//@UseGuards(AuthGuard('jwt'))
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
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<Result<KeyDefinitionReadModel[]>>(query);

    return toApiResult(result, data => data.map(k => this.mapKeyToDto(k)));
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
      'client-id', // TODO: get actual clientId from JWT
    );

    const key = await this.queryBus.execute<KeyDefinitionReadModel>(query);

    return {data: this.mapKeyToDto(key)};
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
      'client-id', // TODO: get actual clientId from JWT
    );

    const result =
      await this.queryBus.execute<Result<TagDefinitionReadModel[]>>(query);

    return toApiResult(result, data => data.map(t => this.mapTagToDto(t)));
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
      'client-id', // TODO: get actual clientId from JWT
    );

    const tag = await this.queryBus.execute<TagDefinitionReadModel>(query);

    return {data: this.mapTagToDto(tag)};
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

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Maps KeyDefinitionReadModel (key fields + embedded values) → KeyDefinitionResponseDto.
   */
  private mapKeyToDto(key: KeyDefinitionReadModel): KeyDefinitionResponseDto {
    const dto = new KeyDefinitionResponseDto();
    dto.systemId = String(key.systemId);
    dto.keyId = key.keyId;
    dto.name = key.name;
    dto.description = key.description;
    dto.enumMember = key.cHeaderAttributes?.enumMember ?? '';
    dto.enumName = key.cHeaderAttributes?.enumName ?? '';
    dto.isVoice = key.isVoice ?? false;
    dto.isDynamic = key.isDynamic ?? false;
    dto.isCalibrationKey = key.isCalibrationKey ?? false;
    dto.isGraphKey = key.isGraphKey ?? false;
    dto.specialKey = key.specialityKeyValue as SpecialKey | undefined;
    dto.calKeyEnumMember = key.cHeaderAttributes?.calKeyEnumMember;
    dto.graphKeyEnumMember = key.cHeaderAttributes?.graphKeyEnumMember;
    dto.values = key.values.map(v => this.mapValueToDto(v));
    return dto;
  }

  /**
   * Maps ValueDefinitionReadModel → ValueDefinitionInfo.
   */
  private mapValueToDto(value: ValueDefinitionReadModel): ValueDefinitionInfo {
    const dto = new ValueDefinitionInfo();
    dto.systemId = String(value.systemId);
    dto.valueId = value.valueId;
    dto.name = value.name;
    dto.description = value.description;
    dto.enumMember = value.enumMember ?? '';
    dto.specialValue = value.specialValue;
    return dto;
  }

  /**
   * Maps TagDefinitionReadModel (tag fields + embedded key definitions) → TagDefinitionResponseDto.
   */
  private mapTagToDto(tag: TagDefinitionReadModel): TagDefinitionResponseDto {
    const dto = new TagDefinitionResponseDto();
    dto.systemId = String(tag.systemId);
    dto.tagId = tag.tagId;
    dto.name = tag.name;
    dto.enumMember = tag.cHeaderEnumMember;
    dto.enumName = tag.cHeaderEnumName;
    dto.keyDefinitions = tag.keys.map(k => this.mapTagKeyToDto(k));
    return dto;
  }

  /**
   * Maps TagKeyDefinitionReadModel (link + embedded key definition) → TagKeyDefinitionInfo.
   */
  private mapTagKeyToDto(
    tagKey: TagDefinitionReadModel['keys'][number],
  ): TagKeyDefinitionInfo {
    const dto = new TagKeyDefinitionInfo();
    dto.systemId = String(tagKey.keyDefinition.systemId);
    dto.keyId = tagKey.keyDefinition.keyId;
    dto.name = tagKey.keyDefinition.name;
    dto.description = tagKey.keyDefinition.description;
    dto.cHeaderEnumValue = tagKey.cHeaderTagEnumMemberName ?? '';
    dto.values = tagKey.keyDefinition.values.map(v =>
      this.mapValueToTagValueDto(v),
    );
    return dto;
  }

  /**
   * Maps ValueDefinitionReadModel → TagValueDefinitionInfo (reduced shape — no
   * enumMember/specialValue, matching the existing TagValueDefinitionInfo DTO).
   */
  private mapValueToTagValueDto(
    value: ValueDefinitionReadModel,
  ): TagValueDefinitionInfo {
    const dto = new TagValueDefinitionInfo();
    dto.systemId = String(value.systemId);
    dto.valueId = value.valueId;
    dto.name = value.name;
    dto.description = value.description;
    return dto;
  }
}
