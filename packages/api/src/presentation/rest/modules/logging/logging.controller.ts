/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {ApiOperation, ApiParam, ApiTags} from '@nestjs/swagger';
import {AuthGuard} from '@nestjs/passport';
import {QueryBus, LogLevel, GetLogsByProjectQuery} from '@arc/core';
import type {Logger1, LogData1, LogEntryReadModel} from '@arc/core';
import {CreateLogEntryRequestDto} from './dto/create-log-entry-request.dto.js';
import {LogEntryResponseDto} from './dto/log-entry-response.dto.js';
import {ApiResult} from '../../common/dto/api-response/api-result.dto.js';
import {ClientId} from '../../../../decorators/client-id.decorator.js';

@ApiTags('Logging')
@Controller('arc-api/v1')
@UseGuards(AuthGuard('jwt'))
export class LogController {
  constructor(
    @Inject('LOGGER1') private readonly logger: Logger1,
    private readonly queryBus: QueryBus,
  ) {}

  @Post('logs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({summary: 'Submit a client log entry'})
  log(
    @Body() dto: CreateLogEntryRequestDto,
    @ClientId() clientId: string,
  ): void {
    const data: LogData1 = {
      description: dto.description,
      timestamp: new Date(dto.timestamp),
      msg: dto.msg,
      component: dto.component,
      tag: dto.tag,
      source: clientId,
      projectId: dto.projectId,
      error: dto.error,
    };

    switch (dto.level) {
      case LogLevel.Verbose:
        this.logger.logVerbose(data);
        break;
      case LogLevel.Debug:
        this.logger.logDebug(data);
        break;
      case LogLevel.Info:
        this.logger.logInfo(data);
        break;
      case LogLevel.Warn:
        this.logger.logWarn(data);
        break;
      case LogLevel.Error:
        this.logger.logError(data);
        break;
      case LogLevel.Critical:
        this.logger.logCritical(data);
        break;
    }
  }

  @Get('projects/:projectId/logs')
  @ApiOperation({summary: 'Get log entries for a project'})
  @ApiParam({name: 'projectId', type: String})
  async getLogs(
    @Param('projectId') projectId: string,
    @ClientId() clientId: string,
  ): Promise<ApiResult<LogEntryResponseDto[]>> {
    const query = new GetLogsByProjectQuery(projectId, clientId);
    const logs = await this.queryBus.execute<LogEntryReadModel[]>(query);
    return {data: logs.map(l => this.mapToDto(l))};
  }

  private mapToDto(log: LogEntryReadModel): LogEntryResponseDto {
    const dto = new LogEntryResponseDto();
    dto.id = log.id;
    dto.level = log.level;
    dto.description = log.description;
    dto.timestamp = log.timestamp;
    dto.msg = log.msg;
    dto.component = log.component;
    dto.tag = log.tag;
    dto.source = log.source;
    dto.projectId = log.projectId;
    dto.error = log.error;
    return dto;
  }
}
