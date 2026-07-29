/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {EntityManager} from 'typeorm';
import type {
  ModuleDefinitionRepository,
  UnitOfWork,
  CalibrationParameterRecord,
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
import {SpfModuleDefinitionRootFetcher} from '../../fetchers/definitions/spf-module-definitions/spf-module-definition-root-fetcher.js';
import {DataPortGroupFetcher} from '../../fetchers/definitions/spf-module-definitions/data-port-group-fetcher.js';
import {StaticControlPortDefFetcher} from '../../fetchers/definitions/spf-module-definitions/static-control-port-def-fetcher.js';
import {DynamicIntentDefFetcher} from '../../fetchers/definitions/spf-module-definitions/dynamic-intent-def-fetcher.js';

export class TypeOrmModuleDefinitionRepository implements ModuleDefinitionRepository {
  private readonly rootFetcher: SpfModuleDefinitionRootFetcher;
  private readonly portGroupFetcher: DataPortGroupFetcher;
  private readonly staticPortFetcher: StaticControlPortDefFetcher;
  private readonly dynamicIntentFetcher: DynamicIntentDefFetcher;

  constructor(
    private readonly manager: EntityManager,
    private readonly uow: UnitOfWork,
  ) {
    const editActionsQs = new EditActionsQueryService(manager);
    this.rootFetcher = new SpfModuleDefinitionRootFetcher(
      manager,
      editActionsQs,
    );
    this.portGroupFetcher = new DataPortGroupFetcher(manager, editActionsQs);
    this.staticPortFetcher = new StaticControlPortDefFetcher(
      manager,
      editActionsQs,
    );
    this.dynamicIntentFetcher = new DynamicIntentDefFetcher(
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
      this.portGroupFetcher.fetchForDefinition(defSystemId, sessionId),
      this.staticPortFetcher.fetchForDefinition(defSystemId, sessionId),
      this.dynamicIntentFetcher.fetchForDefinition(defSystemId, sessionId),
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

  async findCalibrationParametersByDefinitionId(
    definitionSystemId: number,
    _fileSystemId: number,
  ): Promise<CalibrationParameterRecord[]> {
    // Calibration parameters are those with isPersistent = false (loaded at
    // runtime into CKV bins). Verify this filter against the DB if any module
    // has unexpected missing or extra entries — see design doc §5 for the note
    // about confirming the exact criterion.
    // See: docs/edit-crud/design/add-module-calibration-defaults-design.md §5
    const rows = await this.manager
      .createQueryBuilder()
      .select(['p.systemId', 'p.elementsStructure'])
      .from(ENTITY_NAMES.SpfModuleParameterDefinition, 'p')
      .where(
        'p.spfModuleDefinitionSystemId = :definitionSystemId AND p.isPersistent = :isPersistent',
        {definitionSystemId, isPersistent: false},
      )
      .getRawMany<{p_systemId: number; p_elementsStructure: string}>();
    return rows.map(r => ({
      systemId: Number(r.p_systemId),
      elementsStructure: r.p_elementsStructure,
    }));
  }
}
