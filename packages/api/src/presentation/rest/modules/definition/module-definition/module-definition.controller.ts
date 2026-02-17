/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Get,
  HttpStatus,
  Param,
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
@ApiExtraModels(
  DefinitionConfigElementDto,
  DefinitionConfigElementArrayDto,
  DefinitionStructDto,
  DefinitionStructArrayDto,
)
export class ModuleDefinitionController {
  @Get('/:projectId/definitions/modules/spf')
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
  ): Promise<ApiResult<SpfModuleDefinitionResponseDto[]>> {
    await Promise.resolve();
    return new ApiResult<SpfModuleDefinitionResponseDto[]>();
  }

  @Get('/:projectId/definitions/modules/spf/:moduleSystemId')
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
  ): Promise<ApiResult<SpfModuleDefinitionResponseDto>> {
    await Promise.resolve();
    return new ApiResult<SpfModuleDefinitionResponseDto>();
  }

  @Get('/:projectId/definitions/modules/driver')
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

  @Get('/:projectId/definitions/modules/driver/:moduleSystemId')
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
