/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {AuthGuard} from '@nestjs/passport';
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
import {SpfModuleDefinitionResponseDto} from './dto/spf-module-definition-response.dto.js';
import {DriverModuleDefinitionResponseDto} from './dto/driver-module-definition-response.dto.js';
import {SpfCustomModuleMetadataDto} from './dto/spf-custom-module-metadata.dto.js';
import {SpfCustomModuleMetadataResponseDto} from './dto/spf-custom-module-metadata-response.dto.js';
import {DeleteSpfCustomModuleMetadataResponseDto} from './dto/delete-spf-custom-module-metadata-response.dto.js';
import {UpdateSpfCustomModuleMetadataRequestDto} from './dto/update-spf-custom-module-metadata-request.dto.js';
import {PatchSpfModuleDefinitionRequestDto} from './dto/patch-spf-module-definition-request.dto.js';
import {ParameterDefinitionSummaryDto} from './dto/parameter-definition-summary-response.dto.js';
import {
  DefinitionConfigElementDto,
  DefinitionConfigElementArrayDto,
  DefinitionStructDto,
  DefinitionStructArrayDto,
} from './dto/definition-element.dto.js';

@ApiTags('module-definition')
@Controller('arc-api/v1/projects')
@UseGuards(AuthGuard('jwt'))
@ApiExtraModels(ApiResult, SpfModuleDefinitionResponseDto)
@ApiExtraModels(ApiResult, ParameterDefinitionSummaryDto)
@ApiExtraModels(ApiResult, DriverModuleDefinitionResponseDto)
@ApiExtraModels(ApiResult, SpfCustomModuleMetadataDto)
@ApiExtraModels(ApiResult, SpfCustomModuleMetadataResponseDto)
@ApiExtraModels(ApiResult, DeleteSpfCustomModuleMetadataResponseDto)
@ApiExtraModels(ApiResult, UpdateSpfCustomModuleMetadataRequestDto)
@ApiExtraModels(
  DefinitionConfigElementDto,
  DefinitionConfigElementArrayDto,
  DefinitionStructDto,
  DefinitionStructArrayDto,
)
export class ModuleDefinitionController {
  @Get('/:projectId/spf-module-definitions')
  @ApiOperation({
    summary: 'Return the list of spf module definitions',
    description:
      'Return the list of spf module definitions based on project id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiQuery({
    name: 'processorId',
    description: 'Filter by processor id',
    required: false,
  })
  @ApiQuery({
    name: 'moduleDefinitionId',
    description: 'Filter by module definition id',
    required: false,
  })
  @ApiQuery({
    name: 'parameterId',
    description: 'Filter by parameter id',
    required: false,
  })
  @ApiQuery({
    name: 'includeCustomData',
    description:
      'Include custom module data in the response. Defaults to false.\n\n' +
      'To get the schema for custom module data, first call GET /arc-api/v1/projects/:projectId/spf-custom-module-schema',
    required: false,
    type: Boolean,
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
              items: {$ref: getSchemaPath(SpfModuleDefinitionResponseDto)},
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description:
      'Project, processor, module definition or parameter does not exist',
    type: ApiResult,
  })
  async getAllSpfModuleDefinitions(
    @Param('projectId') _projectId: string,
    @Query('processorId') _processorId?: string,
    @Query('moduleDefinitionId') _moduleDefinitionId?: string,
    @Query('parameterId') _parameterId?: string,
    @Query('includeCustomData') _includeCustomData: boolean = false,
  ): Promise<ApiResult<SpfModuleDefinitionResponseDto[]>> {
    await Promise.resolve();
    return new ApiResult<SpfModuleDefinitionResponseDto[]>();
  }

