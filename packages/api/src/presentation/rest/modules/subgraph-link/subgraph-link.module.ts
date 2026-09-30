/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {ArcCqrsModule} from '../../../../infrastructure-wrapper/arc-cqrs.module.js';
import {SubgraphLinkController} from './subgraph-link.controller.js';

@Module({
  imports: [ArcCqrsModule],
  controllers: [SubgraphLinkController],
  providers: [],
  exports: [],
})
export class SubgraphLinkModule {}
