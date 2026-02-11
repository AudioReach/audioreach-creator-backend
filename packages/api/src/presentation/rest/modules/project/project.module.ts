/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {ProjectController} from './project.controller.js';
import {ArcCqrsModule} from '../../../../infrastructure-wrapper/arc-cqrs.module.js';

@Module({
  imports: [ArcCqrsModule],
  controllers: [ProjectController],
})
export class ProjectModule {}
