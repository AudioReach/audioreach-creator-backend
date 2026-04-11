/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  PropertyDefinition,
  type PropertyDefinitionInit,
} from '../common/entities/property-definition.js';
import {assertNonNull, invariant} from '../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

export class SubgraphPropertyDefinitions {
  readonly propertyDefinitions: SubgraphPropertyDefinition[] = [];
  private readonly propertyIds = new Set<string>();

  constructor(propertyDefinitions: SubgraphPropertyDefinition[]) {
    for (const prop of propertyDefinitions) {
      this.AddPropertyDefinition(prop);
    }
  }

  private AddPropertyDefinition(
    propertyDefinition: SubgraphPropertyDefinition,
  ): void {
    assertNonNull(propertyDefinition, 'Subgraph propertyDefinition is null');
    assertNonNull(
      propertyDefinition.systemId,
      'systemId is required for property in subgraph property',
    );
    assertNonNull(
      propertyDefinition.propertyId,
      'propertyId is required for property in subgraph property',
    );

    const sysKey = `sys:${propertyDefinition.systemId}`;
    const propKey = `prop:${propertyDefinition.propertyId}`;

    invariant(
      !this.propertyIds.has(sysKey),
      `SystemId ${BinaryUtils.toHexString(propertyDefinition.systemId)} already exists in Subgraph PropertyDefinition`,
    );
    invariant(
      !this.propertyIds.has(propKey),
      `PropertyId ${BinaryUtils.toHexString(propertyDefinition.propertyId)} already exists in Subgraph PropertyDefinition`,
    );

    this.propertyIds.add(sysKey);
    this.propertyIds.add(propKey);
    this.propertyDefinitions.push(propertyDefinition);
  }
}

export interface SubgraphPropertyDefinitionInit extends PropertyDefinitionInit {
  isVoice: boolean;
}

export class SubgraphPropertyDefinition extends PropertyDefinition {
  isVoice: boolean;
  constructor(initParam: SubgraphPropertyDefinitionInit) {
    super(initParam);
    this.isVoice = initParam.isVoice;
  }
}
