/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  ModuleDefinitionRepository,
  UnitOfWork,
  ParameterDefinitionBase,
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

  async findByModuleIdAndProcId(
    moduleId: number,
    procId: number,
    fileSystemId: number,
  ): Promise<SpfModuleDefinition | null> {
    const defRow = await this.manager
      .getRepository<SpfModuleDefinitionRow>(ENTITY_NAMES.SpfModuleDefinition)
      .createQueryBuilder('smd')
      .select('smd.systemId')
      .where(
        'smd.moduleDefinitionId = :moduleId AND smd.processorSystemId = :procId AND smd.fileSystemId = :fileSystemId',
        {moduleId, procId, fileSystemId},
      )
      .getOne();

    if (defRow === null) return null;

    return this.load(Number(defRow.systemId), fileSystemId);
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
                dataPortId: Number(p.dataPortId),
                name: p.name ?? undefined,
              }),
          ),
        }),
    );

    const staticControlPorts = staticPorts.map(
      p =>
        new StaticControlPortDefinition({
          portId: Number(p.portId),
          portName: p.portName ? String(p.portName) : '',
        }),
    );

    const dynamicIntentDomains = dynamicIntents.map(
      d =>
        new DynamicIntentDefinition({
          intentId: Number(d.intentId),
          name: String(d.name),
          maxPort: Number(d.maxPort),
        }),
    );

    return new SpfModuleDefinition({
      systemId: Number(root.systemId),
      moduleDefinitionId: Number(root.moduleDefinitionId),
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
  ): Promise<ParameterDefinitionBase[]> {
    const sessionId = this.uow.getWriteContext().session.sessionId;
    const rows = await this.paramDefFetcher.fetchParameterDefinitions(
      moduleDefSystemId,
      sessionId,
      paramSystemIds,
    );
    return rows.map(r => ({
      systemId: r.systemId,
      isReadOnly: r.isReadOnly,
      elementsStructure: r.elementsStructure,
    }));
  }
}
