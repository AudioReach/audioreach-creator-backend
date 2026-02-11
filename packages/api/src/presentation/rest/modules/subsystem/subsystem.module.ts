/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {SubsystemController} from './subsystem.controller.js';

/**
 * Module for subsystem functionality
 */
@Module({
  controllers: [SubsystemController],
  providers: [],
  exports: [],
})
export class SubsystemModule {}
