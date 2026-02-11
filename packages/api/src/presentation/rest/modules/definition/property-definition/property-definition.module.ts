/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {PropertyDefinitionController} from './property-definition.controller.js';

@Module({
  controllers: [PropertyDefinitionController],
})
export class PropertyDefinitionModule {}
