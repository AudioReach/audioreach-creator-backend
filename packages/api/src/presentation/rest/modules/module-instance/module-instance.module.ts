/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {ModuleInstanceController} from './module-instance.controller.js';

/**
 * Module for module instance functionality
 */
@Module({
  controllers: [ModuleInstanceController],
  providers: [],
  exports: [],
})
export class ModuleInstanceModule {}
