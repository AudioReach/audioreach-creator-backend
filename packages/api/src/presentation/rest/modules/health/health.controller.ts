/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Controller, Get} from '@nestjs/common';
import {ApiTags} from '@nestjs/swagger';

@ApiTags('health')
@Controller('arc-api/v1/health')
export class HealthController {
  @Get()
  check(): {status: string} {
    return {status: 'ok'};
  }
}
