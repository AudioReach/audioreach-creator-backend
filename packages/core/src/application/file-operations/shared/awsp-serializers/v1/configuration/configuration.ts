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
  TreatWarningAsErrorSchema,
  ValidationConfigSchema,
  AlsaFileGroupSchema,
  AlsaFileInfoSchema,
  AlsaSubgraphMetaDataSchema,
  AlsaMetaDataSchema,
  AlsaTagKeyValueSchema,
  AlsaSubgraphTagDataSchema,
  AlsaTagDataSchema,
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

// ─── Validation classes ───────────────────────────────────────────────────────

export class TreatWarningAsError extends BaseDefinition {
  mode?: string;
  warningAsErrorCodes!: string[];

  static fromJSON(data: unknown): TreatWarningAsError {
    const validated = TreatWarningAsErrorSchema.parse(data);
    return Object.assign(new TreatWarningAsError(), validated);
  }

  toJSON(): Record<string, unknown> {
    return {mode: this.mode, warningAsErrorCodes: this.warningAsErrorCodes};
  }
}

export class ValidationConfig extends BaseDefinition {
  optionalSelectedValidations!: string[];
  ignoreErrorCodes!: string[];
  ignoreWarningCodes!: string[];
  treatWarningAsError?: TreatWarningAsError;

  static fromJSON(data: unknown): ValidationConfig {
    const validated = ValidationConfigSchema.parse(data);
    return this.hydrateInstance(
      new ValidationConfig(),
      validated as Record<string, unknown>,
      [{field: 'treatWarningAsError', hydrator: TreatWarningAsError}],
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      optionalSelectedValidations: this.optionalSelectedValidations,
      ignoreErrorCodes: this.ignoreErrorCodes,
      ignoreWarningCodes: this.ignoreWarningCodes,
      treatWarningAsError: this.serializeField(this.treatWarningAsError),
    };
  }
}

// ─── AlsaMetaData classes ─────────────────────────────────────────────────────

export class AlsaFileGroup extends BaseDefinition {
  id!: number;
  name!: string;

  static fromJSON(data: unknown): AlsaFileGroup {
    const validated = AlsaFileGroupSchema.parse(data);
    return Object.assign(new AlsaFileGroup(), validated);
  }

  toJSON(): Record<string, unknown> {
    return {id: this.id, name: this.name};
  }
}

export class AlsaFileInfo extends BaseDefinition {
  directoryPath?: string;
  groups!: AlsaFileGroup[];

  static fromJSON(data: unknown): AlsaFileInfo {
    const validated = AlsaFileInfoSchema.parse(data);
    return this.hydrateInstance(
      new AlsaFileInfo(),
      validated as Record<string, unknown>,
      [{field: 'groups', hydrator: AlsaFileGroup, isArray: true}],
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      directoryPath: this.directoryPath,
      groups: this.serializeField(this.groups),
    };
  }
}

export class AlsaSubgraphMetaData extends BaseDefinition {
  subgraphId!: number;
  selectedCkv?: string;

  static fromJSON(data: unknown): AlsaSubgraphMetaData {
    const validated = AlsaSubgraphMetaDataSchema.parse(data);
    return Object.assign(new AlsaSubgraphMetaData(), validated);
  }

  toJSON(): Record<string, unknown> {
    return {subgraphId: this.subgraphId, selectedCkv: this.selectedCkv};
  }
}

function serializeAlsaUsecaseData(obj: {
  usecase: string;
  alsaFileInfo?: {toJSON: () => Record<string, unknown>} | null;
  subgraphs: Array<{toJSON: () => Record<string, unknown>}>;
}): Record<string, unknown> {
  return {
    usecase: obj.usecase,
    alsaFileInfo: obj.alsaFileInfo?.toJSON() ?? null,
    subgraphs: obj.subgraphs.map(s => s.toJSON()),
  };
}

export class AlsaMetaData extends BaseDefinition {
  usecase!: string;
  alsaFileInfo?: AlsaFileInfo;
  subgraphs!: AlsaSubgraphMetaData[];

