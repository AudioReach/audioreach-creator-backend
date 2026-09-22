/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Controller,
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
import {toApiResult} from '../../common/result/to-api-result.js';
import {SessionGuard} from '../../../../guards/session-guard.js';
import {ArcSession} from '../../../../guards/arc-session.decorator.js';
import type {ActiveSession, MoveSubsystemComponentsResult} from '@arc/core';
import {
  CommandBus,
  CreateSubsystemCommand,
  DeleteSubsystemCommand,
  MoveSubsystemComponentsCommand,
  PatchSubsystemCommand,
  Result,
  SetSubsystemFilteredKeysCommand,
} from '@arc/core';

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
  constructor(private readonly commandBus: CommandBus) {
    super();
  }

  //#region POST

  //#region Create subsystem

  /**
   * Create an empty subsystem.
   */
  @Post()
  @UseGuards(SessionGuard)
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
    @Param('projectId') _projectId: string,
    @Body() request: CreateSubsystemRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<CreateSubsystemResponseDto>> {
    const result = await this.commandBus.execute<{
      subsystemSystemId: number;
      naturalId: number;
      name: string;
      parentSystemId: number | null;
    }>(
      new CreateSubsystemCommand(
        session.fileSystemId,
        request.name,
        parseOptionalSystemId(request.parentSystemId) ?? null,
      ),
      session,
    );
    return toApiResult(Result.ok(result), value => ({
      systemId: String(value.subsystemSystemId),
      naturalId: value.naturalId,
      name: value.name,
      ...(value.parentSystemId !== null
        ? {parentSystemId: String(value.parentSystemId)}
        : {}),
    }));
  }

  //#endregion

  //#region Move components

  /**
   * Move subgraphs or subsystems to a target subsystem or root.
   * Re-parents the specified components, removes cross-boundary links that become
   * invalid, and constructs new links per the updated structure.
   */
  @Post('components/move')
  @UseGuards(SessionGuard)
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
    @Param('projectId') _projectId: string,
    @Body() request: MoveSubsystemComponentsRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<MoveSubsystemComponentsResponseDto>> {
    const hasSubgraphs = (request.subgraphSystemIds?.length ?? 0) > 0;
    const hasSubsystems = (request.subsystemSystemIds?.length ?? 0) > 0;
    if (!hasSubgraphs && !hasSubsystems) {
      throw new BadRequestException(
        'At least one of subgraphSystemIds or subsystemSystemIds must be provided',
      );
    }
    const result = await this.commandBus.execute<MoveSubsystemComponentsResult>(
      new MoveSubsystemComponentsCommand(
        session.fileSystemId,
        parseSystemIds(request.subgraphSystemIds),
        parseSystemIds(request.subsystemSystemIds),
        parseOptionalSystemId(request.targetSubsystemSystemId) ?? null,
      ),
      session,
    );
    const commandResult = result.issues?.length
      ? Result.partial(result, result.issues)
      : Result.ok(result);
    return toApiResult(commandResult, value => ({
      updatedModules: value.updatedModules.map(component =>
        mapMovedComponent(component),
      ),
      updatedSubsystems: value.updatedSubsystems.map(component =>
        mapMovedComponent(component),
      ),
      addedDataLinks: value.addedDataLinks.map(link => ({
        systemId: String(link.systemId),
        sourceSystemId: String(link.sourceNodeSystemId),
        sourcePortSystemId: String(link.sourcePortSystemId),
        destinationSystemId: String(link.destinationNodeSystemId),
        destinationPortSystemId: String(link.destinationPortSystemId),
        linkType: link.linkType,
      })),
      removedDataLinks: value.removedDataLinks.map(String),
      addedControlLinks: value.addedControlLinks.map(link => ({
        systemId: String(link.systemId),
        sourceSystemId: String(link.peerNodeASystemId),
        sourcePortSystemId: String(link.nodeAPortSystemId),
        destinationSystemId: String(link.peerNodeBSystemId),
        destinationPortSystemId: String(link.nodeBPortSystemId),
        linkType: link.linkType,
      })),
      removedControlLinks: value.removedControlLinks.map(String),
      subsystemPortChanges: value.subsystemPortChanges.map(change => ({
        systemId: String(change.systemId),
        addedDataPorts: change.addedDataPorts.map(port =>
          mapMovedDataPort(port),
        ),
        removedDataPorts: change.removedDataPorts.map(String),
        addedControlPorts: change.addedControlPorts.map(port =>
          mapMovedControlPort(port),
        ),
        removedControlPorts: change.removedControlPorts.map(String),
      })),
    }));
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
  @UseGuards(SessionGuard)
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
    @Param('projectId') _projectId: string,
    @Param('subsystemSystemId') subsystemSystemId: string,
    @Body() request: SetSubsystemFilteredKeysRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<UpdateSubsystemFilteredKeysResponseDto>> {
    const result = await this.commandBus.execute<{
      subsystemSystemId: number;
      filteredKeys: Array<{systemId: number; keyId: number; name: string}>;
    }>(
      new SetSubsystemFilteredKeysCommand(
        parseSystemId(subsystemSystemId),
        session.fileSystemId,
        parseSystemIds(request.keySystemIds),
      ),
      session,
    );
    return toApiResult(Result.ok(result), value => ({
      systemId: String(value.subsystemSystemId),
      filteredKeys: value.filteredKeys.map(key => ({
        systemId: String(key.systemId),
        naturalId: key.keyId,
        name: key.name,
      })),
    }));
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
  @UseGuards(SessionGuard)
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
    @Param('projectId') _projectId: string,
    @Param('subsystemSystemId') subsystemSystemId: string,
    @Body() request: PatchSubsystemRequestDto,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<UpdateSubsystemResponseDto>> {
    if (!Object.values(request).some(v => v !== undefined)) {
      throw new BadRequestException(
        'At least one field must be provided to patch',
      );
    }
    const result = await this.commandBus.execute<{
      subsystem: {
        systemId: number;
        naturalId: number;
        name: string;
        parentSystemId: number | null;
        filteredKeys: Array<{systemId: number; keyId: number; name: string}>;
        dataPorts?: Array<{
          systemId: number;
          portId: number;
          name: string | null;
          portIoType: string;
          isStatic: boolean;
          totalLinksAtPort: number;
        }>;
        controlPorts?: Array<{
          systemId: number;
          portId: number;
          name: string | null;
          isStatic: boolean;
          allocatedIntents: Array<{
            systemId: number;
            intentId: number;
            name?: string;
          }>;
          totalLinksAtPort: number;
        }>;
      };
      issues?: readonly never[];
    }>(
      new PatchSubsystemCommand(
        parseSystemId(subsystemSystemId),
        session.fileSystemId,
        request.name,
        request.inputDataPortCount,
        request.outputDataPortCount,
        request.controlPortCount,
      ),
      session,
    );
    const commandResult = result.issues?.length
      ? Result.partial(result, result.issues)
      : Result.ok(result);
    return toApiResult(commandResult, value => mapSubsystem(value.subsystem));
  }

  //#endregion

  //#endregion

  //#region DELETE

  //#region Delete subsystem

  /**
   * Remove a subsystem. Only succeeds when the subsystem has no children.
   */
  @Delete(':subsystemSystemId')
  @UseGuards(SessionGuard)
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
  async deleteSubsystem(
    @Param('projectId') _projectId: string,
    @Param('subsystemSystemId') subsystemSystemId: string,
    @ArcSession() session: ActiveSession,
  ): Promise<ApiResult<DeleteSubsystemResponseDto>> {
    const result = await this.commandBus.execute<{
      deletedSubsystemSnapshot: {
        systemId: number;
        naturalId: number;
        name: string;
        parentSystemId: number | null;
      };
    }>(
      new DeleteSubsystemCommand(
        parseSystemId(subsystemSystemId),
        session.fileSystemId,
      ),
      session,
    );
    return toApiResult(Result.ok(result), value => ({
      systemId: String(value.deletedSubsystemSnapshot.systemId),
      naturalId: value.deletedSubsystemSnapshot.naturalId,
      name: value.deletedSubsystemSnapshot.name,
      ...(value.deletedSubsystemSnapshot.parentSystemId !== null
        ? {
            parentSystemId: String(
              value.deletedSubsystemSnapshot.parentSystemId,
            ),
          }
        : {}),
    }));
  }

  //#endregion

  //#endregion
}

function parseSystemId(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new BadRequestException(`Invalid system ID: ${value}`);
  }
  return parsed;
}

