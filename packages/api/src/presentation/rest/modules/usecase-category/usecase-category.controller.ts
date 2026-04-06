/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  Post,
  Patch,
  Delete,
  //  UseGuards,
  HttpStatus,
  HttpException,
  Param,
  Body,
} from '@nestjs/common';
import {ApiTags, ApiExtraModels, ApiParam} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {CreateUsecaseCategoryRequestDto} from './dto/request/create-usecase-category-request.dto.js';
import {UpdateUsecaseCategoryRequestDto} from './dto/request/update-usecase-category-request.dto.js';
import {UsecaseCategoryResponseDto} from './dto/response/usecase-category-response.dto.js';
import {DeleteUsecaseCategoryResponseDto} from './dto/response/delete-usecase-category-response.dto.js';
//import {AuthGuard} from '@nestjs/passport';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';

/**
 * Controller to support all usecase category related APIs
 */
@ApiTags('usecase-categories')
@Controller('arc-api/v1/projects/:projectId/usecase-categories')
//@UseGuards(AuthGuard('jwt'))
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
})
@ApiExtraModels(UsecaseCategoryResponseDto, DeleteUsecaseCategoryResponseDto)
export class UseCaseCategoryController extends BaseController {
  constructor() {
    super();
  }

  //#region CREATE

  //#region Create usecase category

  /**
   * Create a new usecase category.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create a new usecase category',
    description:
      'Creates a new usecase category with the specified name and associated usecases.\n\n' +
      '**Request Body:**\n' +
      '- `name` (required): Name of the category. Must be unique among all category names.\n' +
      '- `usecaseSystemIds` (required): Array of usecase system identifiers to associate with this category\n' +
      '- `sortKeySystemIds` (optional): Array of key system identifiers to define sort order for usecases. The provided sortKeySystemIds must be equal to the union of all key system IDs present across all usecases in the category.\n\n' +
      '**Response:**\n' +
      'Returns the created category with:\n' +
      '- `systemId`: Unique system identifier of the category\n' +
      '- `name`: Name of the category (unique among all category names)\n' +
      '- `changeInfo`: Change information (changeType, changeId, changeStatus)\n' +
      '- `usecases`: Array of usecase summaries associated with this category',
    requestDto: CreateUsecaseCategoryRequestDto,
    responses: [
      {
        status: HttpStatus.CREATED,
        description:
          'Usecase category created successfully with all usecases added',
        dto: UsecaseCategoryResponseDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Usecase category created but some usecases failed to be added (partial success)',
        dto: UsecaseCategoryResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description:
          'Invalid request data (e.g., keySystemIds not equal to the union of all usecase keys)',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'All usecases not found',
      },
      {
        status: HttpStatus.CONFLICT,
        description: 'Category name already exists',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Failed to create usecase category',
      },
    ],
  })
  async createUsecaseCategory(
    @Param('projectId') projectId: string,
    @Body() createCategoryDto: CreateUsecaseCategoryRequestDto,
  ): Promise<ApiResult<UsecaseCategoryResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Creating usecase category for project:',
      projectId,
      'with data:',
      createCategoryDto,
    );
    throw new HttpException(
      'This API endpoint is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  //#endregion

  //#endregion

  //#region UPDATE

  //#region Update usecase category

  /**
   * Update an existing usecase category.
   */
  @Patch(':usecaseCategorySystemId')
  @ApiDocumentationWithExample({
    summary: 'Update an existing usecase category',
    description:
      'Updates an existing usecase category. All fields are optional for partial updates.\n\n' +
      '**Request Body:**\n' +
      '- `name` (optional): Updated name of the category. Must be unique among all category names.\n' +
      '- `usecaseSystemIds` (optional): Array of usecase system identifiers. If not provided, existing associations are kept. If provided, replaces all existing associations.\n' +
      '- `sortKeySystemIds` (optional): Array of key system identifiers to define sort order for usecases. The provided sortKeySystemIds must be equal to the union of all key system IDs present across all usecases in the category.\n\n' +
      '**Response:**\n' +
      'Returns the updated category with:\n' +
      '- `systemId`: Unique system identifier of the category\n' +
      '- `name`: Updated name of the category\n' +
      '- `changeInfo`: Change information (changeType, changeId, changeStatus)\n' +
      '- `usecases`: Array of usecase summaries associated with this category',
    requestDto: UpdateUsecaseCategoryRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Usecase category updated successfully',
        dto: UsecaseCategoryResponseDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Usecase category updated but some usecases failed to be added (partial success)',
        dto: UsecaseCategoryResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description:
          'Invalid request data (e.g., keySystemIds not equal to the union of all usecase keys)',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Category not found or some usecases not found',
      },
      {
        status: HttpStatus.CONFLICT,
        description: 'Category name already exists',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Failed to update usecase category',
      },
    ],
  })
  @ApiParam({
    name: 'usecaseCategorySystemId',
    type: 'string',
    description: 'The unique identifier of the category to update',
  })
  async updateUsecaseCategory(
    @Param('projectId') projectId: string,
    @Param('usecaseCategorySystemId') usecaseCategorySystemId: string,
    @Body() updateCategoryDto: UpdateUsecaseCategoryRequestDto,
  ): Promise<ApiResult<UsecaseCategoryResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Updating usecase category:',
      usecaseCategorySystemId,
      'in project:',
      projectId,
      'with data:',
      updateCategoryDto,
    );
    throw new HttpException(
      'This API endpoint is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  //#endregion

  //#endregion

  //#region DELETE

  //#region Delete usecase category

  /**
   * Delete a usecase category.
   */
  @Delete(':usecaseCategorySystemId')
  @ApiDocumentationWithExample({
    summary: 'Delete a usecase category (category only, not the usecases)',
    description:
      'Deletes an existing usecase category by its unique identifier. This operation only removes the category itself. The usecases associated with this category will be unlinked but remain in the system.\n\n' +
      '**Response:**\n' +
      'Returns the deleted category information with:\n' +
      '- `systemId`: Unique system identifier of the deleted category\n' +
      '- `name`: Name of the deleted category\n' +
      '- `changeInfo`: Change information (changeType, changeId, changeStatus)',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Usecase category deleted successfully',
        dto: DeleteUsecaseCategoryResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Category not found',
      },
      {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Failed to delete usecase category',
      },
    ],
  })
  @ApiParam({
    name: 'usecaseCategorySystemId',
    type: 'string',
    description: 'The unique identifier of the category to delete',
  })
  async deleteUsecaseCategory(
    @Param('projectId') projectId: string,
    @Param('usecaseCategorySystemId') usecaseCategorySystemId: string,
  ): Promise<ApiResult<DeleteUsecaseCategoryResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      'Deleting usecase category:',
      usecaseCategorySystemId,
      'in project:',
      projectId,
    );
    throw new HttpException(
      'This API endpoint is not implemented yet.',
      HttpStatus.NOT_IMPLEMENTED,
    );
  }

  //#endregion

  //#endregion
}