  static fromJSON(data: unknown): AlsaMetaData {
    const validated = AlsaMetaDataSchema.parse(data);
    return this.hydrateInstance(
      new AlsaMetaData(),
      validated as Record<string, unknown>,
      [
        {field: 'alsaFileInfo', hydrator: AlsaFileInfo},
        {field: 'subgraphs', hydrator: AlsaSubgraphMetaData, isArray: true},
      ],
    );
  }

  toJSON(): Record<string, unknown> {
    return serializeAlsaUsecaseData(this);
  }
}

// ─── AlsaTagData classes ──────────────────────────────────────────────────────

export class AlsaTagKeyValue extends BaseDefinition {
  groupId!: number;
  selectedTkv?: string;

  static fromJSON(data: unknown): AlsaTagKeyValue {
    const validated = AlsaTagKeyValueSchema.parse(data);
    return Object.assign(new AlsaTagKeyValue(), validated);
  }

  toJSON(): Record<string, unknown> {
    return {groupId: this.groupId, selectedTkv: this.selectedTkv};
  }
}

export class AlsaSubgraphTagData extends BaseDefinition {
  subgraphId!: number;
  selectedTkvList!: AlsaTagKeyValue[];

  static fromJSON(data: unknown): AlsaSubgraphTagData {
    const validated = AlsaSubgraphTagDataSchema.parse(data);
    return this.hydrateInstance(
      new AlsaSubgraphTagData(),
      validated as Record<string, unknown>,
      [{field: 'selectedTkvList', hydrator: AlsaTagKeyValue, isArray: true}],
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      subgraphId: this.subgraphId,
      selectedTkvList: this.serializeField(this.selectedTkvList),
    };
  }
}

export class AlsaTagData extends BaseDefinition {
  usecase!: string;
  alsaFileInfo?: AlsaFileInfo;
  subgraphs!: AlsaSubgraphTagData[];

  static fromJSON(data: unknown): AlsaTagData {
    const validated = AlsaTagDataSchema.parse(data);
    return this.hydrateInstance(
      new AlsaTagData(),
      validated as Record<string, unknown>,
      [
        {field: 'alsaFileInfo', hydrator: AlsaFileInfo},
        {field: 'subgraphs', hydrator: AlsaSubgraphTagData, isArray: true},
      ],
    );
  }

  toJSON(): Record<string, unknown> {
    return serializeAlsaUsecaseData(this);
  }
}

// ─── Root configuration classes ───────────────────────────────────────────────

export class ConfigurationData extends BaseDefinition {
  portStrategy!: ModulePortStrategy;
  defaultProcessorDomain!: number;
  rtc!: RtcConfig;
  alsaLib!: AlsaLibConfig;
  validation?: ValidationConfig;
  alsaMetaData?: AlsaMetaData[];
  alsaTagData?: AlsaTagData[];

  static fromJSON(data: unknown): ConfigurationData {
    const validated = ConfigurationDataSchema.parse(data);
    const instance = this.hydrateInstance(
      new ConfigurationData(),
      validated as Record<string, unknown>,
      [
        {field: 'rtc', hydrator: RtcConfig},
        {field: 'alsaLib', hydrator: AlsaLibConfig},
      ],
    );
    if (validated.validation) {
      instance.validation = ValidationConfig.fromJSON(validated.validation);
    }
    if (validated.alsaMetaData) {
      instance.alsaMetaData = validated.alsaMetaData.map(d =>
        AlsaMetaData.fromJSON(d),
      );
    }
    if (validated.alsaTagData) {
      instance.alsaTagData = validated.alsaTagData.map(d =>
        AlsaTagData.fromJSON(d),
      );
    }
    return instance;
  }

  toJSON(): Record<string, unknown> {
    return {
      portStrategy: this.portStrategy,
      defaultProcessorDomain: this.defaultProcessorDomain,
      rtc: this.serializeField(this.rtc),
      alsaLib: this.serializeField(this.alsaLib),
      validation: this.serializeField(this.validation),
      alsaMetaData: this.serializeField(this.alsaMetaData),
      alsaTagData: this.serializeField(this.alsaTagData),
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
