/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {TagDefinitionController} from './tag-definition.controller.js';

@Module({
  controllers: [TagDefinitionController],
})
export class TagDefinitionModule {}
