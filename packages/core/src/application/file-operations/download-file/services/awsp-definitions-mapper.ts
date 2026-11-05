/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  KeyDefinitionDownloadModel,
  TagDefinitionDownloadModel,
  SpfModuleDefinitionDownloadModel,
  SpfParamDefDownloadModel,
  DriverModuleDefinitionDownloadModel,
  DriverPropertyDefinitionDownloadModel,
  ProcessorDefinitionDownloadModel,
  ContainerTypeDefinitionDownloadModel,
  SpfPropertyDefinitionDownloadModel,
  VcpmModuleDefinitionDownloadModel,
} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import {AwspKeyDefinition} from '../../shared/awsp-serializers/v1/definitions/key-definition/key-definition.js';
import {AwspValueDefinition} from '../../shared/awsp-serializers/v1/definitions/key-definition/value-definition.js';
import {AwspTagDefinition} from '../../shared/awsp-serializers/v1/definitions/tag-definition/tag-definition.js';
import {AwspTagKeyDefinition} from '../../shared/awsp-serializers/v1/definitions/tag-definition/tag-key-definition.js';
import type {SpecialKey} from '../../shared/awsp-serializers/v1/definitions/key-definition/type/special-key-type.js';
import {PARAM_TYPE} from '../../../../domain/entities/definitions/common/types/param-type.js';
import {SPECIALTY_KEY} from '../../../../domain/entities/definitions/common/types/speciality-type.js';
import {TOOL_POLICY} from '../../../../domain/entities/definitions/common/types/tool-policy-type.js';
import {AwspSpfModuleDefinition} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/spf-module-definition.js';
import {AwspParamDefinition} from '../../shared/awsp-serializers/v1/definitions/module-definition/common/param-definition.js';
import {AwspDataPortsInfo} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/data-ports-info.js';
import {AwspPort} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/port.js';
import {AwspControlPortsInfo} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/control-ports-info.js';
import {AwspStaticControlPort} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/static-control-port.js';
import {AwspIntent} from '../../shared/awsp-serializers/v1/definitions/module-definition/spf/intent.js';
import {DriverModuleDefinition} from '../../shared/awsp-serializers/v1/definitions/module-definition/driver/driver-module-definition.js';
import {AwspVcpmModuleDefinition} from '../../shared/awsp-serializers/v1/definitions/module-definition/vcpm/vcpm-module-definition.js';
import {
  SpfPropertyDefinition,
  CATEGORY_ID_BY_NAME,
} from '../../shared/awsp-serializers/v1/definitions/property-definition/spf-property-definition.js';
import {DriverPropertyDefinition} from '../../shared/awsp-serializers/v1/definitions/property-definition/driver-property-definition.js';
import {ProcessorDefinition} from '../../shared/awsp-serializers/v1/definitions/processor-definition/processor-definition.js';
import {ContainerType} from '../../shared/awsp-serializers/v1/definitions/container-type/container-type.js';

/**
 * Maps DB read models to AWSP serializer instances
 * ready for toJSON() serialization into definitions.json.
 *
 * Pure in-memory transform — no I/O, no ports, no framework dependencies.
 */
export class AwspDefinitionsMapper {
  private static readonly SPECIALTY_KEY_BY_VALUE: Map<string, string> = new Map(
    Object.entries(SPECIALTY_KEY).map(([k, v]) => [v, k]),
  );

  private static readonly PARAM_TYPE_BY_VALUE: Map<string, string> = new Map(
    Object.entries(PARAM_TYPE).map(([k, v]) => [v, k]),
  );

  private static readonly TOOL_POLICY_BY_VALUE: Map<string, string> = new Map(
    Object.entries(TOOL_POLICY).map(([k, v]) => [v, k]),
  );

