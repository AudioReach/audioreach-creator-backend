/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  ModuleDefinitionRepository,
  UnitOfWork,
  ModuleParameterDefinition,
} from '@arc/core';
import {
  SpfModuleDefinition,
  DataPortGroupDefinition,
  DataPortDefinition,
  StaticControlPortDefinition,
  DynamicIntentDefinition,
} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {SpfModuleDefinitionRow} from '../../entity-schema/definitions/module/spf/spf-module-definition.schema.js';
import {EditActionsQueryService} from '../../queries/edit-session/edit-actions-query-service.js';
import {SpfModuleDefinitionFetcher} from '../../fetchers/definitions/spf-module-definitions/spf-module-definition-fetcher.js';
import {DataPortGroupFetcher} from '../../fetchers/definitions/spf-module-definitions/data-port-group-fetcher.js';
import {StaticControlPortDefFetcher} from '../../fetchers/definitions/spf-module-definitions/static-control-port-def-fetcher.js';
import {DynamicIntentDefFetcher} from '../../fetchers/definitions/spf-module-definitions/dynamic-intent-def-fetcher.js';
import {ModuleParameterDefinitionFetcher} from '../../fetchers/definitions/spf-module-definitions/module-parameter-definition-fetcher.js';

export class TypeOrmModuleDefinitionRepository implements ModuleDefinitionRepository {
  private readonly rootFetcher: SpfModuleDefinitionFetcher;
  private readonly portGroupFetcher: DataPortGroupFetcher;
  private readonly staticPortFetcher: StaticControlPortDefFetcher;
  private readonly dynamicIntentFetcher: DynamicIntentDefFetcher;
  private readonly paramDefFetcher: ModuleParameterDefinitionFetcher;

  constructor(
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {
    const editActionsQs = new EditActionsQueryService(manager);
    this.rootFetcher = new SpfModuleDefinitionFetcher(manager, editActionsQs);
    this.portGroupFetcher = new DataPortGroupFetcher(manager, editActionsQs);
    this.staticPortFetcher = new StaticControlPortDefFetcher(
      manager,
      editActionsQs,
    );
    this.dynamicIntentFetcher = new DynamicIntentDefFetcher(
      manager,
      editActionsQs,
    );
    this.paramDefFetcher = new ModuleParameterDefinitionFetcher(
      manager,
      editActionsQs,
    );
  }

  async findBySystemId(
    definitionSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleDefinition | null> {
    return this.load(definitionSystemId, fileSystemId);
  }

  async findByDefIdAndProcId(
    moduleDefinitionSystemId: number,
    processorSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleDefinition | null> {
    const defRow = await this.manager
      .getRepository<SpfModuleDefinitionRow>(ENTITY_NAMES.SpfModuleDefinition)
      .createQueryBuilder('smd')
      .select('smd.systemId')
      .where(
        'smd.systemId = :moduleDefinitionSystemId AND smd.processorSystemId = :processorSystemId AND smd.fileSystemId = :fileSystemId',
        {moduleDefinitionSystemId, processorSystemId, fileSystemId},
      )
      .getOne();

    if (defRow === null) return null;

    return this.load(Number(defRow.systemId), fileSystemId);
  }

  async findBySystemIds(
    definitionSystemIds: readonly number[],
    fileSystemId: number,
  ): Promise<SpfModuleDefinition[]> {
    const uniqueSystemIds = [...new Set(definitionSystemIds)];
    if (uniqueSystemIds.length === 0) return [];

    const definitions = await Promise.all(
      uniqueSystemIds.map(definitionSystemId =>
        this.load(definitionSystemId, fileSystemId),
      ),
    );
    return definitions.filter(
      (definition): definition is SpfModuleDefinition => definition !== null,
    );
  }

  private async load(
    defSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleDefinition | null> {
    const sessionId = this.uow.getWriteContext().session.sessionId;

    const [root, portGroups, staticPorts, dynamicIntents] = await Promise.all([
      this.rootFetcher.fetchOne(defSystemId, fileSystemId, sessionId),
      this.portGroupFetcher.fetchMany(defSystemId, sessionId),
      this.staticPortFetcher.fetchMany(defSystemId, sessionId),
      this.dynamicIntentFetcher.fetchMany(defSystemId, sessionId),
    ]);

    if (root === null) return null;

    const dataPortGroups = portGroups.map(
      g =>
        new DataPortGroupDefinition({
          maxAllowedPortCount: Number(g.maxAllowedPortCount),
          portIoType: g.portIoType,
          staticPortDefinitions: g.portDefinitions.map(
            p =>
              new DataPortDefinition({
                naturalId: Number(p.naturalId),
                name: p.name ?? undefined,
              }),
          ),
        }),
    );

    const staticControlPorts = staticPorts.map(
      p =>
        new StaticControlPortDefinition({
          naturalId: Number(p.naturalId),
          portName: p.portName ? String(p.portName) : '',
        }),
    );

    const dynamicIntentDomains = dynamicIntents.map(
      d =>
        new DynamicIntentDefinition({
          naturalId: Number(d.naturalId),
          name: String(d.name),
          maxPort: Number(d.maxPort),
        }),
    );

    return new SpfModuleDefinition({
      systemId: Number(root.systemId),
      naturalId: Number(root.naturalId),
      name: String(root.name),
      displayName: root.displayName
        ? String(root.displayName)
        : String(root.name),
      stackSize: Number(root.stackSize),
      processorSystemId: Number(root.processorSystemId),
      fileSystemId,
      containerTypesSystemIds: root.containerTypeSystemIds,
      dataPortGroups,
      staticControlPorts,
      dynamicIntents: dynamicIntentDomains,
      isLoadedAtBootup: Boolean(root.isLoadedAtBootup),
    });
  }

  async getParameterDefinitions(
    moduleDefSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ModuleParameterDefinition[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.paramDefFetcher.fetchParameterDefinitions(
      moduleDefSystemId,
      sessionId,
      paramSystemIds,
    );
    return rows.map(r => ({
      systemId: r.systemId,
      naturalId: r.naturalId,
      name: r.name,
      description: r.description,
      isReadOnly: r.isReadOnly,
      elementsStructure: r.elementsStructure,
      toolPolicy: parseFirstToolPolicy(r.toolPolicies ?? ''),
    }));
  }
}

function parseFirstToolPolicy(stored: string): string {
  try {
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    if (!Array.isArray(parsed)) return '';
    if (parsed.includes('CALIBRATION')) return 'CALIBRATION';
    const first: unknown = parsed[0];
    return typeof first === 'string' ? first : '';
  } catch {
    return '';
  }
}
