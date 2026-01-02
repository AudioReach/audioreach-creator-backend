import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import {ApiTags, ApiParam} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {NewDataLinkRequest} from './dto/data-link-request.dto.js';
import {DataLinkDto} from './dto/data-link.dto.js';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';

/**
 * Controller to support all data link related APIs for usecase design.
 * Provides data link related APIs for usecase design.
 */
@ApiTags('data-links')
@Controller('arc-api/v1/projects/:projectId/data-links')
@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class DataLinkController extends BaseController {
  constructor() {
    super();
  }

  /**
   * Get data-links.
   */
  @Post('get')
  @ApiDocumentationWithExample({
    summary: 'Get data-links for provided systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of data-link system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [DataLinkDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Some data-link(s) are not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get data-link(s)',
      },
    ],
  })
  async getDataLinks(
    @Param('projectId') projectId: string,
    @Body() dataLinkSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<DataLinkDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting data-links in project ${projectId}: ${JSON.stringify(dataLinkSystemIds)}`,
    );
    throw new HttpException(
      'Data-links retrieval functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  /**
   * Add a new data link
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Add a new data link',
    requestDto: NewDataLinkRequest,

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: [DataLinkDto],
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to add a data-link',
      },
    ],
  })
  async addDataConnection(
    @Body() dataLinkRequest: NewDataLinkRequest,
  ): Promise<ApiResult<DataLinkDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log('addDataConnection request received:', dataLinkRequest); // Placeholder usage to satisfy linter
    throw new HttpException(
      'This functionality is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