  toAwspKeyDefinitions(
    models: KeyDefinitionDownloadModel[],
  ): AwspKeyDefinition[] {
    return models.map(model => {
      const instance = new AwspKeyDefinition();
      instance.id = model.keyNaturalId;
      instance.name = model.name;
      instance.description = model.description ?? undefined;
      instance.isVoice = model.isVoice ?? undefined;
      instance.isDynamic = model.isDynamic ?? undefined;
      instance.isCalKey = model.isCalibrationKey ?? undefined;
      instance.isGraphKey = model.isGraphKey ?? undefined;
      instance.isSpfKey = model.isSpfKey ?? undefined;
      instance.enumName = model.enumName ?? undefined;
      instance.enumMember = model.enumMember ?? undefined;
      instance.calKeyEnumMember = model.calKeyEnumMember ?? undefined;
      instance.graphKeyEnumMember = model.graphKeyEnumMember ?? undefined;
      instance.specialty = model.specialityKeyValue
        ? (AwspDefinitionsMapper.reverseMap(
            AwspDefinitionsMapper.SPECIALTY_KEY_BY_VALUE,
            AwspDefinitionsMapper.parseJson<{key: string}>(
              model.specialityKeyValue,
              'specialityKeyValue',
              `key '${model.name}'`,
            ).key,
            'SPECIALTY_KEY',
            `key '${model.name}'`,
          ) as SpecialKey)
        : undefined;
      instance.values = model.values.map(v => {
        const val = new AwspValueDefinition();
        val.id = v.valueNaturalId;
        val.name = v.name;
        val.description = v.description ?? undefined;
        val.enumMember = v.enumMember ?? undefined;
        val.specialValue = v.specialValue ?? undefined;
        return val;
      });
      return instance;
    });
  }

  toAwspTagDefinitions(
    models: TagDefinitionDownloadModel[],
  ): AwspTagDefinition[] {
    return models
      .filter(model => model.name !== '') // skip ACDB-only stub defs (no AWSP entry)
      .map(model => {
        const instance = new AwspTagDefinition();
        instance.id = model.tagNaturalId;
        instance.name = model.name;
        instance.description = model.description ?? undefined;
        instance.isVoice = model.isVoice === true ? true : undefined;
        instance.enumName = model.enumName ?? undefined;
        instance.enumMember = model.enumMember ?? undefined;
        instance.isSpfTag = model.isSpfTag === true ? true : undefined;
        if (model.supportedKeys.length > 0) {
          instance.keys = model.supportedKeys.map(sk => {
            const link = new AwspTagKeyDefinition();
            link.id = sk.keyNaturalId;
            link.name = sk.keyName;
            link.enumMember = sk.enumValue;
            return link;
          });
        }
        return instance;
      });
  }

