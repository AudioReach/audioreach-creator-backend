/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {ControlLinkController} from './control-link.controller.js';
import {ArcCqrsModule} from '../../../../infrastructure-wrapper/arc-cqrs.module.js';

@Module({
  imports: [ArcCqrsModule],
  controllers: [ControlLinkController],
  providers: [],
  exports: [],
})
export class ControlLinkModule {}
