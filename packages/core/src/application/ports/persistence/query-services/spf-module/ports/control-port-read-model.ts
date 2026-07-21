/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {IntentReadModel} from './intent-read-model.js';

export interface ControlPortReadModel {
  readonly systemId: number;
  readonly portId: number;
  readonly name: string | null;
  readonly isStatic: boolean;
  readonly allocatedIntents: IntentReadModel[];
  readonly totalLinksAtPort: number;
}
