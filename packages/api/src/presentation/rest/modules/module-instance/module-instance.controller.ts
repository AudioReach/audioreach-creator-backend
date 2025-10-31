import { Controller, Post, Get, Body, Param, HttpStatus, HttpException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiExtraModels, ApiParam } from '@nestjs/swagger';
import { BaseController } from '../common/base.controller.js';
import { AuthGuard } from '@nestjs/passport';
import { ModuleInstanceDto, ModuleInstancePropertiesDto } from './dto/module-instance.dto.js';
import { SystemIdsRequestDto } from '../common/dtos/index.js';
import { BaseModuleInstanceRequest, DetailedModuleInstanceRequest, CloneModuleInstanceRequest } from './dto/module-instance-request.dto.js';
import { ApiDocumentationWithExample } from '../../common/swagger-doc/swagger.decorator.js';
import { ApiResult } from "../../common/dtos/api-response.dto.js";

/**
 * Controller to support all module related APIs for usecase design
 * Provides module related APIs for usecase design.
 */
@ApiTags('module-instances')
@Controller('arcapi/v1/projects/:projectId/modules-instance')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345'
})
@ApiExtraModels(ModuleInstanceDto, BaseModuleInstanceRequest, DetailedModuleInstanceRequest, CloneModuleInstanceRequest)
export class ModuleInstanceController extends BaseController {
  constructor() {
    super();
  }

  /**
   * Get module instance.
   */
  @Post('get')
  @ApiDocumentationWithExample({
    summary: 'Get module instances for provided systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of module instance system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [ModuleInstanceDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Some module instances are not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get module instances',
      }
    ]
  })
  async getModuleInstances(
    @Param('projectId') projectId: string,
    @Body() moduleInstanceSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<ModuleInstanceDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(`Getting module instances in project ${projectId}: ${JSON.stringify(moduleInstanceSystemIds)}`);
    throw new HttpException(
      'module instances retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED
    );
  }

  /**
   * Create a new module instance for a given module id and processor id.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create a new module instance for a given module id',
    requestDto: BaseModuleInstanceRequest,
    requestDtoExample: {
      className: 'NewModuleInstanceRequestExample'
    },
    responses: [
      {
        status: HttpStatus.OK,
        description: 'New created module information',
        dto: ModuleInstanceDto,
        example: {
          className: 'ModuleInstanceDTOExample'
        }
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid input',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to add a new module',
      }
    ]
  })
  async addModuleInstance(
    @Param('projectId') projectId: string,
    @Body() request: BaseModuleInstanceRequest
  ): Promise<ApiResult<ModuleInstanceDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log('addModuleInstance request received for projectId:', projectId, 'with request:', request); // Placeholder usage to satisfy linter
    throw new HttpException(
      'This functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED
    );
  }

  /**
   * Get all property data for a module instance (subgraph, container, subsystem, module).
   */
  @Get(':moduleInstanceSystemId/properties')
  @ApiParam({ name: 'moduleInstanceSystemId', required: true, type: String, description: 'System id of a module instance' })
  @ApiDocumentationWithExample({
    summary: 'Get all property data for a module instance',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: ModuleInstancePropertiesDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Module instance is not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get module instance properties',
      }
    ]
  })
  async getModuleInstanceProperties(
    @Param('projectId') projectId: string,
    @Param('moduleInstanceSystemId') moduleInstanceSystemId: string
  ): Promise<ApiResult<ModuleInstancePropertiesDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(`Getting properties in project ${projectId} for module instance ${moduleInstanceSystemId}`);
    throw new HttpException(
      'Module instance properties retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED
    );
  }
}
