/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import {UseCaseCategoryController} from './usecase-category.controller.js';
import {ArcCqrsModule} from '../../../../infrastructure-wrapper/arc-cqrs.module.js';

/**
 * Module for usecase-category functionality
 */
@Module({
  imports: [ArcCqrsModule],
  controllers: [UseCaseCategoryController],
})
export class UseCaseCategoryModule {}
