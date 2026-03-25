/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {SpfModuleController} from './spf-module.controller.js';

/**
 * Module for SPF module functionality
 */
@Module({
  controllers: [SpfModuleController],
  providers: [],
  exports: [],
})
export class SpfModuleModule {}
