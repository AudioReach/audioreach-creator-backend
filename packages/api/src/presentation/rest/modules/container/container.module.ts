/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {ContainerController} from './container.controller.js';

@Module({
  controllers: [ContainerController],
  providers: [],
  exports: [],
})
export class ContainerModule {}
