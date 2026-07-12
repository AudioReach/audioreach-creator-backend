/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DataPortGroupDefinition} from './value-objects/data-port-group-definition.js';
import {DynamicIntentDefinition} from './value-objects/dynamic-intent-definition.js';
import {StaticControlPortDefinition} from './value-objects/static-control-port-definition.js';
import {
  ModuleDefinition,
  type ModuleDefinitionInit,
} from '../common/entities/module-definition.js';
import {assertNonNull, invariant} from '../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

export interface SpfModuleDefinitionInit extends ModuleDefinitionInit {
  modSearchKeys?: string;
  stackSize: number;
  dataPortGroups: DataPortGroupDefinition[];
  staticControlPorts: StaticControlPortDefinition[];
  dynamicIntents?: DynamicIntentDefinition[];
  processorSystemId: number;
  containerTypesSystemIds: number[];
  metaData?: string;
  isLoadedAtBootup?: boolean;
}

export class SpfModuleDefinition extends ModuleDefinition {
  metadata?: string;
  modSearchKeys?: string;
  stackSize: number;
  readonly dataPortGroups: DataPortGroupDefinition[] = [];
  readonly staticControlPorts: StaticControlPortDefinition[] = [];
  readonly dynamicIntents: DynamicIntentDefinition[] = [];
  processorSystemId: number;
  readonly containerTypesSystemIds: Set<number> = new Set<number>();
  readonly isLoadedAtBootup: boolean;

  private readonly dynamicIntentIds = new Set<string>();
  private readonly staticPortIds = new Set<string>();

  constructor(initParam: SpfModuleDefinitionInit) {
    super(initParam);
    this.dataPortGroups = initParam.dataPortGroups;
    this.metadata = initParam.metaData;
    this.modSearchKeys = initParam.modSearchKeys;
    this.stackSize = initParam.stackSize;
    this.processorSystemId = initParam.processorSystemId;
    for (const port of initParam.staticControlPorts) {
      this.AddStaticControlPort(port);
    }
    for (const intent of initParam.dynamicIntents ?? []) {
      this.AddDynamicIntentDefinition(intent);
    }
    for (const id of initParam.containerTypesSystemIds) {
      this.AddContainerType(id);
    }
    this.isLoadedAtBootup = initParam.isLoadedAtBootup ?? false;
  }

  private AddDynamicIntentDefinition(
    dynamicIntentDefinition: DynamicIntentDefinition,
  ) {
    assertNonNull(
      dynamicIntentDefinition,
      `dynamicIntentDefinition is null for module ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );
    assertNonNull(
      dynamicIntentDefinition.intentId,
      `intentId is required for dynamic intent in module ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );
    assertNonNull(
      dynamicIntentDefinition.name,
      `name is required for dynamic intent in module ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );

    const idKey = `id:${dynamicIntentDefinition.intentId}`;
    const nameKey = `name:${dynamicIntentDefinition.name}`;

    invariant(
      !this.dynamicIntentIds.has(idKey),
      `Intent Id: ${BinaryUtils.toHexString(dynamicIntentDefinition.intentId)} already exists for SPF Module Definition: ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );
    invariant(
      !this.dynamicIntentIds.has(nameKey),
      `Intent Name: ${dynamicIntentDefinition.name} already exists for SPF Module Definition: ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );

    this.dynamicIntentIds.add(idKey);
    this.dynamicIntentIds.add(nameKey);
    this.dynamicIntents.push(dynamicIntentDefinition);
  }

  private AddStaticControlPort(staticPort: StaticControlPortDefinition) {
    assertNonNull(staticPort, 'staticPort is null');
    assertNonNull(
      staticPort.portId,
      `portId is required for static control port in module ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );

    const idKey = `id:${staticPort.portId}`;
    const nameKey = `name:${staticPort.portName}`;

    invariant(
      !this.staticPortIds.has(idKey),
      `Port Id: ${BinaryUtils.toHexString(staticPort.portId)} already exists for SPF Module Definition: ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );
    invariant(
      !this.staticPortIds.has(nameKey),
      `Port Name: ${staticPort.portName} already exists for SPF Module Definition: ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );

    this.staticPortIds.add(idKey);
    this.staticPortIds.add(nameKey);
    this.staticControlPorts.push(staticPort);
  }

  private AddContainerType(containerTypeReferenceIds: number) {
    assertNonNull(
      containerTypeReferenceIds,
      `containerTypeReferenceIds is null for SPF Module Definition: ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );

    invariant(
      !this.containerTypesSystemIds.has(containerTypeReferenceIds),
      `Container Type Reference Id: ${BinaryUtils.toHexString(containerTypeReferenceIds)} already exists for SPF Module Definition: ${BinaryUtils.toHexString(this.moduleDefinitionId)}`,
    );

    this.containerTypesSystemIds.add(containerTypeReferenceIds);
  }
}
