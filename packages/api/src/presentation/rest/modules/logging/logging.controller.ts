/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {ApiHeader, ApiParam, ApiTags} from '@nestjs/swagger';
import {AuthGuard} from '@nestjs/passport';
import {ERROR_CODES} from '@arc/core';
import {
  InvalidLogCursorError,
  LOG_SEARCH_DEFAULT_LIMIT,
  LogSortOrder,
} from '@arc/logger';
import type {
  ClientInstanceReadModel,
  LogEntryReadModel,
  LogQueryService,
  ClientLogWriter,
} from '@arc/logger';
import {CreateLogEntryRequestDto} from './dto/create-log-entry-request.dto.js';
import {
  ClientInstancesRequestDto,
  ProjectLogsRequestDto,
} from './dto/log-search-request.dto.js';
import {
  ClientInstancePageResponseDto,
  ClientInstanceResponseDto,
  LogEntryPageResponseDto,
  LogEntryResponseDto,
} from './dto/log-entry-response.dto.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {ApiDocumentationWithExample} from '../../common/swagger-doc/swagger.decorator.js';
import {ClientName} from '../../../../decorators/client-name.decorator.js';
import {ClientInstanceId} from '../../../../decorators/client-instance-id.decorator.js';
import {
  LOG_QUERY_SERVICE,
  CLIENT_LOG_WRITER,
} from '../../../../infrastructure-wrapper/logging.module.js';

// Logs are operational data, not domain data, so the controller reads them
// through the logging infrastructure directly instead of the core QueryBus,
// as POST /logs already writes them.
@ApiTags('Logging')
@Controller('arc-api/v1')
@UseGuards(AuthGuard('jwt'))
export class LogController {
  constructor(
    @Inject(CLIENT_LOG_WRITER)
    private readonly clientLogWriter: ClientLogWriter,
    @Inject(LOG_QUERY_SERVICE)
    private readonly logQueryService: LogQueryService,
  ) {}

  @Post('logs')
  @HttpCode(HttpStatus.OK)
  @ApiDocumentationWithExample({
    summary: 'Submit a client log record',
    description:
      'The record is attributed to the client name in the access token and ' +
      'the launch in X-ARC-Client-Instance-Id.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'Record accepted; the response body is empty',
      },
    ],
  })
  @ApiHeader({
    name: 'X-ARC-Client-Instance-Id',
    required: true,
    description: 'UUID of the launch that wrote the record',
  })
  log(
    @Body() dto: CreateLogEntryRequestDto,
    @ClientName() clientName: string,
    @ClientInstanceId() clientInstanceId: string,
  ): void {
    this.clientLogWriter.write({
      level: dto.level,
      eventName: dto.eventName,
      description: dto.description,
      component: dto.component,
      tag: dto.tag,
      timestamp: new Date(dto.timestamp),
      projectId: dto.projectId,
      error: dto.error,
      clientName,
      clientInstanceId,
    });
  }

  @Get('projects/:projectId/logs')
  @ApiDocumentationWithExample({
    summary: 'Get the log records of a project',
    description:
      'Client and server records, filtered by client, launch, origin and ' +
      'minimum level. ' +
      'Filters combine with AND; filters that cannot all match return no records.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'One page of log records',
        dto: LogEntryPageResponseDto,
      },
    ],
  })
  @ApiParam({name: 'projectId', type: String})
  async getProjectLogs(
    @Param('projectId') projectId: string,
    @Query() request: ProjectLogsRequestDto,
  ): Promise<ApiResult<LogEntryPageResponseDto>> {
    const page = await rejectingBadCursor(
      this.logQueryService.searchProjectLogs({
        projectId,
        clientName: request.clientName,
        clientInstanceId: request.clientInstanceId?.toLowerCase(),
        origin: request.origin,
        minLevel: request.minLevel,
        limit: request.limit ?? LOG_SEARCH_DEFAULT_LIMIT,
        order: request.order ?? LogSortOrder.Desc,
        cursor: request.cursor,
      }),
    );
    const dto = new LogEntryPageResponseDto();
    dto.items = page.items.map(log => toLogEntryDto(log));
    if (page.nextCursor !== undefined) {
      dto.nextCursor = page.nextCursor;
    }
    if (page.totalCount !== undefined) {
      dto.totalCount = page.totalCount;
    }
    return {data: dto};
  }

  @Get('client-instances')
  @ApiDocumentationWithExample({
    summary: 'List client launches that have project log records',
    description: 'Newest lastTimestamp first.',
    responses: [
      {
        status: HttpStatus.OK,
        description: 'One page of client launches',
        dto: ClientInstancePageResponseDto,
      },
    ],
  })
  async getClientInstances(
    @Query() request: ClientInstancesRequestDto,
  ): Promise<ApiResult<ClientInstancePageResponseDto>> {
    const page = await rejectingBadCursor(
      this.logQueryService.listClientInstances({
        clientName: request.clientName,
        limit: request.limit ?? LOG_SEARCH_DEFAULT_LIMIT,
        cursor: request.cursor,
      }),
    );
    const dto = new ClientInstancePageResponseDto();
    dto.items = page.items.map(instance => toClientInstanceDto(instance));
    if (page.nextCursor !== undefined) {
      dto.nextCursor = page.nextCursor;
    }
    if (page.totalCount !== undefined) {
      dto.totalCount = page.totalCount;
    }
    return {data: dto};
  }
}

/** Turns a rejected cursor into the standard 400 (`ERR_1004`). */
async function rejectingBadCursor<T>(read: Promise<T>): Promise<T> {
  try {
    return await read;
  } catch (error) {
    if (error instanceof InvalidLogCursorError) {
      throw new BadRequestException(
        {message: error.message, errorCode: ERROR_CODES.INVALID_PARAMETER},
        {cause: error},
      );
    }
    throw error;
  }
}

function toLogEntryDto(log: LogEntryReadModel): LogEntryResponseDto {
  const dto = new LogEntryResponseDto();
  dto.systemId = String(log.systemId);
  dto.level = log.level;
  dto.timestamp = log.timestamp;
  dto.eventName = log.eventName;
  dto.description = log.description;
  dto.component = log.component;
  dto.tag = log.tag;
  dto.origin = log.origin;
  dto.clientName = log.clientName;
  dto.clientInstanceId = log.clientInstanceId;
  dto.serverInstanceId = log.serverInstanceId;
  dto.projectId = log.projectId;
  dto.error = log.error;
  return dto;
}

function toClientInstanceDto(
  instance: ClientInstanceReadModel,
): ClientInstanceResponseDto {
  const dto = new ClientInstanceResponseDto();
  dto.clientName = instance.clientName;
  dto.clientInstanceId = instance.clientInstanceId;
  dto.projectIds = [...instance.projectIds];
  dto.firstTimestamp = instance.firstTimestamp;
  dto.lastTimestamp = instance.lastTimestamp;
  dto.recordCount = instance.recordCount;
  dto.errorCount = instance.errorCount;
  return dto;
}
