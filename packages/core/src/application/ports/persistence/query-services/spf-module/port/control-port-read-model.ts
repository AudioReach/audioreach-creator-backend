/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ReadModelBase} from '../../../../../shared/read-model-base.js';

export interface SpfIntentReadModel {
  readonly systemId: number;
  readonly intentId: number;
  readonly name: string; // generated as 'Intent_{intentId}' — no name column in DB
}

export interface SpfControlPortReadModel extends ReadModelBase {
  readonly portId: number; // control_ports.port_id (business key)
  readonly name: string;
  readonly isStatic: boolean;
  readonly allocatedIntents: SpfIntentReadModel[];
}
