/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {type ModulePortStrategy, type AlsaFileType} from './types.js';
import {
  ProcessorConfigSchema,
  RtcConfigSchema,
  AlsaGroupSchema,
  AlsaLibConfigSchema,
  ConfigurationDataSchema,
  ConfigurationSchema,
} from './configuration.schema.js';
import {BaseDefinition} from '../definitions/common/base-definition.js';

export class ProcessorConfig extends BaseDefinition {
  name!: string;
  id!: number;
  pidSize!: number;
  rtcSize!: number;
  isEnabled!: boolean;

  static fromJSON(data: unknown): ProcessorConfig {
    const validated = ProcessorConfigSchema.parse(data);
    return Object.assign(new ProcessorConfig(), validated);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      id: this.id,
      pidSize: this.pidSize,
      rtcSize: this.rtcSize,
      isEnabled: this.isEnabled,
    };
  }
}

export class RtcConfig extends BaseDefinition {
  processors!: ProcessorConfig[];

  static fromJSON(data: unknown): RtcConfig {
    const validated = RtcConfigSchema.parse(data);
    return this.hydrateInstance(new RtcConfig(), validated, [
      {field: 'processors', hydrator: ProcessorConfig, isArray: true},
    ]);
  }

  toJSON(): Record<string, unknown> {
    return {processors: this.serializeField(this.processors)};
  }
}

export class AlsaGroup extends BaseDefinition {
  id!: number;
  name!: string;
  properties!: Array<{id: number}>;

  static fromJSON(data: unknown): AlsaGroup {
    const validated = AlsaGroupSchema.parse(data);
    return Object.assign(new AlsaGroup(), validated);
  }

  toJSON(): Record<string, unknown> {
    return {id: this.id, name: this.name, properties: this.properties};
  }
}

export class AlsaLibConfig extends BaseDefinition {
  includeTlvHeader!: boolean;
  fileType!: AlsaFileType;
  groups!: AlsaGroup[];

  static fromJSON(data: unknown): AlsaLibConfig {
    const validated = AlsaLibConfigSchema.parse(data);
    return this.hydrateInstance(new AlsaLibConfig(), validated, [
      {field: 'groups', hydrator: AlsaGroup, isArray: true},
    ]);
  }

  toJSON(): Record<string, unknown> {
    return {
      includeTlvHeader: this.includeTlvHeader,
      fileType: this.fileType,
      groups: this.serializeField(this.groups),
    };
  }
}

export class ConfigurationData extends BaseDefinition {
  portStrategy!: ModulePortStrategy;
  defaultProcessorDomain!: number;
  rtc!: RtcConfig;
  alsaLib!: AlsaLibConfig;

  static fromJSON(data: unknown): ConfigurationData {
    const validated = ConfigurationDataSchema.parse(data);
    return this.hydrateInstance(new ConfigurationData(), validated, [
      {field: 'rtc', hydrator: RtcConfig},
      {field: 'alsaLib', hydrator: AlsaLibConfig},
    ]);
  }

  toJSON(): Record<string, unknown> {
    return {
      portStrategy: this.portStrategy,
      defaultProcessorDomain: this.defaultProcessorDomain,
      rtc: this.serializeField(this.rtc),
      alsaLib: this.serializeField(this.alsaLib),
    };
  }
}

export class Configuration extends BaseDefinition {
  configuration!: ConfigurationData;

  static fromJSON(data: unknown): Configuration {
    const instance = new Configuration();
    const validated = ConfigurationSchema.parse(data);
    instance.configuration = ConfigurationData.fromJSON(validated);
    return instance;
  }

  toJSON(): Record<string, unknown> {
    return {configuration: this.serializeField(this.configuration)};
  }
}