function parseSystemIds(values: string[] | undefined): number[] {
  return (values ?? []).map(value => parseSystemId(value));
}

function parseOptionalSystemId(
  value: string | null | undefined,
): number | null | undefined {
  if (value === null) return null;
  if (value === undefined) return undefined;
  return parseSystemId(value);
}

function mapMovedComponent(component: {
  systemId: number;
  parentSystemId: number | null;
}): {systemId: string; parentSystemId?: string} {
  return {
    systemId: String(component.systemId),
    ...(component.parentSystemId !== null
      ? {parentSystemId: String(component.parentSystemId)}
      : {}),
  };
}

function mapMovedDataPort(port: {
  systemId: number;
  naturalId: number;
  portIoType: string;
  isStatic: boolean;
  name: string | null;
}) {
  return {
    systemId: String(port.systemId),
    naturalId: port.naturalId,
    name: port.name ?? null,
    portIoType: mapPortIoType(port.portIoType),
    portType: port.isStatic ? ('Static' as const) : ('Dynamic' as const),
    totalLinksAtPort: 0,
  };
}

function mapPortIoType(value: string): 'InputOutput' | 'OutputInput' {
  switch (value) {
    case 'INPUT_OUTPUT':
      return 'InputOutput';
    case 'OUTPUT_INPUT':
      return 'OutputInput';
    default:
      return value as 'InputOutput' | 'OutputInput';
  }
}

