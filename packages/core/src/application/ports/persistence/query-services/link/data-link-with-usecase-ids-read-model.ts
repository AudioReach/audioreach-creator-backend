/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataLinkReadModel} from './data-link-read-model.js';

export interface DataLinkWithUsecaseIdsReadModel {
  readonly link: DataLinkReadModel;
  readonly usecaseSystemIds: readonly number[];
}
