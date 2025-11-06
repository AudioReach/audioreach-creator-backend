import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {ApiTags, ApiParam} from '@nestjs/swagger';
import {BaseController} from '../common/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {ContainerDto, ContainerPropertiesDto} from './dto/container.dto.js';
import {SystemIdsRequestDto} from '../common/dtos/index.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';

/**
 * Controller to support all container related APIs for usecase design.
 * Provides container related APIs for usecase design.
 */
@ApiTags('containers')
@Controller('arcapi/v1/projects/:projectId/containers')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class ContainerController extends BaseController {
  constructor() {
    super();
  }

  /**
   * Get containers.
   */
  @Post('get')
  @ApiDocumentationWithExample({
    summary: 'Get containers for provided systemIds',
    requestDto: SystemIdsRequestDto,

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [ContainerDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Some container(s) are not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get container(s)',
      },
    ],
  })
  async getContainers(
    @Param('projectId') projectId: string,
    @Body() request: SystemIdsRequestDto,
  ): Promise<ApiResult<ContainerDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting containers in project ${projectId}: ${JSON.stringify(request)}`,
    );
    throw new HttpException(
      'Containers retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Get all property data for a container.
   */
  @Get(':containerSystemId/properties')
  @ApiParam({
    name: 'containerSystemId',
    required: true,
    type: String,
    description: 'System id of a container',
  })
  @ApiDocumentationWithExample({
    summary: 'Get all property data for a container',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: ContainerPropertiesDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Container is not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get container properties',
      },
    ],
  })
  async getContainerProperties(
    @Param('projectId') projectId: string,
    @Param('containerSystemId') containerSystemId: string,
  ): Promise<ApiResult<ContainerPropertiesDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting properties in project ${projectId} for container ${containerSystemId}`,
    );
    throw new HttpException(
      'Container properties retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
