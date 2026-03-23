/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {DriverModuleController} from './driver-module.controller.js';

/**
 * Module for driver module functionality
 */
@Module({
  controllers: [DriverModuleController],
  providers: [],
  exports: [],
})
export class DriverModuleModule {}
