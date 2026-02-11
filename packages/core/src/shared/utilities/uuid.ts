/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {v4 as uuidv4} from 'uuid';

export function generateUuid(): string {
  return uuidv4();
}
