/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {StaticIntentDefinition} from './static-intent-definition.js';
import {
  assertNonNull,
  invariant,
} from '../../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

export interface StaticControlPortDefinitionInit {
  naturalId: number;
  portName: string;
}

export class StaticControlPortDefinition {
  readonly naturalId: number;
  portName: string;
  readonly staticIntents: StaticIntentDefinition[] = [];
  private readonly intentIds = new Set<string>();

  constructor(initParam: StaticControlPortDefinitionInit) {
    this.naturalId = initParam.naturalId;
    this.portName = initParam.portName;
  }

  AddStaticIntent(staticIntent: StaticIntentDefinition) {
    assertNonNull(
      staticIntent,
      `staticIntent is null for port ${BinaryUtils.toHexString(this.naturalId)}`,
    );
    assertNonNull(
      staticIntent.naturalId,
      `intentId is required for static intent in port ${BinaryUtils.toHexString(this.naturalId)}`,
    );
    assertNonNull(
      staticIntent.name,
      `intentName is required for static intent in port ${BinaryUtils.toHexString(this.naturalId)}`,
    );

    const idKey = `id:${staticIntent.naturalId}`;
    const nameKey = `name:${staticIntent.name}`;

    invariant(
      !this.intentIds.has(idKey),
      `Intent Id: ${BinaryUtils.toHexString(staticIntent.naturalId)} already exists for Port Id: ${BinaryUtils.toHexString(this.naturalId)}`,
    );
    invariant(
      !this.intentIds.has(nameKey),
      `Intent Name: ${staticIntent.name} already exists for Port Id: ${BinaryUtils.toHexString(this.naturalId)}`,
    );

    this.intentIds.add(idKey);
    this.intentIds.add(nameKey);
    this.staticIntents.push(staticIntent);
  }
}