  toAwspSpfModuleDefinitions(
    models: SpfModuleDefinitionDownloadModel[],
  ): AwspSpfModuleDefinition[] {
    return models.map(model => {
      const instance = new AwspSpfModuleDefinition();
      instance.id = model.naturalId;
      instance.name = model.name;
      instance.displayName = model.displayName ?? undefined;
      instance.description = model.description ?? undefined;
      instance.groupName = model.groupName ?? undefined;
      instance.replacedBy = model.replacedBy ?? undefined;
      instance.builtIn = model.builtIn ?? undefined;
      instance.isOffloadable = model.isOffloadable ?? undefined;
      instance.searchKeys = model.searchKeys ?? undefined;
      instance.stackSize = model.stackSize;
      instance.processors = model.supportedProcessorIds;
      instance.containerTypes = model.supportedContainerTypes;

      instance.parameters = model.params.map(p =>
        AwspDefinitionsMapper.buildSpfParam(p),
      );

      const inputGroup = model.portGroups.find(g => g.portIoType === 'Input');
      if (
        inputGroup &&
        (inputGroup.maxPortCount > 0 || inputGroup.ports.length > 0)
      ) {
        const info = new AwspDataPortsInfo();
        info.maxPortCount = inputGroup.maxPortCount;
        info.ports = inputGroup.ports.map(p => {
          const port = new AwspPort();
          port.id = p.portNaturalId;
          port.name = p.name;
          return port;
        });
        instance.inputPort = info;
      }

      const outputGroup = model.portGroups.find(g => g.portIoType === 'Output');
      if (
        outputGroup &&
        (outputGroup.maxPortCount > 0 || outputGroup.ports.length > 0)
      ) {
        const info = new AwspDataPortsInfo();
        info.maxPortCount = outputGroup.maxPortCount;
        info.ports = outputGroup.ports.map(p => {
          const port = new AwspPort();
          port.id = p.portNaturalId;
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
          staticPort.id = sp.portNaturalId;
          staticPort.name = sp.portName;
          staticPort.intents = sp.intents.map(i => {
            const intent = new AwspIntent();
            intent.id = i.intentNaturalId;
            intent.name = i.name;
            intent.maxPortCount = i.maxPortCount ?? 0;
            return intent;
          });
          return staticPort;
        });
        ctrlInfo.dynamicIntents = model.dynamicIntents.map(di => {
          const intent = new AwspIntent();
          intent.id = di.intentNaturalId;
          intent.name = di.name;
          intent.maxPortCount = di.maxPort ?? 0;
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
      instance.id = model.naturalId;
      instance.name = model.name;
      instance.description = model.description ?? undefined;

      instance.parameters = model.params.map(p => {
        const param = new AwspParamDefinition();
        param.id = p.naturalId;
        param.name = p.name ?? '';
        param.description = p.description ?? undefined;
        param.maxSize = p.maxSize;
        // toolPolicies and pidType are not stored for driver params — use safe defaults
        param.toolPolicies = [];
        param.pidType = 'None';
        param.elements = p.paramStructure
          ? AwspDefinitionsMapper.parseJson<AwspParamDefinition['elements']>(
              p.paramStructure,
              'paramStructure',
              `driver param ${p.naturalId}`,
            )
          : [];
        return param;
      });

      return instance;
    });
  }

  toVcpmModuleDefinitions(
    models: VcpmModuleDefinitionDownloadModel[],
  ): AwspVcpmModuleDefinition[] {
    return models.map(model => {
      const instance = new AwspVcpmModuleDefinition();
      instance.id = model.naturalId;
      instance.name = model.name;
      instance.displayName = model.displayName ?? undefined;
      instance.description = model.description ?? undefined;
      instance.replacedBy = model.replacedBy ?? undefined;

      instance.parameters = model.params.map(p => {
        const param = new AwspParamDefinition();
        param.id = p.naturalId;
        param.name = p.name ?? '';
        param.description = p.description ?? undefined;
        param.maxSize = p.maxSize;
        param.deprecated = p.deprecated ?? undefined;
        param.isReadOnly = p.isReadOnly === true ? true : undefined;
        param.pidType = AwspDefinitionsMapper.reverseMap(
          AwspDefinitionsMapper.PARAM_TYPE_BY_VALUE,
          p.pidType,
          'PARAM_TYPE',
          `vcpm param ${p.naturalId}`,
          'None',
        ) as AwspParamDefinition['pidType'];
        const rawPolicies = p.toolPolicies
          ? AwspDefinitionsMapper.parseJson<string[]>(
              p.toolPolicies,
              'toolPolicies',
              `vcpm param ${p.naturalId}`,
            )
          : [];
        param.toolPolicies = rawPolicies
          .filter((v): v is string => v != null)
          .map(v =>
            AwspDefinitionsMapper.reverseMap(
              AwspDefinitionsMapper.TOOL_POLICY_BY_VALUE,
              v,
              'TOOL_POLICY',
              `vcpm param ${p.naturalId}`,
            ),
          )
          .filter(
            (v): v is string => v !== undefined,
          ) as AwspParamDefinition['toolPolicies'];
        param.elements = p.paramStructure
          ? AwspDefinitionsMapper.parseJson<AwspParamDefinition['elements']>(
              p.paramStructure,
              'paramStructure',
              `vcpm param ${p.naturalId}`,
            )
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
      instance.id = model.propertyNaturalId;
      instance.name = model.name;
      instance.description = model.description ?? undefined;
      instance.maxSize = model.maxSize;
      instance.elements = model.elementsStructure
        ? AwspDefinitionsMapper.parseJson<SpfPropertyDefinition['elements']>(
            model.elementsStructure,
            'elementsStructure',
            `spf property ${model.propertyNaturalId}`,
          )
        : [];
      instance.categoryName = model.categoryName;
      instance.categoryId = CATEGORY_ID_BY_NAME[model.categoryName] ?? 1;
      instance.apmModuleInstanceId = 1;
      instance.isVoice = model.isVoice === true ? true : undefined;
      return instance;
    });
  }

  toDriverPropertyDefinitions(
    models: DriverPropertyDefinitionDownloadModel[],
  ): DriverPropertyDefinition[] {
    return models.map(model => {
      const instance = new DriverPropertyDefinition();
      instance.id = model.propertyNaturalId;
      instance.name = model.name;
      instance.description = model.description ?? undefined;
      instance.maxSize = model.maxSize;
      instance.elements = model.propertyStructure
        ? AwspDefinitionsMapper.parseJson<DriverPropertyDefinition['elements']>(
            model.propertyStructure,
            'propertyStructure',
            `driver property ${model.propertyNaturalId}`,
          )
        : [];
      return instance;
    });
  }

  toProcessorDefinitions(
    models: ProcessorDefinitionDownloadModel[],
  ): ProcessorDefinition[] {
    return models.map(model => {
      const instance = new ProcessorDefinition();
      instance.id = model.processorDefinitionNaturalId;
      instance.name = model.name;
      return instance;
    });
  }

  toContainerTypeDefinitions(
    models: ContainerTypeDefinitionDownloadModel[],
  ): ContainerType[] {
    return models.map(model => {
      const instance = new ContainerType();
      instance.id = model.value;
      instance.name = model.name;
      return instance;
    });
  }

  private static buildSpfParam(
    p: SpfParamDefDownloadModel,
  ): AwspParamDefinition {
    const param = new AwspParamDefinition();
    param.id = p.paramNaturalId;
    param.name = p.name ?? '';
    param.description = p.description ?? undefined;
    param.maxSize = p.maxSize;
    param.pidType = AwspDefinitionsMapper.reverseMap(
      AwspDefinitionsMapper.PARAM_TYPE_BY_VALUE,
      p.pidType,
      'PARAM_TYPE',
      `param ${p.paramNaturalId}`,
      'None',
    ) as AwspParamDefinition['pidType'];
    param.elements = p.elementsStructure
      ? AwspDefinitionsMapper.parseJson<AwspParamDefinition['elements']>(
          p.elementsStructure,
          'elementsStructure',
          `spf param ${p.paramNaturalId}`,
        )
      : [];
    param.isReadOnly = p.isReadOnly === true ? true : undefined;
    param.isHidden = p.isHidden === true ? true : undefined;
    param.deprecated = p.deprecated ?? undefined;
    param.copySrcParamId = p.copySrcParamNaturalId ?? undefined;
    const rawPolicies = p.toolPolicies
      ? AwspDefinitionsMapper.parseJson<string[]>(
          p.toolPolicies,
          'toolPolicies',
          `spf param ${p.paramNaturalId}`,
        )
      : [];
    param.toolPolicies = rawPolicies
      .filter((v): v is string => v != null)
      .map(v =>
        AwspDefinitionsMapper.reverseMap(
          AwspDefinitionsMapper.TOOL_POLICY_BY_VALUE,
          v,
          'TOOL_POLICY',
          `param ${p.paramNaturalId}`,
        ),
      )
      .filter(
        (v): v is string => v !== undefined,
      ) as AwspParamDefinition['toolPolicies'];
    return param;
  }

  private static reverseMap(
    map: Map<string, string>,
    value: string,
    enumName: string,
    context: string,
    fallback?: string,
  ): string | undefined {
    const key = map.get(value);
    if (key !== undefined) return key;
    if (fallback !== undefined) return fallback;
    throw new Error(
      `Unknown ${enumName} value '${value}' encountered for ${context}`,
    );
  }

  private static parseJson<T>(raw: string, field: string, context: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(
        `Malformed JSON in field '${field}' for ${context}: ${raw}`,
      );
    }
  }
}
