/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {SubgraphController} from './subgraph.controller.js';
import {ArcCqrsModule} from '../../../../infrastructure-wrapper/arc-cqrs.module.js';

@Module({
  imports: [ArcCqrsModule],
  controllers: [SubgraphController],
})
export class SubgraphModule {}
