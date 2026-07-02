/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyDefinitionDownloadModel,
  TagDefinitionDownloadModel,
  SpfModuleDefinitionDownloadModel,
  DriverModuleDefinitionDownloadModel,
  SpfPropertyDefinitionDownloadModel,
  DriverPropertyDefinitionDownloadModel,
} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import {AwspKeyDefinition} from '../../shared/awsp-serializers/v1/definitions/key-definition/key-definition.js';
import {AwspValueDefinition} from '../../shared/awsp-serializers/v1/definitions/key-definition/value-definition.js';
import {AwspTagDefinition} from '../../shared/awsp-serializers/v1/definitions/tag-definition/tag-definition.js';
import {AwspTagKeyDefinition} from '../../shared/awsp-serializers/v1/definitions/tag-definition/tag-key-definition.js';
import type {SpecialKey} from '../../shared/awsp-serializers/v1/definitions/key-definition/type/special-key-type.js';
import {AwspSpfModuleDefinition} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/spf-module-definition.js';
import {AwspParamDefinition} from '../../shared/awsp-serializers/v1/definitions/module-definition/common/param-definition.js';
import {AwspDataPortsInfo} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/data-ports-info.js';
import {AwspPort} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/port.js';
import {AwspControlPortsInfo} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/control-ports-info.js';
import {AwspStaticControlPort} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/static-control-port.js';
import {AwspIntent} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/intent.js';
import {DriverModuleDefinition} from '../../shared/awsp-serializers/v1/definitions/module-definition/driver/driver-module-definition.js';
import {SpfPropertyDefinition} from '../../shared/awsp-serializers/v1/definitions/property-definition/spf-property-definition.js';
import {DriverPropertyDefinition} from '../../shared/awsp-serializers/v1/definitions/property-definition/driver-property-definition.js';

/**
 * Maps DB read models to AWSP serializer instances
 * ready for toJSON() serialization into definitions.json.
 *
 * Pure in-memory transform — no I/O, no ports, no framework dependencies.
 */
export class AwspDefinitionsMapper {
  toAwspKeyDefinitions(
    models: KeyDefinitionDownloadModel[],
  ): AwspKeyDefinition[] {
    return models.map(model => {
      const instance = new AwspKeyDefinition();
      instance.id = model.keyId;
      instance.name = model.name;
      instance.description = model.description;
      instance.isVoice = model.isVoice;
      instance.isDynamic = model.isDynamic;
      instance.isCalKey = model.isCalibrationKey;
      instance.isGraphKey = model.isGraphKey;
      instance.enumName = model.enumName;
      instance.enumMember = model.enumValue;
      instance.calKeyEnumMember = model.calKeyEnumValue;
      instance.graphKeyEnumMember = model.graphKeyEnumValue;
      instance.specialty = model.specialty
        ? (model.specialty as SpecialKey)
        : undefined;
      instance.values = model.values.map(v => {
        const val = new AwspValueDefinition();
        val.id = v.valueId;
        val.name = v.name;
        val.description = v.description;
        val.enumValue = v.enumValue;
        val.specialValue = v.specialValue;
        return val;
      });
      return instance;
    });
  }

  toAwspTagDefinitions(
    models: TagDefinitionDownloadModel[],
  ): AwspTagDefinition[] {
    return models.map(model => {
      const instance = new AwspTagDefinition();
      instance.id = model.tagId;
      instance.name = model.name;
      instance.description = model.description;
      instance.isVoice = model.isVoice;
      instance.enumName = model.enumName;
      instance.enumMember = model.enumValue;
      instance.keys = model.supportedKeys.map(sk => {
        const link = new AwspTagKeyDefinition();
        link.id = sk.keyId;
        link.name = sk.keyName;
        link.enumValue = sk.tagEnumValue;
        return link;
      });
      return instance;
    });
  }

