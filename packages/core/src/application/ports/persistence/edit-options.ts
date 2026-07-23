/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ChangeStatus, Source} from '../../shared/change-vocabulary.js';

export type EditOptions = {
  fieldGroup?: string;
  linkedEntityGroupId?: string;
  cache?: boolean;
  source?: Source;
  changeStatus?: ChangeStatus;
};
