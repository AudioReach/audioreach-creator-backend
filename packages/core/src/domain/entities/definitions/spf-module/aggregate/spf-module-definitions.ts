/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Attribute} from '../../../common/value-objects/attribute.js';
import {DataPortGroupDefinition} from '../value-objects/data-port-group-definition.js';
import {DynamicIntentDefinition} from '../value-objects/dynamic-intent-definition.js';
import {StaticControlPortDefinition} from '../value-objects/static-control-port-definition.js';
import {
  ModuleDefinition,
  type ModuleDefinitionInit,
} from '../../common/entities/module-definition.js';
import {
  NotDefinedAttributeException,
  DuplicateAttributeNameException,
  DuplicateContainerTypeReferenceIdException,
  DuplicateIntentIdException,
  DuplicateIntentNameException,
  DuplicatePortIdException,
  DuplicatePortNameException,
  DuplicateProcessorDefinitionReferenceIdException,
  IntentIdNotFoundException,
  IntentNameNotFoundException,
  NullObjectException,
  StaticPortIdNotFoundException,
} from '../../common/exceptions/input-validation-exception.js';

export interface SpfModuleDefinitionInit extends ModuleDefinitionInit {
  inputDataPortsGroup: DataPortGroupDefinition;
  outputDataPortsGroup: DataPortGroupDefinition;
  staticControlPorts: StaticControlPortDefinition[];
  processorSystemIds: number[];
  containerTypesSystemIds: number[];
  metaData?: ModuleDefinitionMetaData;
  dynamicIntents?: DynamicIntentDefinition[];
}

export class ModuleDefinitionMetaData {
  value?: string;

  constructor(value: string) {
    this.value = value;
  }
}

export class SpfModuleDefinition extends ModuleDefinition {
  attributes: Attribute[] = [];
  metaData: ModuleDefinitionMetaData = new ModuleDefinitionMetaData(''); //ToDo
  readonly inputDataPortsGroup: DataPortGroupDefinition;
  readonly outputDataPortsGroup: DataPortGroupDefinition;
  readonly staticControlPorts: StaticControlPortDefinition[] = [];
  readonly dynamicIntents: DynamicIntentDefinition[] = [];
  readonly processorSystemIds: number[] = [];
  readonly containerTypesSystemIds: number[] = [];

  constructor(initParam: SpfModuleDefinitionInit) {
    super(initParam);
    this.inputDataPortsGroup = initParam.inputDataPortsGroup;
    this.outputDataPortsGroup = initParam.outputDataPortsGroup;
    this.staticControlPorts = initParam.staticControlPorts;
    this.processorSystemIds = initParam.processorSystemIds;
    this.containerTypesSystemIds = initParam.containerTypesSystemIds;
  }

  AddAttribute(attribute: Attribute) {
    if (!attribute || !attribute.name || !attribute.value) {
      throw new NotDefinedAttributeException(attribute);
    }

    const existingAttribute = this.attributes.some(
      a => a.name === attribute.name,
    );
    if (existingAttribute) {
      throw new DuplicateAttributeNameException(
        `Attribute name: ${attribute.name} already exists for SPF Module Definition: ${this.moduleDefinitionId}`,
      );
    }

    this.attributes.push(attribute);
  }

  AddDynamicIntentDefinition(dynamicIntentDefinition: DynamicIntentDefinition) {
    if (!dynamicIntentDefinition) {
      throw new NullObjectException('Value is null');
    }

    if (!dynamicIntentDefinition.intentId) {
      throw new IntentIdNotFoundException();
    }

    if (!dynamicIntentDefinition.name) {
      throw new IntentNameNotFoundException();
    }

    const valueWithSameIntentId = this.dynamicIntents.some(
      v => v.intentId === dynamicIntentDefinition.intentId,
    );
    if (valueWithSameIntentId) {
      throw new DuplicateIntentIdException(
        `Intent Id: ${dynamicIntentDefinition.intentId} already exists for SPF Module Definition: ${this.moduleDefinitionId}`,
      );
    }

    const valueWithSamePortName = this.dynamicIntents.some(
      v => v.name === dynamicIntentDefinition.name,
    );
    if (valueWithSamePortName) {
      throw new DuplicateIntentNameException(
        `Intent Name: ${dynamicIntentDefinition.name} already exists for SPF Module Definition: ${this.moduleDefinitionId}`,
      );
    }

    this.dynamicIntents.push(dynamicIntentDefinition);
  }

  AddStaticControlPort(staticPort: StaticControlPortDefinition) {
    if (!staticPort) {
      throw new NullObjectException('Value is null');
    }

    if (!staticPort.portId) {
      throw new StaticPortIdNotFoundException();
    }

    const valueWithSamePortId = this.staticControlPorts.some(
      v => v.portId === staticPort.portId,
    );
    if (valueWithSamePortId) {
      throw new DuplicatePortIdException(
        `Port Id: ${staticPort.portId} already exists for SPF Module Definition: ${this.moduleDefinitionId}`,
      );
    }

    const valueWithSamePortName = this.staticControlPorts.some(
      v => v.portName === staticPort.portName,
    );
    if (valueWithSamePortName) {
      throw new DuplicatePortNameException(
        `Port Name: ${staticPort.portName} already exists for SPF Module Definition: ${this.moduleDefinitionId}`,
      );
    }

    this.staticControlPorts.push(staticPort);
  }

  AddProcessDefinition(processorDefinitionReferenceId: number) {
    if (processorDefinitionReferenceId == null) {
      throw new NullObjectException('Value is null');
    }

    const existingProcessorDefinitionReferenceId = this.processorSystemIds.find(
      id => id === processorDefinitionReferenceId,
    );
    if (existingProcessorDefinitionReferenceId) {
      throw new DuplicateProcessorDefinitionReferenceIdException(
        `Processor Definition Reference Id: ${processorDefinitionReferenceId} already exists for SPF Module Definition: ${this.moduleDefinitionId}`,
      );
    }

    this.processorSystemIds.push(processorDefinitionReferenceId);
  }

  AddContainerType(containerTypeReferenceIds: number) {
    if (containerTypeReferenceIds == null) {
      throw new NullObjectException('Value is null');
    }

    const existingContainerTypeReferenceId = this.containerTypesSystemIds.find(
      id => id === containerTypeReferenceIds,
    );
    if (existingContainerTypeReferenceId) {
      throw new DuplicateContainerTypeReferenceIdException(
        `Container Type Reference Id: ${containerTypeReferenceIds} already exists for SPF Module Definition: ${this.moduleDefinitionId}`,
      );
    }

    this.containerTypesSystemIds.push(containerTypeReferenceIds);
  }
}
