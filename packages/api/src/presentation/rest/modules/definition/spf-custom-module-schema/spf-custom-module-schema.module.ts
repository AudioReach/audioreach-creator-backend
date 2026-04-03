/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {SpfCustomModuleSchemaController} from './spf-custom-module-schema.controller.js';

@Module({
  controllers: [SpfCustomModuleSchemaController],
})
export class SpfCustomModuleSchemaModule {}
