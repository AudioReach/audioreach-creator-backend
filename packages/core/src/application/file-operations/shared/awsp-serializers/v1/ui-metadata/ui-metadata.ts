/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseDefinition} from '../definitions/common/base-definition.js';
import {
  UiPayloadMapEntrySchema,
  UiUsecaseSchema,
  UiSubsystemChildSchema,
  UiSubsystemSchema,
  UiSubgraphSchema,
  UiCalViewUiPersistenceSchema,
  UiModuleSchema,
  UiDataLinkSchema,
  SwitchPersistenceSchema,
  SrsMetadataPersistenceSchema,
  UiMetadataSchema,
  type AwspUsecaseType,
} from './ui-metadata.schema.js';

export class UiPayloadMapEntry extends BaseDefinition {
  id!: string;
  data!: string;

  static fromJSON(data: unknown): UiPayloadMapEntry {
    const v = UiPayloadMapEntrySchema.parse(data);
    return Object.assign(new UiPayloadMapEntry(), v);
  }

  toJSON(): Record<string, unknown> {
    return {id: this.id, data: this.data};
  }
}

export class UiUsecase extends BaseDefinition {
  keyValue!: string;
  aliasId?: string;
  aliasName?: string;
  categoryName?: string;
  type!: AwspUsecaseType;
  orderedKeys!: Array<{id: number}>;
  reviewedAt?: string;

  static fromJSON(data: unknown): UiUsecase {
    const v = UiUsecaseSchema.parse(data);
    return Object.assign(new UiUsecase(), v);
  }

  toJSON(): Record<string, unknown> {
    return {
      keyValue: this.keyValue,
      aliasId: this.aliasId,
      aliasName: this.aliasName,
      categoryName: this.categoryName,
      type: this.type,
      orderedKeys: this.orderedKeys,
      reviewedAt: this.reviewedAt,
    };
  }
}

export class UiSubsystemChild extends BaseDefinition {
  id!: number;
  type!: 'Subgraph' | 'Subsystem' | 'Unknown';

  static fromJSON(data: unknown): UiSubsystemChild {
    const v = UiSubsystemChildSchema.parse(data);
    return Object.assign(new UiSubsystemChild(), v);
  }

  toJSON(): Record<string, unknown> {
    return {id: this.id, type: this.type};
  }
}

export class UiSubsystem extends BaseDefinition {
  id!: number;
  name!: string;
  filteredGraphKeys?: string;
  children!: UiSubsystemChild[];

  static fromJSON(data: unknown): UiSubsystem {
    const v = UiSubsystemSchema.parse(data);
    return this.hydrateInstance(
      new UiSubsystem(),
      v as Record<string, unknown>,
      [{field: 'children', hydrator: UiSubsystemChild, isArray: true}],
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      filteredGraphKeys: this.filteredGraphKeys,
      children: this.serializeField(this.children),
    };
  }
}

export class UiSubgraph extends BaseDefinition {
  id!: number;
  name?: string;
  supportedKeyValues!: Array<{keyValue: string}>;
  reviewedAt?: string;

  static fromJSON(data: unknown): UiSubgraph {
    const v = UiSubgraphSchema.parse(data);
    return Object.assign(new UiSubgraph(), v);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      supportedKeyValues: this.supportedKeyValues,
      reviewedAt: this.reviewedAt,
    };
  }
}

export class UiCalViewUiPersistence extends BaseDefinition {
  payloadId!: string;
  calKeyValue?: string;

  static fromJSON(data: unknown): UiCalViewUiPersistence {
    const v = UiCalViewUiPersistenceSchema.parse(data);
    return Object.assign(new UiCalViewUiPersistence(), v);
  }

  toJSON(): Record<string, unknown> {
    return {payloadId: this.payloadId, calKeyValue: this.calKeyValue};
  }
}

export class UiModule extends BaseDefinition {
  definitionId!: number;
  instanceId!: number;
  aliasName?: string;
  calViewUiPersistences!: UiCalViewUiPersistence[];
  reviewedAt?: string;

  static fromJSON(data: unknown): UiModule {
    const v = UiModuleSchema.parse(data);
    return this.hydrateInstance(new UiModule(), v as Record<string, unknown>, [
      {
        field: 'calViewUiPersistences',
        hydrator: UiCalViewUiPersistence,
        isArray: true,
      },
    ]);
  }

  toJSON(): Record<string, unknown> {
    return {
      definitionId: this.definitionId,
      instanceId: this.instanceId,
      aliasName: this.aliasName,
      calViewUiPersistences: this.serializeField(this.calViewUiPersistences),
      reviewedAt: this.reviewedAt,
    };
  }
}

export class UiDataLink extends BaseDefinition {
  isEcLink!: boolean;
  sourceId!: number;
  sourcePortId!: number;
  destinationId!: number;
  destinationPortId!: number;

  static fromJSON(data: unknown): UiDataLink {
    const v = UiDataLinkSchema.parse(data);
    return Object.assign(new UiDataLink(), v);
  }

