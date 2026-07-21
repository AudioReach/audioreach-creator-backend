/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {SubsystemController} from './subsystem.controller.js';
import {ArcCqrsModule} from '../../../../infrastructure-wrapper/arc-cqrs.module.js';

/**
 * Module for subsystem functionality.
 * Imports ArcCqrsModule to make CommandBus and QueryBus available for injection
 * in SubsystemController — same pattern as SpfModuleModule.
 */
@Module({
  imports: [ArcCqrsModule],
  controllers: [SubsystemController],
  providers: [],
  exports: [],
})
export class SubsystemModule {}