function mapMovedControlPort(port: {
  systemId: number;
  naturalId: number;
  isStatic: boolean;
  name?: string;
}) {
  return {
    systemId: String(port.systemId),
    naturalId: port.naturalId,
    name: port.name ?? null,
    portType: port.isStatic ? ('Static' as const) : ('Dynamic' as const),
    totalLinksAtPort: 0,
    intents: [],
  };
}

function mapSubsystem(subsystem: {
  systemId: number;
  naturalId: number;
  name: string;
  parentSystemId: number | null;
  filteredKeys: Array<{systemId: number; keyId: number; name: string}>;
  dataPorts?: Array<{
    systemId: number;
    portId: number;
    name: string | null;
    portIoType: string;
    isStatic: boolean;
    totalLinksAtPort: number;
  }>;
  controlPorts?: Array<{
    systemId: number;
    portId: number;
    name: string | null;
    isStatic: boolean;
    allocatedIntents: Array<{
      systemId: number;
      intentId: number;
      name?: string;
    }>;
    totalLinksAtPort: number;
  }>;
}) {
  return {
    systemId: String(subsystem.systemId),
    naturalId: subsystem.naturalId,
    name: subsystem.name,
    ...(subsystem.parentSystemId !== null
      ? {parentSystemId: String(subsystem.parentSystemId)}
      : {}),
    dataPorts: (subsystem.dataPorts ?? []).map(port => ({
      systemId: String(port.systemId),
      naturalId: port.portId,
      name: port.name,
      portIoType: mapPortIoType(port.portIoType),
      portType: port.isStatic ? ('Static' as const) : ('Dynamic' as const),
      totalLinksAtPort: port.totalLinksAtPort,
    })),
    controlPorts: (subsystem.controlPorts ?? []).map(port => ({
      systemId: String(port.systemId),
      naturalId: port.portId,
      name: port.name,
      portType: port.isStatic ? ('Static' as const) : ('Dynamic' as const),
      totalLinksAtPort: port.totalLinksAtPort,
      intents: port.allocatedIntents.map(intent => ({
        naturalId: intent.intentId,
        ...(intent.name ? {name: intent.name} : {}),
      })),
    })),
    filteredKeys: subsystem.filteredKeys.map(key => ({
      systemId: String(key.systemId),
      naturalId: key.keyId,
      name: key.name,
    })),
  };
}