  toJSON(): Record<string, unknown> {
    return {
      isEcLink: this.isEcLink,
      sourceId: this.sourceId,
      sourcePortId: this.sourcePortId,
      destinationId: this.destinationId,
      destinationPortId: this.destinationPortId,
    };
  }
}

// ===== Switch Persistence Classes =====

export class UiSwitchPortKeyValue extends BaseDefinition {
  name!: string;

  toJSON(): Record<string, unknown> {
    return {name: this.name};
  }
}

export class UiSwitchPort extends BaseDefinition {
  id!: number;
  keyValues!: UiSwitchPortKeyValue[];

  toJSON(): Record<string, unknown> {
    return {id: this.id, keyValues: this.serializeField(this.keyValues)};
  }
}

export class UiSwitchDataPortsInfo extends BaseDefinition {
  maxPortCount!: number;
  ports!: UiSwitchPort[];

  toJSON(): Record<string, unknown> {
    return {
      maxPortCount: this.maxPortCount,
      ports: this.serializeField(this.ports),
    };
  }
}

export class UiSwitchControlPortsInfo extends BaseDefinition {
  maxPortCount!: number;

  toJSON(): Record<string, unknown> {
    return {maxPortCount: this.maxPortCount};
  }
}

export class UiSwitchConnection extends BaseDefinition {
  sourceId!: number;
  sourcePortId!: number;
  sourceType!: string;
  destinationId!: number;
  destinationPortId!: number;
  destinationType!: string;
  category!: string;

  toJSON(): Record<string, unknown> {
    return {
      sourceId: this.sourceId,
      sourcePortId: this.sourcePortId,
      sourceType: this.sourceType,
      destinationId: this.destinationId,
      destinationPortId: this.destinationPortId,
      destinationType: this.destinationType,
      category: this.category,
    };
  }
}

export class UiSwitchDataLink extends BaseDefinition {
  sourceId!: number;
  sourcePortId!: number;
  destinationId!: number;
  destinationPortId!: number;
  metaLinks!: UiSwitchConnection[];

  toJSON(): Record<string, unknown> {
    return {
      sourceId: this.sourceId,
      sourcePortId: this.sourcePortId,
      destinationId: this.destinationId,
      destinationPortId: this.destinationPortId,
      metaLinks: this.serializeField(this.metaLinks),
    };
  }
}

export class UiSwitchControlLink extends UiSwitchDataLink {}

export class UiSwitchModuleInfo extends BaseDefinition {
  instanceId!: number;

  toJSON(): Record<string, unknown> {
    return {instanceId: this.instanceId};
  }
}

export class UiSwitch extends BaseDefinition {
  id!: number;
  parentSubgraphId?: number;
  parentSubsystemId?: number;
  type!: string;
  inputPort?: UiSwitchDataPortsInfo;
  outputPort?: UiSwitchDataPortsInfo;
  controlPort?: UiSwitchControlPortsInfo;
  dataLinks!: UiSwitchDataLink[];
  controlLinks!: UiSwitchControlLink[];
  modules!: UiSwitchModuleInfo[];

  static fromJSON(data: unknown): UiSwitch {
    const v = SwitchPersistenceSchema.parse(data);
    const instance = new UiSwitch();
    instance.id = v.id;
    instance.parentSubgraphId = v.parentSubgraphId;
    instance.parentSubsystemId = v.parentSubsystemId;
    instance.type = v.type;
    instance.controlPort = v.controlPort
      ? Object.assign(new UiSwitchControlPortsInfo(), v.controlPort)
      : undefined;
    instance.inputPort = v.inputPort
      ? UiSwitch.parseDataPortsInfo(v.inputPort)
      : undefined;
    instance.outputPort = v.outputPort
      ? UiSwitch.parseDataPortsInfo(v.outputPort)
      : undefined;
    instance.dataLinks = v.dataLinks.map(dl => {
      const link = new UiSwitchDataLink();
      link.sourceId = dl.sourceId;
      link.sourcePortId = dl.sourcePortId;
      link.destinationId = dl.destinationId;
      link.destinationPortId = dl.destinationPortId;
      link.metaLinks = (dl.metaLinks ?? []).map(ml =>
        Object.assign(new UiSwitchConnection(), ml),
      );
      return link;
    });
    instance.controlLinks = v.controlLinks.map(cl => {
      const link = new UiSwitchControlLink();
      link.sourceId = cl.sourceId;
      link.sourcePortId = cl.sourcePortId;
      link.destinationId = cl.destinationId;
      link.destinationPortId = cl.destinationPortId;
      link.metaLinks = (cl.metaLinks ?? []).map(ml =>
        Object.assign(new UiSwitchConnection(), ml),
      );
      return link;
    });
    instance.modules = v.modules.map(m =>
      Object.assign(new UiSwitchModuleInfo(), m),
    );
    return instance;
  }

