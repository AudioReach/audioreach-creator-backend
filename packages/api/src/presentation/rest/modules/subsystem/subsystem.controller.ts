/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
  NotImplementedException,
  BadRequestException,
  Body,
  Param,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Post,
  Patch,
  Put,
  Delete,
} from '@nestjs/common';
import {ApiTags, ApiParam} from '@nestjs/swagger';
import {BaseController} from '../base/base.controller.js';
import {AuthGuard} from '@nestjs/passport';
import {SystemIdsRequestDto} from '../../common/dto/index.js';
import {ComponentsResponseDto} from '../../common/dto/component-collection-response.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {PartialSuccessInterceptor} from '../../common/interceptors/partial-success.interceptor.js';
import {CreateSubsystemRequestDto} from './dto/request/create-subsystem-request.dto.js';
import {MoveSubsystemComponentsRequestDto} from './dto/request/move-subsystem-components-request.dto.js';
import {PatchSubsystemRequestDto} from './dto/request/patch-subsystem-request.dto.js';
import {SetSubsystemFilteredKeysRequestDto} from './dto/request/set-subsystem-filtered-keys-request.dto.js';
import {MoveSubsystemComponentsResponseDto} from './dto/response/move-subsystem-components-response.dto.js';
import {CreateSubsystemResponseDto} from './dto/response/create-subsystem-response.dto.js';
import {DeleteSubsystemResponseDto} from './dto/response/delete-subsystem-response.dto.js';
import {UpdateSubsystemResponseDto} from './dto/response/update-subsystem-response.dto.js';
import {UpdateSubsystemFilteredKeysResponseDto} from './dto/response/update-subsystem-filtered-keys-response.dto.js';
import {SubsystemResponseDto} from './dto/response/subsystem-response.dto.js';

/**
 * Controller to support all Subsystem related APIs for usecase design.
 * Provides Subsystem related APIs for usecase design.
 */
@ApiTags('subsystems')
@Controller('arc-api/v1/projects/:projectId/subsystems')
@UseGuards(AuthGuard('jwt'))
@UseInterceptors(PartialSuccessInterceptor)
@ApiParam({
  name: 'projectId',
  type: 'string',
  description: 'The unique identifier of the project',
  example: '12345',
})
export class SubsystemController extends BaseController {
  constructor() {
    super();
  }

  //#region POST

  //#region Query subsystems

