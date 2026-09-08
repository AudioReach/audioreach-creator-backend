/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParamDefinition} from './param-definition.js';
import {
  assertNonNull,
  invariant,
} from '../../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

export interface ModuleDefinitionInit {
  fileSystemId: number;
  systemId: number;
  naturalId: number;
  name: string;
  displayName: string;
  description?: string;
  groupName?: string;
  parameters?: ParamDefinition[];
  attributes?: Array<{name: string; value: string}>;
}

export abstract class ModuleDefinition {
  systemId: number;
  readonly naturalId: number;
  fileSystemId: number;
  name: string;
  displayName: string;
  description?: string;
  groupName?: string;
  readonly parameters: ParamDefinition[] = [];
  readonly attributes: Map<string, string> = new Map<string, string>();
  private readonly paramIds = new Set<string>();

  constructor(initParam: ModuleDefinitionInit) {
    this.systemId = initParam.systemId;
    this.naturalId = initParam.naturalId;
    this.fileSystemId = initParam.fileSystemId;
    this.name = initParam.name;
    this.displayName = initParam.displayName;
    this.description = initParam.description;
    this.groupName = initParam.groupName;
    for (const param of initParam.parameters ?? []) {
      this.AddParameter(param);
    }
    for (const attr of initParam.attributes ?? []) {
      this.AddAttribute(attr.name, attr.value);
    }
  }

  private AddParameter(paramDefinition: ParamDefinition) {
    assertNonNull(
      paramDefinition,
      `parameter value is null for module definitionId: ${BinaryUtils.toHexString(this.naturalId)})`,
    );
    assertNonNull(
      paramDefinition.systemId,
      `systemId is required for parameter in module ${BinaryUtils.toHexString(this.naturalId)}`,
    );
    assertNonNull(
      paramDefinition.naturalId,
      `paramId is required for parameter in module ${BinaryUtils.toHexString(this.naturalId)}`,
    );

    const sysKey = `sys:${paramDefinition.systemId}`;
    const paramKey = `param:${paramDefinition.naturalId}`;

    invariant(
      !this.paramIds.has(sysKey),
      `SystemId ${BinaryUtils.toHexString(paramDefinition.systemId)} already exists in ModuleDefinition for key: ${BinaryUtils.toHexString(this.naturalId)}`,
    );
    invariant(
      !this.paramIds.has(paramKey),
      `ParamId ${paramDefinition.naturalId} already exists in ModuleDefinition for key: ${BinaryUtils.toHexString(this.naturalId)}`,
    );

    this.paramIds.add(sysKey);
    this.paramIds.add(paramKey);
    this.parameters.push(paramDefinition);
  }

  private AddAttribute(name: string, value: string): void {
    assertNonNull(
      name,
      `name is required for SPF module definition :${BinaryUtils.toHexString(this.naturalId)} attribute`,
    );
    assertNonNull(
      value,
      `value is required for SPF module definition :${BinaryUtils.toHexString(this.naturalId)} attribute`,
    );

    invariant(
      !this.attributes.has(name),
      `Attribute name: ${name} already exists for SPF Module Definition: ${BinaryUtils.toHexString(this.naturalId)}`,
    );
    this.attributes.set(name, value);
  }
}
