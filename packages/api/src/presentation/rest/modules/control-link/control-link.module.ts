/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {ControlLinkController} from './control-link.controller.js';

@Module({
  controllers: [ControlLinkController],
  providers: [],
  exports: [],
})
export class ControlLinkModule {}