  /**
   * Query subsystems for system ids
   */
  @Post('query')
  @ApiDocumentationWithExample({
    summary: 'Query subsystems for provided systemIds',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription: 'List of subsystem system ids',

    responses: [
      {
        status: HttpStatus.OK,
        description: 'All subsystems found successfully',
        dto: [SubsystemResponseDto],
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some subsystems could not be retrieved (see errors array)',
        dto: [SubsystemResponseDto],
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get subsystems',
      },
    ],
  })
  async querySubsystems(
    @Param('projectId') projectId: string,
    @Body() subsystemSystemIds: SystemIdsRequestDto,
  ): Promise<ApiResult<SubsystemResponseDto[]>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting subsystems in project ${projectId}: ${JSON.stringify(subsystemSystemIds)}`,
    );
    throw new NotImplementedException('querySubsystems is not implemented yet');
  }

  //#endregion

  //#region Query components in subsystem

  /**
   * Get all top level components (in case of multiple layers) in a subsystem for provided usecases.
   * @param subsystemId - subsystem id
   * @param usecaseIds - usecase ids. If not provided, components in a subsystem for all usecases will be returned.
   * @returns List of components in the subsystem
   */
  @Post(':subsystemSystemId/components/query')
  @ApiParam({
    name: 'subsystemSystemId',
    required: true,
    description: 'Subsystem system ID',
    type: Number,
  })
  @ApiDocumentationWithExample({
    summary:
      'Get all top level components in a subsystem for provided usecases',
    requestDto: SystemIdsRequestDto,
    requestDtoDescription:
      'List of system ids for usecases. Optional.\n\n' +
      'If provided, only top level components in the subystem for these usecases will be returned.\n\n' +
      'Otherwise, all top level of components in the subsystem will be returned.',
    requestRequired: false,

    responses: [
      {
        status: HttpStatus.OK,
        description: 'Success',
        dto: ComponentsResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subsystem not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to get components in subsystem)',
      },
    ],
  })
  async queryComponentsInSubsystem(
    @Param('projectId') projectId: string,
    @Param('subsystemSystemId') subsystemSystemId: string,
    @Body() usecaseSystemIds?: SystemIdsRequestDto,
  ): Promise<ApiResult<ComponentsResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Getting components for subgraph ${subsystemSystemId} in project ${projectId} with optional usecase system ids: ${JSON.stringify(usecaseSystemIds)}`,
    );
    throw new NotImplementedException(
      'queryComponentsInSubsystem is not implemented yet',
    );
  }

  //#endregion

  //#region Create subsystem

  /**
   * Create an empty subsystem.
   */
  @Post()
  @ApiDocumentationWithExample({
    summary: 'Create an empty subsystem',
    description:
      'Creates a new empty subsystem with the given name.\n\n' +
      '**Optional parameters:**\n' +
      '- `parentSystemId`: System ID of an existing subsystem to nest this one under. ' +
      'If omitted, the subsystem is created at the root level of the use case.',
    requestDto: CreateSubsystemRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Subsystem created successfully',
        dto: CreateSubsystemResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid request body',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or parent subsystem not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'Failed to create subsystem',
      },
    ],
  })
  async createSubsystem(
    @Param('projectId') projectId: string,
    @Body() request: CreateSubsystemRequestDto,
  ): Promise<ApiResult<CreateSubsystemResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Creating subsystem in project ${projectId}: ${JSON.stringify(request)}`,
    );
    throw new NotImplementedException('createSubsystem is not implemented yet');
  }

  //#endregion

  //#region Move components

  /**
   * Move subgraphs or subsystems to a target subsystem or root.
   * Re-parents the specified components, removes cross-boundary links that become
   * invalid, and constructs new links per the updated structure.
   */
  @Post('components/move')
  @ApiDocumentationWithExample({
    summary: 'Move subgraphs or subsystems to a target subsystem',
    description:
      'Moves one or more subgraphs or subsystems to the specified target subsystem.\n\n' +
      'Set `targetSubsystemSystemId` to a subsystem ID to move components into it, ' +
      'or `null` to move them to root.\n\n' +
      'At least one of `subgraphSystemIds` or `subsystemSystemIds` must be provided.\n\n' +
      '**Scenarios:**\n' +
      '- Subsystem → Subsystem: provide `targetSubsystemSystemId`\n' +
      '- Root → Subsystem: provide `targetSubsystemSystemId`\n' +
      '- Subsystem → Root: set `targetSubsystemSystemId` to `null`',
    requestDto: MoveSubsystemComponentsRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'All components moved successfully',
        dto: MoveSubsystemComponentsResponseDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some components were moved but others failed (see issues array)',
        dto: MoveSubsystemComponentsResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description:
          'Neither subgraphSystemIds nor subsystemSystemIds provided',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or target subsystem not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description:
          'Business rule violation (e.g. circular hierarchy, component not in this project)',
      },
    ],
  })
  async moveComponents(
    @Param('projectId') projectId: string,
    @Body() request: MoveSubsystemComponentsRequestDto,
  ): Promise<ApiResult<MoveSubsystemComponentsResponseDto>> {
    const hasSubgraphs = (request.subgraphSystemIds?.length ?? 0) > 0;
    const hasSubsystems = (request.subsystemSystemIds?.length ?? 0) > 0;
    if (!hasSubgraphs && !hasSubsystems) {
      throw new BadRequestException(
        'At least one of subgraphSystemIds or subsystemSystemIds must be provided',
      );
    }
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Moving components in project ${projectId}: ${JSON.stringify(request)}`,
    );
    throw new NotImplementedException('moveComponents is not implemented yet');
  }

  //#endregion

  //#endregion

  //#region PUT

  //#region Set subsystem filtered keys

  /**
   * Set the filtered keys for a subsystem (full replacement).
   * The provided list replaces the current set entirely. An empty array clears all filtered keys.
   */
  @Put(':subsystemSystemId/filtered-keys')
  @ApiParam({
    name: 'subsystemSystemId',
    required: true,
    description: 'System ID of the subsystem',
    type: String,
  })
  @ApiDocumentationWithExample({
    summary: 'Set filtered keys for a subsystem',
    description:
      'Replaces the full set of filtered keys assigned to the subsystem.\n\n' +
      'The provided `keySystemIds` list becomes the new set — any keys not included are removed. ' +
      'Pass an empty array to clear all filtered keys.\n\n' +
      'Returns the updated subsystem.',
    requestDto: SetSubsystemFilteredKeysRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Filtered keys set successfully',
        dto: UpdateSubsystemFilteredKeysResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'Invalid request body',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subsystem not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description: 'One or more key system IDs do not exist in this project',
      },
    ],
  })
  async setSubsystemFilteredKeys(
    @Param('projectId') projectId: string,
    @Param('subsystemSystemId') subsystemSystemId: string,
    @Body() request: SetSubsystemFilteredKeysRequestDto,
  ): Promise<ApiResult<UpdateSubsystemFilteredKeysResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Setting filtered keys for subsystem ${subsystemSystemId} in project ${projectId}: ${JSON.stringify(request)}`,
    );
    throw new NotImplementedException(
      'setSubsystemFilteredKeys is not implemented yet',
    );
  }

  //#endregion

  //#endregion

  //#region PATCH

  //#region Patch subsystem

  /**
   * Partially update subsystem properties: name and/or port counts.
   * Port count changes add or remove DataPort / ControlPort entities to reach the target count.
   */
  @Patch(':subsystemSystemId')
  @ApiParam({
    name: 'subsystemSystemId',
    required: true,
    description: 'System ID of the subsystem to update',
    type: String,
  })
  @ApiDocumentationWithExample({
    summary: 'Partially update subsystem properties',
    description:
      'Partially updates a subsystem. Only provided fields are updated; absent fields remain unchanged.\n\n' +
      '**Patchable fields:**\n' +
      '- `name`: Subsystem name (max 255 characters)\n' +
      '- `inputDataPortCount`: Target input data port count — the API adds or removes input DataPort entities to reach this number\n' +
      '- `outputDataPortCount`: Target output data port count — the API adds or removes output DataPort entities to reach this number\n' +
      '- `controlPortCount`: Target control port count — the API adds or removes ControlPort entities to reach this number\n\n' +
      '**Example usage:**\n' +
      '```\n' +
      'PATCH /arc-api/v1/projects/proj123/subsystems/12345\n' +
      '{ "name": "audio-subsystem" }\n' +
      '```',
    requestDto: PatchSubsystemRequestDto,
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Subsystem updated successfully',
        dto: UpdateSubsystemResponseDto,
      },
      {
        status: HttpStatus.MULTI_STATUS,
        description:
          'Partial success — some fields were updated but others failed (see issues array)',
        dto: UpdateSubsystemResponseDto,
      },
      {
        status: HttpStatus.BAD_REQUEST,
        description: 'No fields provided',
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subsystem not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description:
          'Business rule violation (e.g. port count below current usage)',
      },
    ],
  })
  async patchSubsystem(
    @Param('projectId') projectId: string,
    @Param('subsystemSystemId') subsystemSystemId: string,
    @Body() request: PatchSubsystemRequestDto,
  ): Promise<ApiResult<UpdateSubsystemResponseDto>> {
    if (!Object.values(request).some(v => v !== undefined)) {
      throw new BadRequestException(
        'At least one field must be provided to patch',
      );
    }
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Patching subsystem ${subsystemSystemId} in project ${projectId}: ${JSON.stringify(request)}`,
    );
    throw new NotImplementedException('patchSubsystem is not implemented yet');
  }

  //#endregion

  //#endregion

  //#region DELETE

  //#region Remove subsystem

  /**
   * Remove a subsystem. Only succeeds when the subsystem has no children.
   */
  @Delete(':subsystemSystemId')
  @ApiParam({
    name: 'subsystemSystemId',
    required: true,
    description: 'System ID of the subsystem to remove',
    type: String,
  })
  @ApiDocumentationWithExample({
    summary: 'Remove an empty subsystem',
    description:
      'Deletes the specified subsystem. The subsystem must have no child components or nested subsystems.\n\n' +
      'Returns the removed subsystem.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Subsystem removed successfully',
        dto: DeleteSubsystemResponseDto,
      },
      {
        status: HttpStatus.NOT_FOUND,
        description: 'Project or subsystem not found',
      },
      {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        description:
          'Subsystem is not empty — remove all children before deleting',
      },
    ],
  })
  async removeSubsystem(
    @Param('projectId') projectId: string,
    @Param('subsystemSystemId') subsystemSystemId: string,
  ): Promise<ApiResult<DeleteSubsystemResponseDto>> {
    await Promise.resolve(); // Placeholder to satisfy linter
    console.log(
      `Removing subsystem ${subsystemSystemId} in project ${projectId}`,
    );
    throw new NotImplementedException('removeSubsystem is not implemented yet');
  }

  //#endregion

  //#endregion
}
