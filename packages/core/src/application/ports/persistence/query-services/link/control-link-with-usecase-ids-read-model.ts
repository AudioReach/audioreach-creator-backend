/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ControlLinkReadModel} from './control-link-read-model.js';

export interface ControlLinkWithUsecaseIdsReadModel {
  readonly link: ControlLinkReadModel;
  readonly usecaseSystemIds: readonly number[];
}
