/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {ModuleDefinitionController} from './module-definition.controller.js';

@Module({
  controllers: [ModuleDefinitionController],
})
export class ModuleDefinitionModule {}
