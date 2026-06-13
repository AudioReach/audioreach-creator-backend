/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ReadModelBase} from '../../../../../shared/read-model-base.js';

export interface IntentReadModel {
  readonly systemId: number;
  readonly intentId: number;
  readonly name: string;
}

export interface ControlPortReadModel extends ReadModelBase {
  readonly portId: number;
  readonly name: string;
  readonly isStatic: boolean;
  readonly allocatedIntents: IntentReadModel[];
  readonly totalLinksAtPort: number;
}