  private static parseDataPortsInfo(raw: {
    maxPortCount: number;
    ports: Array<{id: number; keyValues: Array<{name: string}>}>;
  }): UiSwitchDataPortsInfo {
    const info = new UiSwitchDataPortsInfo();
    info.maxPortCount = raw.maxPortCount;
    info.ports = raw.ports.map(p => {
      const port = new UiSwitchPort();
      port.id = p.id;
      port.keyValues = p.keyValues.map(kv =>
        Object.assign(new UiSwitchPortKeyValue(), kv),
      );
      return port;
    });
    return info;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      parentSubgraphId: this.parentSubgraphId,
      parentSubsystemId: this.parentSubsystemId,
      type: this.type,
      inputPort: this.serializeField(this.inputPort),
      outputPort: this.serializeField(this.outputPort),
      controlPort: this.serializeField(this.controlPort),
      dataLinks: this.serializeField(this.dataLinks),
      controlLinks: this.serializeField(this.controlLinks),
      modules: this.serializeField(this.modules),
    };
  }
}

// ===== SRS Metadata Classes =====

export class UiSrsConfiguration extends BaseDefinition {
  isEnabled?: boolean;
  timeLimit?: number;
  sourceType?: string;
  sourcePath?: string;
  shellPath?: string;
  arguments?: string;
  outputFilePath?: string;
  promptForArguments?: boolean;
  runOnlyOncePerSession?: boolean;

  toJSON(): Record<string, unknown> {
    return {
      isEnabled: this.isEnabled,
      timeLimit: this.timeLimit,
      sourceType: this.sourceType,
      sourcePath: this.sourcePath,
      shellPath: this.shellPath,
      arguments: this.arguments,
      outputFilePath: this.outputFilePath,
      promptForArguments: this.promptForArguments,
      runOnlyOncePerSession: this.runOnlyOncePerSession,
    };
  }
}

export class UiSrsScript extends BaseDefinition {
  name!: string;
  configuration?: UiSrsConfiguration;
  description?: string;
  scriptContent?: string;

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      configuration: this.serializeField(this.configuration),
      description: this.description,
      scriptContent: this.scriptContent,
    };
  }
}

export class UiSrsAction extends BaseDefinition {
  name!: string;
  scripts!: UiSrsScript[];

  toJSON(): Record<string, unknown> {
    return {name: this.name, scripts: this.serializeField(this.scripts)};
  }
}

export class UiSrsMetadata extends BaseDefinition {
  srsCategories!: UiSrsAction[];

  static fromJSON(data: unknown): UiSrsMetadata {
    const v = SrsMetadataPersistenceSchema.parse(data);
    const instance = new UiSrsMetadata();
    instance.srsCategories = v.srsCategories.map(action => {
      const a = new UiSrsAction();
      a.name = action.name;
      a.scripts = action.scripts.map(s => {
        const script = new UiSrsScript();
        script.name = s.name;
        script.description = s.description;
        script.scriptContent = s.scriptContent;
        if (s.configuration) {
          script.configuration = Object.assign(
            new UiSrsConfiguration(),
            s.configuration,
          );
        }
        return script;
      });
      return a;
    });
    return instance;
  }

  toJSON(): Record<string, unknown> {
    return {srsCategories: this.serializeField(this.srsCategories)};
  }
}

// ===== Root UiMetadata =====

export class UiMetadata extends BaseDefinition {
  version!: {major: number; minor: number};
  payloadMap!: UiPayloadMapEntry[];
  usecases!: UiUsecase[];
  subsystems!: UiSubsystem[];
  subgraphs!: UiSubgraph[];
  modules!: UiModule[];
  dataLinks!: UiDataLink[];
  switches!: UiSwitch[];
  srsMetadata?: UiSrsMetadata;

  static fromJSON(data: unknown): UiMetadata {
    const v = UiMetadataSchema.parse(data);
    const instance = this.hydrateInstance(
      new UiMetadata(),
      v as Record<string, unknown>,
      [
        {field: 'payloadMap', hydrator: UiPayloadMapEntry, isArray: true},
        {field: 'usecases', hydrator: UiUsecase, isArray: true},
        {field: 'subsystems', hydrator: UiSubsystem, isArray: true},
        {field: 'subgraphs', hydrator: UiSubgraph, isArray: true},
        {field: 'modules', hydrator: UiModule, isArray: true},
        {field: 'dataLinks', hydrator: UiDataLink, isArray: true},
      ],
    );
    // Hydrate switches manually since nested classes are complex
    instance.switches = (v.switches ?? []).map(s => UiSwitch.fromJSON(s));
    // Hydrate srsMetadata if present
    if (v.srsMetadata) {
      instance.srsMetadata = UiSrsMetadata.fromJSON(v.srsMetadata);
    }
    return instance;
  }

  toJSON(): Record<string, unknown> {
    return {
      version: this.version,
      payloadMap: this.serializeField(this.payloadMap),
      usecases: this.serializeField(this.usecases),
      subsystems: this.serializeField(this.subsystems),
      subgraphs: this.serializeField(this.subgraphs),
      modules: this.serializeField(this.modules),
      dataLinks: this.serializeField(this.dataLinks),
      switches: this.serializeField(this.switches),
      srsMetadata: this.serializeField(this.srsMetadata),
    };
  }
}
