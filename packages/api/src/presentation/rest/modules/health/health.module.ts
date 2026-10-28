/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {HealthController} from './health.controller.js';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
