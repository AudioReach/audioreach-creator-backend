/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  DuplicateIntentIdException,
  DuplicateIntentNameException,
  IntentPortIdNotFoundException,
  IntentPortNameNotFoundException,
  NullObjectException,
} from '../../common/exceptions/input-validation-exception.js';
import {StaticIntentDefinition} from './static-intent-definition.js';

export interface StaticControlPortDefinitionInit {
  portId: number;
  portName: string;
}

export class StaticControlPortDefinition {
  readonly portId: number;
  portName: string;
  readonly staticIntents: StaticIntentDefinition[] = [];

  constructor(initParam: StaticControlPortDefinitionInit) {
    this.portId = initParam.portId;
    this.portName = initParam.portName;
  }

  AddStaticIntent(staticIntent: StaticIntentDefinition) {
    // Validate unique intentIds
    if (!staticIntent) {
      throw new NullObjectException('Value is null');
    }

    if (!staticIntent) {
      throw new IntentPortIdNotFoundException();
    }

    if (!staticIntent.intentName) {
      throw new IntentPortNameNotFoundException();
    }

    const valueWithSameIntentId = this.staticIntents.some(
      v => v.intentId === staticIntent.intentId,
    );
    if (valueWithSameIntentId) {
      throw new DuplicateIntentIdException(
        `Intent Id: ${staticIntent.intentId} already exists for Port Id: ${this.portId}`,
      );
    }

    const valueWithSameIntentName = this.staticIntents.some(
      v => v.intentName === staticIntent.intentName,
    );
    if (valueWithSameIntentName) {
      throw new DuplicateIntentNameException(
        `Intent Name: ${staticIntent.intentName} already exists for Port Id: ${this.portId}`,
      );
    }

    this.staticIntents.push(staticIntent);
  }
}