  @Get('/:projectId/spf-module-definitions/:moduleSystemId')
  @ApiOperation({
    summary: 'Return spf module definition  by module system id',
    description:
      'Return spf module definition based on project id and module definition system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of module',
    required: true,
  })
  @ApiQuery({
    name: 'includeCustomData',
    description:
      'Include custom module data in the response. Defaults to false.\n\n' +
      'To get the schema for custom module data, first call GET /arc-api/v1/projects/:projectId/spf-custom-module-schema',
    required: false,
    type: Boolean,
  })
  @ApiResponse({
    description: 'Successfully fetched information',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(SpfModuleDefinitionResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or module not found',
    type: ApiResult,
  })
  async getSpfModuleDefinition(
    @Param('projectId') _projectId: string,
    @Param('moduleSystemId') _moduleSystemId: string,
    @Query('includeCustomData') _includeCustomData: boolean = false,
  ): Promise<ApiResult<SpfModuleDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<SpfModuleDefinitionResponseDto>();
  }

  @Patch('/:projectId/spf-module-definitions/:moduleSystemId')
  @ApiOperation({
    summary: 'Partially update a spf module definition',
    description:
      'Partially update a spf module definition based on project id and module system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of module',
    required: true,
  })
  @ApiQuery({
    name: 'includeCustomData',
    description:
      'Include custom module data in the response. Defaults to false.\n\n' +
      'To get the schema for custom module data, first call GET /arc-api/v1/projects/:projectId/spf-custom-module-schema',
    required: false,
    type: Boolean,
  })
  @ApiResponse({
    description: 'Successfully updated spf module definition',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(SpfModuleDefinitionResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or module not found',
    type: ApiResult,
  })
  async patchSpfModuleDefinition(
    @Param('projectId') _projectId: string,
    @Param('moduleSystemId') _moduleSystemId: string,
    @Body() _patchSpfModuleDefinitionDto: PatchSpfModuleDefinitionRequestDto,
    @Query('includeCustomData') _includeCustomData: boolean = false,
  ): Promise<ApiResult<SpfModuleDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<SpfModuleDefinitionResponseDto>();
  }

