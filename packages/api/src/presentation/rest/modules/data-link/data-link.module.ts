/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {DataLinkController} from './data-link.controller.js';

@Module({
  controllers: [DataLinkController],
  providers: [],
  exports: [],
})
export class DataLinkModule {}
