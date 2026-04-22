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
  moduleDefinitionId: number;
  name: string;
  displayName: string;
  description?: string;
  groupName?: string;
  parameters?: ParamDefinition[];
  attributes?: Array<{name: string; value: string}>;
}

export abstract class ModuleDefinition {
  systemId: number;
  readonly moduleDefinitionId: number;
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
    this.moduleDefinitionId = initParam.moduleDefinitionId;
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
      `parameter value is null for module definitionId: ${BinaryUtils.toHexString(this.moduleDefinitionId)})`,
    );
    assertNonNull(
      paramDefinition.systemId,
      `systemId is required for parameter in module ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );
    assertNonNull(
      paramDefinition.paramId,
      `paramId is required for parameter in module ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );

    const sysKey = `sys:${paramDefinition.systemId}`;
    const paramKey = `param:${paramDefinition.paramId}`;

    invariant(
      !this.paramIds.has(sysKey),
      `SystemId ${BinaryUtils.toHexString(paramDefinition.systemId)} already exists in ModuleDefinition for key: ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );
    invariant(
      !this.paramIds.has(paramKey),
      `ParamId ${paramDefinition.paramId} already exists in ModuleDefinition for key: ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );

    this.paramIds.add(sysKey);
    this.paramIds.add(paramKey);
    this.parameters.push(paramDefinition);
  }

  private AddAttribute(name: string, value: string): void {
    assertNonNull(
      name,
      `name is required for SPF module definition :${BinaryUtils.toHexString(this.moduleDefinitionId)} attribute`,
    );
    assertNonNull(
      value,
      `value is required for SPF module definition :${BinaryUtils.toHexString(this.moduleDefinitionId)} attribute`,
    );

    invariant(
      !this.attributes.has(name),
      `Attribute name: ${name} already exists for SPF Module Definition: ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );
    this.attributes.set(name, value);
  }
}
