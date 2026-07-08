/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {Module} from '@nestjs/common';
import {SpfModuleController} from './spf-module.controller.js';
import {ArcCqrsModule} from '../../../../infrastructure-wrapper/arc-cqrs.module.js';

/**
 * Module for SPF module functionality.
 * Imports ArcCqrsModule to make QueryBus available for constructor injection
 * in SpfModuleController — same pattern as UseCaseModule.
 */
@Module({
  imports: [ArcCqrsModule],
  controllers: [SpfModuleController],
  providers: [],
  exports: [],
})
export class SpfModuleModule {}