  toAwspSpfModuleDefinitions(
    models: SpfModuleDefinitionDownloadModel[],
  ): AwspSpfModuleDefinition[] {
    return models.map(model => {
      const instance = new AwspSpfModuleDefinition();
      instance.id = model.moduleDefinitionId;
      instance.name = model.name;
      instance.displayName = model.displayName;
      instance.description = model.description;
      instance.groupName = model.groupName;
      instance.searchKeys = model.searchKeys;
      instance.stackSize = model.stackSize;
      instance.processors = model.supportedProcessorIds;
      instance.containerTypes = model.supportedContainerTypes;

      instance.parameters = model.params.map(p => {
        const param = new AwspParamDefinition();
        param.id = p.paramId;
        param.name = p.name ?? '';
        param.description = p.description;
        param.maxSize = p.maxSize;
        param.pidType = p.pidType as AwspParamDefinition['pidType'];
        param.elements = p.elementsStructure
          ? (JSON.parse(p.elementsStructure) as AwspParamDefinition['elements'])
          : [];
        param.isReadOnly = p.isReadOnly;
        param.toolPolicies = p.toolPolicies
          ? (JSON.parse(p.toolPolicies) as AwspParamDefinition['toolPolicies'])
          : [];
        return param;
      });

      const inputGroup = model.portGroups.find(g => g.portIoType === 'Input');
      if (inputGroup) {
        const info = new AwspDataPortsInfo();
        info.maxPortCount = inputGroup.maxPortCount;
        info.ports = inputGroup.ports.map(p => {
          const port = new AwspPort();
          port.id = p.portId;
          port.name = p.name;
          return port;
        });
        instance.inputPort = info;
      }

      const outputGroup = model.portGroups.find(g => g.portIoType === 'Output');
      if (outputGroup) {
        const info = new AwspDataPortsInfo();
        info.maxPortCount = outputGroup.maxPortCount;
        info.ports = outputGroup.ports.map(p => {
          const port = new AwspPort();
          port.id = p.portId;
          port.name = p.name;
          return port;
        });
        instance.outputPort = info;
      }

      if (
        model.staticControlPorts.length > 0 ||
        model.dynamicIntents.length > 0
      ) {
        const ctrlInfo = new AwspControlPortsInfo();
        ctrlInfo.staticPorts = model.staticControlPorts.map(sp => {
          const staticPort = new AwspStaticControlPort();
          staticPort.id = sp.portId;
          staticPort.name = sp.portName;
          staticPort.supportedIntents = sp.intents.map(i => {
            const intent = new AwspIntent();
            intent.id = i.intentId;
            intent.name = i.name;
            intent.maxports = 0;
            return intent;
          });
          return staticPort;
        });
        ctrlInfo.dynamicIntents = model.dynamicIntents.map(di => {
          const intent = new AwspIntent();
          intent.id = di.intentId;
          intent.name = di.name;
          intent.maxports = di.maxPort;
          return intent;
        });
        instance.controlPort = ctrlInfo;
      }

      return instance;
    });
  }

  toDriverModuleDefinitions(
    models: DriverModuleDefinitionDownloadModel[],
  ): DriverModuleDefinition[] {
    return models.map(model => {
      const instance = new DriverModuleDefinition();
      instance.id = model.moduleDefinitionId;
      instance.name = model.name;
      instance.description = model.description;

      instance.parameters = model.params.map(p => {
        const param = new AwspParamDefinition();
        param.id = p.parameterId;
        param.name = p.name ?? '';
        param.description = p.description;
        param.maxSize = p.maxSize;
        // toolPolicies and pidType are not stored for driver params — use safe defaults
        param.toolPolicies = [];
        param.pidType = 'None';
        param.elements = p.paramStructure
          ? (JSON.parse(p.paramStructure) as AwspParamDefinition['elements'])
          : [];
        return param;
      });

      return instance;
    });
  }

  toSpfPropertyDefinitions(
    models: SpfPropertyDefinitionDownloadModel[],
  ): SpfPropertyDefinition[] {
    return models.map(model => {
      const instance = new SpfPropertyDefinition();
      instance.id = model.propertyId;
      instance.name = model.name;
      instance.description = model.description;
      instance.maxSize = model.maxSize;
      instance.elements = model.elementsStructure
        ? (JSON.parse(model.elementsStructure) as SpfPropertyDefinition['elements'])
        : [];
      instance.categoryName = model.categoryName;
      // categoryId and apmModuleInstanceId are required positive integers but not
      // stored in the DB (see design §1.4). Use 1 as sentinel value.
      instance.categoryId = 1;
      instance.apmModuleInstanceId = 1;
      instance.isVoice = model.isVoice;
      return instance;
    });
  }

  toDriverPropertyDefinitions(
    models: DriverPropertyDefinitionDownloadModel[],
  ): DriverPropertyDefinition[] {
    return models.map(model => {
      const instance = new DriverPropertyDefinition();
      instance.id = model.propertyId;
      instance.name = model.name;
      instance.description = model.description;
      instance.maxSize = model.maxSize;
      instance.elements = model.propertyStructure
        ? (JSON.parse(model.propertyStructure) as DriverPropertyDefinition['elements'])
        : [];
      return instance;
    });
  }
}
