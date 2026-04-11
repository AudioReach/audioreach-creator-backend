/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {PropertyDefinition} from '../common/entities/property-definition.js';
import {assertNonNull, invariant} from '../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

/**
 * Represents the collection of SPF properties belonging to a container definition.
 * Extends PropertyCategory which holds the list of PropertyDefinition entries.
 */
export class ContainerPropertyDefinitions {
  readonly items: PropertyDefinition[] = [];
  private readonly propertyIds = new Set<string>();

  constructor(items: PropertyDefinition[]) {
    for (const item of items) {
      this.AddProperty(item);
    }
  }

  private AddProperty(propertyDefinition: PropertyDefinition) {
    assertNonNull(propertyDefinition, `Container propertyDefinition is null`);

    assertNonNull(
      propertyDefinition.systemId,
      'systemId is null for container property',
    );

    assertNonNull(
      propertyDefinition.propertyId,
      'propertyId is null for container property',
    );

    const sysKey = `sys:${propertyDefinition.systemId}`;
    const propKey = `prop:${propertyDefinition.propertyId}`;

    invariant(
      !this.propertyIds.has(sysKey),
      `SystemId ${BinaryUtils.toHexString(propertyDefinition.systemId)} already exists in container property definitions`,
    );
    invariant(
      !this.propertyIds.has(propKey),
      `PropertyId ${BinaryUtils.toHexString(propertyDefinition.propertyId)} already exists in container property definitions`,
    );

    this.propertyIds.add(sysKey);
    this.propertyIds.add(propKey);
    this.items.push(propertyDefinition);
  }
}
