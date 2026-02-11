/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {SubgraphController} from './subgraph.controller.js';

/**
 * Module for subgraph functionality
 */
@Module({
  controllers: [SubgraphController],
  providers: [],
  exports: [],
})
export class SubgraphModule {}
