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
  UiMetadataSchema,
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
  type!: string;
  keyValue!: string;
  aliasId?: string;
  aliasName?: string;

  static fromJSON(data: unknown): UiUsecase {
    const v = UiUsecaseSchema.parse(data);
    return Object.assign(new UiUsecase(), v);
  }

  toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      keyValue: this.keyValue,
      aliasId: this.aliasId,
      aliasName: this.aliasName,
    };
  }
}

export class UiSubsystemChild extends BaseDefinition {
  id!: number;
  type!: 'Subgraph' | 'Subsystem';

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

  static fromJSON(data: unknown): UiSubgraph {
    const v = UiSubgraphSchema.parse(data);
    return Object.assign(new UiSubgraph(), v);
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      supportedKeyValues: this.supportedKeyValues,
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
  calViewUiPersistences!: UiCalViewUiPersistence[];

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
      calViewUiPersistences: this.serializeField(this.calViewUiPersistences),
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

export class UiMetadata extends BaseDefinition {
  version!: {major: number; minor: number};
  payloadMap!: UiPayloadMapEntry[];
  usecases!: UiUsecase[];
  subsystems!: UiSubsystem[];
  subgraphs!: UiSubgraph[];
  modules!: UiModule[];
  dataLinks!: UiDataLink[];

  static fromJSON(data: unknown): UiMetadata {
    const v = UiMetadataSchema.parse(data);
    return this.hydrateInstance(
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
    };
  }
}
