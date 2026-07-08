/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {ChangeInfo} from './change-vocabulary.js';

export interface ReadModelBase {
  readonly systemId: number;
  readonly changeInfo: ChangeInfo;
}