  @Get(
    '/:projectId/spf-module-definitions/:moduleSystemId/custom-module-metadata',
  )
  @ApiOperation({
    summary: 'Return custom module metadata for a spf module',
    description:
      'Return custom module metadata based on project id and module system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of module',
    required: true,
  })
  @ApiResponse({
    description: 'Successfully fetched custom module metadata',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(SpfCustomModuleMetadataResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Module is not a custom module',
    type: ApiResult,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or module not found',
    type: ApiResult,
  })
  async getSpfCustomModuleMetadata(
    @Param('projectId') _projectId: string,
    @Param('moduleSystemId') _moduleSystemId: string,
  ): Promise<ApiResult<SpfCustomModuleMetadataResponseDto>> {
    await Promise.resolve();
    return new ApiResult<SpfCustomModuleMetadataResponseDto>();
  }

  @Put(
    '/:projectId/spf-module-definitions/:moduleSystemId/custom-module-metadata',
  )
  @ApiOperation({
    summary: 'Update custom module metadata for a spf module',
    description:
      'Update custom module metadata based on project id and module system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of module',
    required: true,
  })
  @ApiResponse({
    description: 'Successfully updated custom module metadata',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {$ref: getSchemaPath(SpfCustomModuleMetadataResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request body or module is not a custom module',
    type: ApiResult,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or module not found',
    type: ApiResult,
  })
  async updateSpfCustomModuleMetadata(
    @Param('projectId') _projectId: string,
    @Param('moduleSystemId') _moduleSystemId: string,
    @Body()
    _updateSpfCustomModuleMetadataDto: UpdateSpfCustomModuleMetadataRequestDto,
  ): Promise<ApiResult<SpfCustomModuleMetadataResponseDto>> {
    await Promise.resolve();
    return new ApiResult<SpfCustomModuleMetadataResponseDto>();
  }

  @Delete(
    '/:projectId/spf-module-definitions/:moduleSystemId/custom-module-metadata',
  )
  @ApiOperation({
    summary: 'Delete custom module metadata for a spf module',
    description:
      'Delete custom module metadata based on project id and module system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of module',
    required: true,
  })
  @ApiResponse({
    description: 'Successfully deleted custom module metadata',
    status: HttpStatus.OK,
    schema: {
      allOf: [
        {$ref: getSchemaPath(ApiResult)},
        {
          properties: {
            data: {
              $ref: getSchemaPath(DeleteSpfCustomModuleMetadataResponseDto),
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Module is not a custom module',
    type: ApiResult,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or module not found',
    type: ApiResult,
  })
  async deleteSpfCustomModuleMetadata(
    @Param('projectId') _projectId: string,
    @Param('moduleSystemId') _moduleSystemId: string,
  ): Promise<ApiResult<DeleteSpfCustomModuleMetadataResponseDto>> {
    await Promise.resolve();
    return new ApiResult<DeleteSpfCustomModuleMetadataResponseDto>();
  }

  @Get('/:projectId/driver-module-definitions')
  @ApiOperation({
    summary: 'Return the list of driver module definitions',
    description:
      'Return the list of driver module definitions based on project id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiQuery({
    name: 'moduleDefinitionId',
    description: 'Filter by module definition id',
    required: false,
  })
  @ApiQuery({
    name: 'parameterId',
    description: 'Filter by parameter id',
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
              items: {$ref: getSchemaPath(DriverModuleDefinitionResponseDto)},
            },
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project, module definition or parameter does not exist',
    type: ApiResult,
  })
  async getAllDriverModuleDefinitions(
    @Param('projectId') _projectId: string,
    @Query('moduleDefinitionId') _moduleDefinitionId?: string,
    @Query('parameterId') _parameterId?: string,
  ): Promise<ApiResult<DriverModuleDefinitionResponseDto[]>> {
    await Promise.resolve();
    return new ApiResult<DriverModuleDefinitionResponseDto[]>();
  }

  @Get('/:projectId/driver-module-definitions/:moduleSystemId')
  @ApiOperation({
    summary: 'Return driver module definition by module system id',
    description:
      'Return driver module definition based on project id and module definition system id',
  })
  @ApiParam({name: 'projectId', description: 'Id of project', required: true})
  @ApiParam({
    name: 'moduleSystemId',
    description: 'System identifier of driver module',
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
            data: {$ref: getSchemaPath(DriverModuleDefinitionResponseDto)},
          },
        },
      ],
    },
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Project or driver module not found',
    type: ApiResult,
  })
  async getDriverModuleDefinition(
    @Param('projectId') _projectId: string,
    @Param('moduleSystemId') _moduleSystemId: string,
  ): Promise<ApiResult<DriverModuleDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<DriverModuleDefinitionResponseDto>();
  }

  // @Get(':projectId/definitions/modules/spf/:moduleSystemId/parameters')
  // @ApiOperation({ summary: 'Return param definitions for a spf module', description: 'Return param definitions based on project id and spf module definition system id' })
  // @ApiParam({ name: 'projectId', description: 'Id of project', required: true })
  // @ApiParam({ name: 'moduleSystemId', description: 'System identifier of spf module', required: true })
  // @ApiResponse({
  //   description: 'Successfully fetched information',
  //   status: HttpStatus.OK,
  //   schema: {
  //     allOf: [
  //       { $ref: getSchemaPath(ApiResult) },
  //       {
  //         properties: {
  //           data: { type: 'array', items: { $ref: getSchemaPath(ParameterDefinitionDetailDto) } },
  //         },
  //       },
  //     ],
  //   },
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Project or module not found',
  //   type: ApiResult,
  // })
  // async getSpfParamDefinitions(@Param('projectId') _projectId: string, @Param('moduleSystemId') _moduleSystemId: string): Promise<ApiResult<ParameterDefinitionDetailDto[]>> {
  //   await Promise.resolve();
  //   return new ApiResult<ParameterDefinitionDetailDto[]>();
  // }

  // @Get(':projectId/definitions/modules/spf/:moduleSystemId/parameters/:paramSystemId')
  // @ApiOperation({ summary: 'Return param definition by parameter system id', description: 'Return param definition based on project id, spf module definition system id and parameter system id' })
  // @ApiParam({ name: 'projectId', description: 'Id of project', required: true })
  // @ApiParam({ name: 'moduleSystemId', description: 'System identifier of spf module', required: true })
  // @ApiParam({ name: 'paramSystemId', description: 'System identifier of parameter', required: true })
  // @ApiResponse({
  //   description: 'Successfully fetched information',
  //   status: HttpStatus.OK,
  //   schema: {
  //     allOf: [
  //       { $ref: getSchemaPath(ApiResult) },
  //       {
  //         properties: {
  //           data: { $ref: getSchemaPath(ParameterDefinitionDetailDto) },
  //         },
  //       },
  //     ],
  //   },
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Project, module or param not found',
  //   type: ApiResult,
  // })
  // async getSpfParamDefinition(@Param('projectId') _projectId: string, @Param('moduleSystemId') _moduleSystemId: string, @Param('paramSystemId') _paramSystemId: string): Promise<ApiResult<ParameterDefinitionDetailDto>> {
  //   await Promise.resolve();
  //   return new ApiResult<ParameterDefinitionDetailDto>();
  // }

  // @Get(':projectId/definitions/modules/driver/:moduleSystemId/parameters')
  // @ApiOperation({ summary: 'Return param definitions for a driver module', description: 'Return param definitions based on project id and driver module definition system id' })
  // @ApiParam({ name: 'projectId', description: 'Id of project', required: true })
  // @ApiParam({ name: 'moduleSystemId', description: 'System identifier of driver module', required: true })
  // @ApiResponse({
  //   description: 'Successfully fetched information',
  //   status: HttpStatus.OK,
  //   schema: {
  //     allOf: [
  //       { $ref: getSchemaPath(ApiResult) },
  //       {
  //         properties: {
  //           data: { type: 'array', items: { $ref: getSchemaPath(ParameterDefinitionDetailDto) } },
  //         },
  //       },
  //     ],
  //   },
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Project or driver module not found',
  //   type: ApiResult,
  // })
  // async getDriverParamDefinitions(@Param('projectId') _projectId: string, @Param('moduleSystemId') _moduleSystemId: string): Promise<ApiResult<ParameterDefinitionDetailDto[]>> {
  //   await Promise.resolve();
  //   return new ApiResult<ParameterDefinitionDetailDto[]>();
  // }

  // @Get(':projectId/definitions/modules/driver/:moduleSystemId/parameters/:paramSystemId')
  // @ApiOperation({ summary: 'Return param definition by parameter system id', description: 'Return param definition based on project id, driver module definition system id and parameter system id' })
  // @ApiParam({ name: 'projectId', description: 'Id of project', required: true })
  // @ApiParam({ name: 'moduleSystemId', description: 'System identifier of driver module', required: true })
  // @ApiParam({ name: 'paramSystemId', description: 'System identifier of parameter', required: true })
  // @ApiResponse({
  //   description: 'Successfully fetched information',
  //   status: HttpStatus.OK,
  //   schema: {
  //     allOf: [
  //       { $ref: getSchemaPath(ApiResult) },
  //       {
  //         properties: {
  //           data: { $ref: getSchemaPath(ParameterDefinitionDetailDto) },
  //         },
  //       },
  //     ],
  //   },
  // })
  // @ApiResponse({
  //   status: HttpStatus.NOT_FOUND,
  //   description: 'Project, driver module or param not found',
  //   type: ApiResult,
  // })
  // async getDriverParamDefinition(@Param('projectId') _projectId: string, @Param('moduleSystemId') _moduleSystemId: string, @Param('paramSystemId') _paramSystemId: string): Promise<ApiResult<ParameterDefinitionDetailDto>> {
  //   await Promise.resolve();
  //   return new ApiResult<ParameterDefinitionDetailDto>();
  // }
}
