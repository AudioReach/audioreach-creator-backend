/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  BulkReadQueryService,
  DownloadEntities,
  ProjectHeaderMetadata,
  UsecaseDataDownloadModel,
  SubgraphDownloadModel,
  ContainerDownloadModel,
  CalibrationDataDownloadModel,
  TagKeysDownloadModel,
  TagDataDownloadModel,
  TaggedModuleDownloadModel,
  DriverCalibrationDownloadModel,
  KeyDefinitionDownloadModel,
  TagDefinitionDownloadModel,
  TagKeyDownloadModel,
  ValueDefinitionDownloadModel,
  SpfModuleDefinitionDownloadModel,
  SpfParamDefDownloadModel,
  DataPortGroupDownloadModel,
  DataPortDownloadModel,
  StaticControlPortDownloadModel,
  StaticIntentDownloadModel,
  DynamicIntentDownloadModel,
  DriverModuleDefinitionDownloadModel,
  DriverParamDefDownloadModel,
  SpfPropertyDefinitionDownloadModel,
  DriverPropertyDefinitionDownloadModel,
  ConfigurationDownloadModel,
  ProcessorDefinitionDownloadModel,
  ContainerTypeDefinitionDownloadModel,
  Logger,
} from '@arc/core';
import {compareNumberArrays, LINK_TYPE, PORT_IO_TYPE} from '@arc/core';
import type {DataSource, SelectQueryBuilder, ObjectLiteral} from 'typeorm';
import {DbFileQuery} from '../db-file-query.js';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {
  CkvRow,
  CkvParameterPayloadRow,
  CkvValuesRow,
} from '../../entity-schema/usecase-data/module/spf-module-calibration-data.schema.js';
import type {UseCaseRow} from '../../entity-schema/usecase-data/use-case.js';
import type {UseCaseSubgraphPairRow} from '../../entity-schema/usecase-data/use-case-subgraph-pair.schema.js';
import type {ContainerRow} from '../../entity-schema/usecase-data/container/container.schema.js';
import type {SubgraphRow} from '../../entity-schema/usecase-data/subgraph/subgraph.schema.js';
import type {SubgraphPropertyDataRow} from '../../entity-schema/usecase-data/subgraph/subgraph-property-data.js';
import type {SpfModuleRow} from '../../entity-schema/usecase-data/module/spf-module.schema.js';
import type {DataLinkRow} from '../../entity-schema/usecase-data/Links/data-link.js';
import type {ControlLinkRow} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {
  ModuleTagIdMapRow,
  TkvRow,
  TkvValuesRow,
  TkvParameterPayloadRow,
} from '../../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';
import type {TagDefinitionRow} from '../../entity-schema/definitions/tag-key-value/tag-definition.schema.js';
import type {TagKeyDefLinkRow} from '../../entity-schema/definitions/tag-key-value/tag-key-def-link.schema.js';
import type {
  DkvRow,
  DkvParameterPayloadRow,
  DkvValuesRow,
} from '../../entity-schema/driver-module-data/driver-module.js';
import type {KeyDefinitionRow} from '../../entity-schema/definitions/key-value/key-definition.schema.js';
import type {ValueDefinitionRow} from '../../entity-schema/definitions/key-value/value-definition.schema.js';
import type {SpfModuleDefinitionRow} from '../../entity-schema/definitions/module/spf/spf-module-definition.schema.js';
import type {SpfModuleParameterDefinitionRow} from '../../entity-schema/definitions/module/spf/spf-module-parameter-definition.schema.js';
import type {DataPortGroupRow} from '../../entity-schema/definitions/module/spf/data-group-definition.schema.js';
import type {DataPortDefinitionRow} from '../../entity-schema/definitions/module/spf/data-port-definition.schema.js';
import type {StaticControlPortDefinitionRow} from '../../entity-schema/definitions/module/spf/static-control-port-definition.schema.js';
import type {StaticIntentDefinitionRow} from '../../entity-schema/definitions/module/spf/static-intent-definition.schema.js';
import type {DynamicIntentDefinitionRow} from '../../entity-schema/definitions/module/spf/dynamic-intent-definition.schema.js';
import type {ModuleDefinitionContainerTypeLinkRow} from '../../entity-schema/definitions/module/spf/module-definition-container-type-link.schema.js';
import type {DriverModuleDefinitionRow} from '../../entity-schema/definitions/module/driver/driver-module-definition.schema.js';
import type {DriverModuleParameterDefinitionRow} from '../../entity-schema/definitions/module/driver/driver-module-parameter-definition.schema.js';
import type {SubgraphPropertyRow} from '../../entity-schema/definitions/subgraph/subgraph-property-definition.schema.js';
import type {ContainerPropertyRow} from '../../entity-schema/definitions/container/container-property-definition.schema.js';
import type {ModulePropertyRow} from '../../entity-schema/definitions/module/spf/module-property-definition.schema.js';
import type {ProcessorDefinitionRow} from '../../entity-schema/definitions/common/processor-definition.schema.js';
import type {ContainerTypeRow} from '../../entity-schema/definitions/container/container-definition.schema.js';
import type {ConfigurationRow} from '../../entity-schema/project-data/configuration.schema.js';

/**
 * TypeORM implementation of BulkReadQueryService.
 * All queries use TypeORM Query Builder — no raw dataSource.query() calls.
 * Reads all entity types for a file in parallel using Promise.all.
 */
export class TypeOrmBulkReadQueryService implements BulkReadQueryService {
  /**
   * SQLite's SQLITE_MAX_VARIABLE_NUMBER limit (sqlite3 package).
   * Used by queryInChunks for IN-clause queries (calibration parameters only).
   */
  private readonly SQLITE_MAX_VARIABLES = 999;

  constructor(
    private readonly dataSource: DataSource,
    private readonly logger?: Logger,
  ) {
    if (!this.dataSource) {
      throw new Error('DataSource is required');
    }
  }

  async readAllEntitiesForFile(
    fileSystemId: number,
  ): Promise<DownloadEntities> {
    const timed = <T>(name: string, promise: Promise<T>): Promise<T> => {
      const t0 = performance.now();
      return promise.then(result => {
        this.logger?.logInfo({
          msg: 'download-db-performance',
          description: `db:${name} ${(performance.now() - t0).toFixed(1)}ms`,
          component: 'TypeOrmBulkReadQueryService',
          tag: 'download-file',
        });
        return result;
      });
    };

    const [
      headerMetadata,
      usecaseData,
      subgraphData,
      containerData,
      calibrationData,
      tagKeys,
      tagData,
      taggedModules,
      driverCalibrationData,
      configurationData,
      keyDefinitions,
      tagDefinitions,
      spfModuleDefinitions,
      driverModuleDefinitions,
      spfPropertyDefinitions,
      driverPropertyDefinitions,
      processorDefinitions,
      containerTypeDefinitions,
    ] = await Promise.all([
      timed('readFileProperties', this.readFileProperties(fileSystemId)),
      timed('readUsecaseData', this.readUsecaseData(fileSystemId)),
      timed('readSubgraphData', this.readSubgraphData(fileSystemId)),
      timed('readContainerData', this.readContainerData(fileSystemId)),
      timed('readCalibrationData', this.readCalibrationData(fileSystemId)),
      timed('readTagKeys', this.readTagKeys(fileSystemId)),
      timed('readTagData', this.readTagData(fileSystemId)),
      timed('readTaggedModuleData', this.readTaggedModuleData(fileSystemId)),
      timed(
        'readDriverCalibrationData',
        this.readDriverCalibrationData(fileSystemId),
      ),
      timed('readConfiguration', this.readConfiguration(fileSystemId)),
      timed('readKeyDefinitions', this.readKeyDefinitions(fileSystemId)),
      timed('readTagDefinitions', this.readTagDefinitions(fileSystemId)),
      timed(
        'readSpfModuleDefinitions',
        this.readSpfModuleDefinitions(fileSystemId),
      ),
      timed(
        'readDriverModuleDefinitions',
        this.readDriverModuleDefinitions(fileSystemId),
      ),
      timed(
        'readSpfPropertyDefinitions',
        this.readSpfPropertyDefinitions(fileSystemId),
      ),
      timed(
        'readDriverPropertyDefinitions',
        this.readDriverPropertyDefinitions(fileSystemId),
      ),
      timed(
        'readProcessorDefinitions',
        this.readProcessorDefinitions(fileSystemId),
      ),
      timed(
        'readContainerTypeDefinitions',
        this.readContainerTypeDefinitions(fileSystemId),
      ),
    ]);

    return {
      headerMetadata,
      usecaseData,
      subgraphData,
      containerData,
      calibrationData,
      tagKeys,
      tagData,
      taggedModules,
      driverCalibrationData,
      configurationData: configurationData ?? undefined,
      keyDefinitions,
      tagDefinitions,
      spfModuleDefinitions,
      driverModuleDefinitions,
      spfPropertyDefinitions,
      driverPropertyDefinitions,
      processorDefinitions,
      containerTypeDefinitions,
    };
  }

  async readFileProperties(
    fileSystemId: number,
  ): Promise<ProjectHeaderMetadata> {
    return new DbFileQuery(this.dataSource).readFileProperties(fileSystemId);
  }

  // ─── Usecase ─────────────────────────────────────────────────────────────

  /**
   * Read usecase data with natural IDs, sorted for GKV chunk generation.
   *
   * Runs two QB queries in parallel (usecases + subgraph pairs), then sorts
   * and builds models from hydrated objects. Sort correctness note: SQL
   * GROUP_CONCAT sorts strings, so "1,10" < "1,2" — incorrect for IDs. With
   * hydrated arrays we compare numbers directly in sortUsecaseEntries().
   */
  async readUsecaseData(
    fileSystemId: number,
  ): Promise<UsecaseDataDownloadModel[]> {
    const [usecaseRows, pairRows] = await Promise.all([
      this.fetchAllUsecases(fileSystemId),
      this.fetchSubgraphPairs(fileSystemId),
    ]);

    const sortedRows = this.sortUsecaseEntries(usecaseRows);

    const pairsMap = new Map<
      number,
      Array<{sourceSubgraphId: number; destSubgraphId: number}>
    >();
    for (const pair of pairRows) {
      const ucId = pair.useCase!.systemId;
      if (!pairsMap.has(ucId)) pairsMap.set(ucId, []);
      pairsMap.get(ucId)!.push({
        sourceSubgraphId: pair.sourceSubgraph!.subgraphId,
        destSubgraphId: pair.destSubgraph!.subgraphId,
      });
    }

    return sortedRows.map(uc => ({
      systemId: uc.systemId,
      keyIds: this.extractKeyIds(uc),
      valueIds: this.extractValueIds(uc),
      subgraphIds: (uc.subgraphMemberships ?? [])
        .map(membership => membership.subgraph!.subgraphId)
        .sort((a, b) => a - b),
      subgraphPairs: pairsMap.get(uc.systemId) ?? [],
    }));
  }

  private async fetchAllUsecases(fileSystemId: number): Promise<UseCaseRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.UseCase)
      .createQueryBuilder('uc')
      .leftJoinAndSelect('uc.gkvEntries', 'gkv')
      .leftJoinAndSelect('gkv.valueDef', 'vd')
      .leftJoinAndSelect('vd.keys', 'k')
      .leftJoinAndSelect('uc.subgraphMemberships', 'ucsg')
      .leftJoinAndSelect('ucsg.subgraph', 'sg')
      .where('uc.fileSystemId = :fileSystemId', {fileSystemId})
      .getMany() as Promise<UseCaseRow[]>;
  }

  private async fetchSubgraphPairs(
    fileSystemId: number,
  ): Promise<UseCaseSubgraphPairRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.UseCaseSubgraphPair)
      .createQueryBuilder('ucsp')
      .leftJoinAndSelect('ucsp.useCase', 'uc')
      .leftJoinAndSelect('ucsp.sourceSubgraph', 'src')
      .leftJoinAndSelect('ucsp.destSubgraph', 'dst')
      .where('uc.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('uc.systemId', 'ASC')
      .addOrderBy('src.subgraphId', 'ASC')
      .addOrderBy('dst.subgraphId', 'ASC')
      .getMany() as Promise<UseCaseSubgraphPairRow[]>;
  }

  /**
   * Extract distinct key IDs from a usecase, sorted numerically by keyId.
   * Keys are ordered by keyId so valueIds stay parallel.
   */
  private extractKeyIds(uc: UseCaseRow): number[] {
    const sorted = [...(uc.gkvEntries ?? [])].sort(
      (a, b) => (a.valueDef?.keys?.keyId ?? 0) - (b.valueDef?.keys?.keyId ?? 0),
    );
    return [...new Set(sorted.map(g => g.valueDef!.keys.keyId))];
  }

  /**
   * Extract value IDs in the same order as extractKeyIds (parallel arrays).
   */
  private extractValueIds(uc: UseCaseRow): number[] {
    const sorted = [...(uc.gkvEntries ?? [])].sort(
      (a, b) => (a.valueDef?.keys?.keyId ?? 0) - (b.valueDef?.keys?.keyId ?? 0),
    );
    return [...new Set(sorted.map(g => g.valueDef!.valueId))];
  }

  /**
   * Sort usecase rows by numKeys → keyIds (numeric lexicographic) → valueIds.
   * Uses actual number arrays — no comma-separated string parsing needed.
   */
  private sortUsecaseEntries(rows: UseCaseRow[]): UseCaseRow[] {
    return rows.sort((a, b) => {
      const aKeys = this.extractKeyIds(a);
      const bKeys = this.extractKeyIds(b);
      const aValues = this.extractValueIds(a);
      const bValues = this.extractValueIds(b);

      if (aKeys.length !== bKeys.length) return aKeys.length - bKeys.length;

      for (const [i, aKey] of aKeys.entries()) {
        if (aKey !== bKeys[i]) return aKey - bKeys[i];
      }
      for (const [i, aValue] of aValues.entries()) {
        if (aValue !== bValues[i]) return aValue - bValues[i];
      }
      return 0;
    });
  }

  // ─── Subgraph ─────────────────────────────────────────────────────────────

  /**
   * Read all subgraph data for file download.
   * Uses 6 parallel QB queries for optimal performance.
   */
  async readSubgraphData(
    fileSystemId: number,
  ): Promise<SubgraphDownloadModel[]> {
    const [
      subgraphRows,
      propertyRows,
      moduleRows,
      dataLinkRows,
      controlLinkRows,
      voiceTagRows,
    ] = await Promise.all([
      this.querySubgraphs(fileSystemId),
      this.querySubgraphProperties(fileSystemId),
      this.queryModules(fileSystemId),
      this.queryDataLinks(fileSystemId),
      this.queryControlLinks(fileSystemId),
      this.queryVoiceTags(fileSystemId),
    ]);

    const propertyMap = this.buildPropertyMap(propertyRows);
    const moduleMap = this.buildModuleMap(moduleRows);
    const dataLinkMap = this.buildDataLinkMap(dataLinkRows);
    const controlLinkMap = this.buildControlLinkMap(controlLinkRows);
    const voiceTagMap = this.buildVoiceTagMap(voiceTagRows);

    return subgraphRows.map(sg => ({
      subgraphId: sg.subgraphId,
      properties: propertyMap.get(sg.subgraphId) ?? [],
      modules: moduleMap.get(sg.subgraphId) ?? [],
      dataLinks: dataLinkMap.get(sg.subgraphId) ?? [],
      controlLinks: controlLinkMap.get(sg.subgraphId) ?? [],
      voiceTags: voiceTagMap.get(sg.subgraphId) ?? [],
    }));
  }

  private async querySubgraphs(fileSystemId: number): Promise<SubgraphRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.Subgraph)
      .createQueryBuilder('sg')
      .where('sg.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('sg.subgraphId', 'ASC')
      .getMany() as Promise<SubgraphRow[]>;
  }

  private async querySubgraphProperties(
    fileSystemId: number,
  ): Promise<SubgraphPropertyDataRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.SubgraphPropertyData)
      .createQueryBuilder('spd')
      .leftJoinAndSelect('spd.subgraph', 'sg')
      .leftJoinAndSelect('spd.subgraphPropertyDefinition', 'def')
      .where('sg.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('sg.subgraphId', 'ASC')
      .addOrderBy('def.propertyId', 'ASC')
      .getMany() as Promise<SubgraphPropertyDataRow[]>;
  }

  private async queryModules(fileSystemId: number): Promise<SpfModuleRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.SpfModule)
      .createQueryBuilder('sm')
      .leftJoinAndSelect('sm.subgraph', 'sg')
      .leftJoinAndSelect('sm.definition', 'smd')
      .leftJoinAndSelect('sm.container', 'c')
      .leftJoinAndSelect('sm.spfModulePropertiesData', 'smpd')
      .leftJoinAndSelect('smpd.propertyDefinition', 'mpd')
      .leftJoinAndSelect('sm.node', 'n')
      .leftJoinAndSelect('n.dataPorts', 'dp')
      .where('sm.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('sg.subgraphId', 'ASC')
      .addOrderBy('sm.instanceId', 'ASC')
      .getMany() as Promise<SpfModuleRow[]>;
  }

  private async queryDataLinks(fileSystemId: number): Promise<DataLinkRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.DataLink)
      .createQueryBuilder('dl')
      .leftJoinAndSelect('dl.sourceSubgraph', 'sg')
      .leftJoinAndSelect('dl.sourceNode', 'src_node')
      .leftJoinAndSelect('src_node.spfModule', 'src_mod')
      .leftJoinAndSelect('dl.sourcePort', 'src_port')
      .leftJoinAndSelect('dl.destinationNode', 'dest_node')
      .leftJoinAndSelect('dest_node.spfModule', 'dest_mod')
      .leftJoinAndSelect('dl.destinationPort', 'dest_port')
      .where('dl.fileSystemId = :fileSystemId', {fileSystemId})
      .andWhere('dl.linkType IN (:...types)', {
        types: [LINK_TYPE.IntraSubgraph, LINK_TYPE.InterUsecase],
      })
      .orderBy('sg.subgraphId', 'ASC')
      .addOrderBy('src_mod.instanceId', 'ASC')
      .getMany() as Promise<DataLinkRow[]>;
  }

  private async queryControlLinks(
    fileSystemId: number,
  ): Promise<ControlLinkRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.ControlLink)
      .createQueryBuilder('cl')
      .leftJoinAndSelect('cl.sourceSubgraph', 'sg')
      .leftJoinAndSelect('cl.peerNodeA', 'peer1_node')
      .leftJoinAndSelect('peer1_node.spfModule', 'peer1_mod')
      .leftJoinAndSelect('cl.nodeAPort', 'peer1_port')
      .leftJoinAndSelect('peer1_port.allocatedIntents', 'i1')
      .leftJoinAndSelect('cl.peerNodeB', 'peer2_node')
      .leftJoinAndSelect('peer2_node.spfModule', 'peer2_mod')
      .leftJoinAndSelect('cl.nodeBPort', 'peer2_port')
      .leftJoinAndSelect('peer2_port.allocatedIntents', 'i2')
      .where('cl.fileSystemId = :fileSystemId', {fileSystemId})
      .andWhere('cl.linkType IN (:...types)', {
        types: [LINK_TYPE.IntraSubgraph, LINK_TYPE.InterUsecase],
      })
      .orderBy('sg.subgraphId', 'ASC')
      .addOrderBy('peer1_mod.instanceId', 'ASC')
      .getMany() as Promise<ControlLinkRow[]>;
  }

  private async queryVoiceTags(
    fileSystemId: number,
  ): Promise<ModuleTagIdMapRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.ModuleTagIdMap)
      .createQueryBuilder('mtim')
      .leftJoinAndSelect('mtim.module', 'sm')
      .leftJoinAndSelect('sm.subgraph', 'sg')
      .leftJoinAndSelect('mtim.tagDefinition', 'td')
      .where('sm.fileSystemId = :fileSystemId', {fileSystemId})
      .andWhere('td.isVoice = :isVoice', {isVoice: true})
      .orderBy('sg.subgraphId', 'ASC')
      .addOrderBy('td.tagId', 'ASC')
      .addOrderBy('sm.instanceId', 'ASC')
      .getMany() as Promise<ModuleTagIdMapRow[]>;
  }

  // ─── Subgraph build helpers ───────────────────────────────────────────────

  private buildPropertyMap(
    rows: SubgraphPropertyDataRow[],
  ): Map<number, Array<{propertyId: number; payload: Uint8Array}>> {
    const map = new Map<
      number,
      Array<{propertyId: number; payload: Uint8Array}>
    >();
    for (const row of rows) {
      if (row.subgraph == null || row.payload == null) continue;
      const sgId = row.subgraph.subgraphId;
      if (!map.has(sgId)) map.set(sgId, []);
      map.get(sgId)!.push({
        propertyId: row.subgraphPropertyDefinition.propertyId,
        payload: row.payload,
      });
    }
    return map;
  }

  private buildModuleMap(rows: SpfModuleRow[]): Map<
    number,
    Array<{
      instanceId: number;
      moduleId: number;
      containerId: number;
      maxInputPorts: number;
      maxOutputPorts: number;
      properties: Array<{propertyId: number; payload: Uint8Array}>;
    }>
  > {
    const map = new Map<
      number,
      Array<{
        instanceId: number;
        moduleId: number;
        containerId: number;
        maxInputPorts: number;
        maxOutputPorts: number;
        properties: Array<{propertyId: number; payload: Uint8Array}>;
      }>
    >();

    for (const sm of rows) {
      const sgId = sm.subgraph!.subgraphId;
      if (!map.has(sgId)) map.set(sgId, []);

      const dataPorts = sm.node?.dataPorts ?? [];

      map.get(sgId)!.push({
        instanceId: sm.instanceId,
        moduleId: sm.definition!.moduleDefinitionId,
        containerId: sm.container!.containerId,
        maxInputPorts: dataPorts.filter(
          dp => dp.portIoType === PORT_IO_TYPE.Input,
        ).length,
        maxOutputPorts: dataPorts.filter(
          dp => dp.portIoType === PORT_IO_TYPE.Output,
        ).length,
        properties: (sm.spfModulePropertiesData ?? []).map(d => ({
          propertyId: d.propertyDefinition.propertyId,
          payload: d.payload,
        })),
      });
    }
    return map;
  }

  private buildDataLinkMap(rows: DataLinkRow[]): Map<
    number,
    Array<{
      sourceInstanceId: number;
      sourcePortId: number;
      destinationInstanceId: number;
      destinationPortId: number;
      isInterGraph: boolean;
    }>
  > {
    const map = new Map<
      number,
      Array<{
        sourceInstanceId: number;
        sourcePortId: number;
        destinationInstanceId: number;
        destinationPortId: number;
        isInterGraph: boolean;
      }>
    >();

    for (const dl of rows) {
      const sgId = dl.sourceSubgraph!.subgraphId;
      if (!map.has(sgId)) map.set(sgId, []);
      map.get(sgId)!.push({
        sourceInstanceId: dl.sourceNode!.spfModule!.instanceId,
        sourcePortId: dl.sourcePort!.dataPortId,
        destinationInstanceId: dl.destinationNode!.spfModule!.instanceId,
        destinationPortId: dl.destinationPort!.dataPortId,
        isInterGraph: dl.linkType === LINK_TYPE.InterUsecase,
      });
    }
    return map;
  }

  private buildControlLinkMap(rows: ControlLinkRow[]): Map<
    number,
    Array<{
      peer1InstanceId: number;
      peer1PortId: number;
      peer2InstanceId: number;
      peer2PortId: number;
      isInterGraph: boolean;
      heapId?: number;
      intentIds: number[];
    }>
  > {
    const map = new Map<
      number,
      Array<{
        peer1InstanceId: number;
        peer1PortId: number;
        peer2InstanceId: number;
        peer2PortId: number;
        isInterGraph: boolean;
        heapId?: number;
        intentIds: number[];
      }>
    >();

    for (const cl of rows) {
      const sgId = cl.sourceSubgraph!.subgraphId;
      if (!map.has(sgId)) map.set(sgId, []);

      // Collect intent IDs from both ports, dedup, sort numerically
      const allIntents = [
        ...(cl.nodeAPort?.allocatedIntents ?? []),
        ...(cl.nodeBPort?.allocatedIntents ?? []),
      ];
      const intentIds = [...new Set(allIntents.map(i => i.intentId))].sort(
        (a, b) => a - b,
      );

      map.get(sgId)!.push({
        peer1InstanceId: cl.peerNodeA!.spfModule!.instanceId,
        peer1PortId: cl.nodeAPort!.portId,
        peer2InstanceId: cl.peerNodeB!.spfModule!.instanceId,
        peer2PortId: cl.nodeBPort!.portId,
        isInterGraph: cl.linkType === LINK_TYPE.InterUsecase,
        heapId: cl.heapId ?? undefined,
        intentIds,
      });
    }
    return map;
  }

  private buildVoiceTagMap(
    rows: ModuleTagIdMapRow[],
  ): Map<number, Array<{tagId: number; moduleInstanceId: number}>> {
    const map = new Map<
      number,
      Array<{tagId: number; moduleInstanceId: number}>
    >();
    for (const row of rows) {
      const sgId = row.module!.subgraph!.subgraphId;
      if (!map.has(sgId)) map.set(sgId, []);
      map.get(sgId)!.push({
        tagId: row.tagDefinition!.tagId,
        moduleInstanceId: row.module!.instanceId,
      });
    }
    return map;
  }

  // ─── Container ───────────────────────────────────────────────────────────

  async readContainerData(
    fileSystemId: number,
  ): Promise<ContainerDownloadModel[]> {
    const containers = (await this.dataSource
      .getRepository(ENTITY_NAMES.Container)
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.containerPropertyData', 'cpd')
      .leftJoinAndSelect('cpd.containerProperty', 'cp')
      .where('c.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('c.containerId', 'ASC')
      .addOrderBy('cp.propertyId', 'ASC')
      .getMany()) as ContainerRow[];

    return containers.map(c => ({
      containerId: c.containerId,
      properties: (c.containerPropertyData ?? [])
        .filter(cpd => cpd.containerProperty != null && cpd.payload != null)
        .map(cpd => ({
          propertyId: cpd.containerProperty.propertyId,
          payload: cpd.payload!,
        })),
    }));
  }

  // ─── Calibration ─────────────────────────────────────────────────────────

  async readCalibrationData(
    fileSystemId: number,
  ): Promise<CalibrationDataDownloadModel[]> {
    const ckvEntries = await this.fetchAllCkvEntries(fileSystemId);
    if (ckvEntries.length === 0) return [];

    const ckvIds = ckvEntries.map(e => e.systemId);
    const [valRows, paramRows] = await Promise.all([
      this.fetchCkvValues(ckvIds),
      this.fetchParametersForCkvs(ckvIds),
    ]);

    const valMap = new Map<number, CkvValuesRow[]>();
    for (const v of valRows) {
      if (!valMap.has(v.ckvSystemId)) valMap.set(v.ckvSystemId, []);
      valMap.get(v.ckvSystemId)!.push(v);
    }
    for (const ckv of ckvEntries) ckv.values = valMap.get(ckv.systemId) ?? [];

    const sortedEntries = this.sortCkvEntries(ckvEntries);
    return this.buildCalibrationModels(sortedEntries, paramRows);
  }

  private async fetchAllCkvEntries(fileSystemId: number): Promise<CkvRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.module', 'sm')
      .leftJoinAndSelect('sm.subgraph', 'sg')
      .where('sm.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('sg.subgraphId', 'ASC')
      .addOrderBy('sm.instanceId', 'ASC')
      .getMany() as Promise<CkvRow[]>;
  }

  private fetchCkvValues(ckvIds: number[]): Promise<CkvValuesRow[]> {
    return this.queryInChunks(ckvIds, ids =>
      this.dataSource
        .getRepository(ENTITY_NAMES.CkvValues)
        .createQueryBuilder('cv')
        .leftJoinAndSelect('cv.valueDef', 'vd')
        .leftJoinAndSelect('vd.keys', 'k')
        .where('cv.ckvSystemId IN (:...ids)', {ids}),
    ) as Promise<CkvValuesRow[]>;
  }

  private fetchParametersForCkvs(
    ckvSystemIds: number[],
  ): Promise<CkvParameterPayloadRow[]> {
    return this.queryInChunks(ckvSystemIds, ids =>
      this.dataSource
        .getRepository(ENTITY_NAMES.CkvParameterPayload)
        .createQueryBuilder('cpp')
        .leftJoinAndSelect('cpp.spfParameter', 'param')
        .where('cpp.ckvSystemId IN (:...ids)', {ids})
        .orderBy('cpp.ckvSystemId', 'ASC')
        .addOrderBy('param.paramId', 'ASC'),
    ) as Promise<CkvParameterPayloadRow[]>;
  }

  /**
   * Execute chunked IN-clause queries in parallel to avoid SQLite variable limit (999).
   * Only needed for CKV parameter payloads — all other queries use a single fileSystemId.
   */
  private async queryInChunks<T extends ObjectLiteral>(
    ids: number[],
    buildQuery: (chunk: number[]) => SelectQueryBuilder<T>,
    chunkSize: number = this.SQLITE_MAX_VARIABLES,
  ): Promise<T[]> {
    if (ids.length === 0) return [];

    const chunks: number[][] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      chunks.push(ids.slice(i, i + chunkSize));
    }

    const results = await Promise.all(
      chunks.map(chunk => buildQuery(chunk).getMany()),
    );
    return results.flat();
  }

  private sortCkvEntries(entries: CkvRow[]): CkvRow[] {
    // Pre-sort each entry's values once — doing this inside the comparator
    // would sort the same array O(N log N) times instead of once per entry.
    const prepared = entries.map(e => ({
      entry: e,
      vals: [...(e.values ?? [])].sort(
        (x, y) =>
          (x.valueDef?.keys?.keyId ?? 0) - (y.valueDef?.keys?.keyId ?? 0),
      ),
    }));

    prepared.sort((a, b) => {
      const sgA = a.entry.module?.subgraph?.subgraphId ?? 0;
      const sgB = b.entry.module?.subgraph?.subgraphId ?? 0;
      if (sgA !== sgB) return sgA - sgB;

      const keyDiff = compareNumberArrays(
        a.vals.map(v => v.valueDef?.keys?.keyId ?? 0),
        b.vals.map(v => v.valueDef?.keys?.keyId ?? 0),
      );
      if (keyDiff !== 0) return keyDiff;
      const valDiff = compareNumberArrays(
        a.vals.map(v => v.valueDef?.valueId ?? 0),
        b.vals.map(v => v.valueDef?.valueId ?? 0),
      );
      if (valDiff !== 0) return valDiff;
      return (
        (a.entry.module?.instanceId ?? 0) - (b.entry.module?.instanceId ?? 0)
      );
    });

    return prepared.map(p => p.entry);
  }

  private buildCalibrationModels(
    sortedEntries: CkvRow[],
    paramRows: CkvParameterPayloadRow[],
  ): CalibrationDataDownloadModel[] {
    const paramMap = new Map<
      number,
      Array<{parameterId: number; payload: Uint8Array; pidType: string}>
    >();
    for (const row of paramRows) {
      if (!paramMap.has(row.ckvSystemId)) paramMap.set(row.ckvSystemId, []);
      paramMap.get(row.ckvSystemId)!.push({
        parameterId: row.spfParameter!.paramId,
        payload: row.payload!,
        pidType: row.spfParameter!.pidType,
      });
    }

    const result: CalibrationDataDownloadModel[] = [];
    let currentSg: CalibrationDataDownloadModel | null = null;
    let currentKvCombo:
      | CalibrationDataDownloadModel['keyValueCombinations'][0]
      | null = null;
    const masterKeyTracker = new Map<number, Map<number, boolean>>();

    for (const ckv of sortedEntries) {
      const subgraphId = ckv.module!.subgraph!.subgraphId;

      const vals = [...(ckv.values ?? [])].sort(
        (x, y) =>
          (x.valueDef?.keys?.keyId ?? 0) - (y.valueDef?.keys?.keyId ?? 0),
      );
      const keyIds = vals.map((v: CkvValuesRow) => v.valueDef!.keys.keyId);
      const valueIds = vals.map((v: CkvValuesRow) => v.valueDef!.valueId);

      if (!currentSg || currentSg.subgraphId !== subgraphId) {
        currentSg = {subgraphId, masterKeys: [], keyValueCombinations: []};
        result.push(currentSg);
        currentKvCombo = null;
        masterKeyTracker.set(subgraphId, new Map());
      }

      const mkMap = masterKeyTracker.get(subgraphId)!;
      for (const val of vals) {
        const keyId = val.valueDef!.keys.keyId;
        if (!mkMap.has(keyId)) {
          mkMap.set(keyId, val.valueDef!.keys.isDynamic ?? false);
        }
      }

      if (
        !currentKvCombo ||
        compareNumberArrays(currentKvCombo.keyIds, keyIds) !== 0 ||
        compareNumberArrays(currentKvCombo.valueIds, valueIds) !== 0
      ) {
        currentKvCombo = {keyIds, valueIds, modules: []};
        currentSg.keyValueCombinations.push(currentKvCombo);
      }

      currentKvCombo.modules.push({
        moduleInstanceId: ckv.module!.instanceId,
        parameters: paramMap.get(ckv.systemId) ?? [],
      });
    }

    for (const sg of result) {
      const mkMap = masterKeyTracker.get(sg.subgraphId)!;
      sg.masterKeys = [...mkMap.entries()]
        .sort(([a], [b]) => a - b)
        .map(([keyId, isDynamic]) => ({keyId, isDynamic}));
    }

    return result;
  }

  // ─── Tag Keys ─────────────────────────────────────────────────────────────

  async readTagKeys(fileSystemId: number): Promise<TagKeysDownloadModel[]> {
    const rows = (await this.dataSource
      .getRepository(ENTITY_NAMES.TagDefinition)
      .createQueryBuilder('td')
      .leftJoinAndSelect('td.keys', 'link')
      .leftJoinAndSelect('link.keyDefinition', 'kd')
      .where('td.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('td.tagId', 'ASC')
      .addOrderBy('kd.keyId', 'ASC')
      .getMany()) as TagDefinitionRow[];

    return rows
      .filter(td => (td.keys ?? []).length > 0)
      .map(td => ({
        tagId: td.tagId,
        keyIds: (td.keys ?? [])
          .filter(link => link.keyDefinition != null)
          .map(link => link.keyDefinition!.keyId),
      }));
  }

  // ─── Tagged Modules ───────────────────────────────────────────────────────

  async readTaggedModuleData(
    fileSystemId: number,
  ): Promise<TaggedModuleDownloadModel[]> {
    const rows = (await this.dataSource
      .getRepository(ENTITY_NAMES.ModuleTagIdMap)
      .createQueryBuilder('mtim')
      .leftJoinAndSelect('mtim.module', 'sm')
      .leftJoinAndSelect('sm.subgraph', 'sg')
      .leftJoinAndSelect('sm.definition', 'def')
      .leftJoinAndSelect('mtim.tagDefinition', 'td')
      .where('sm.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('sg.subgraphId', 'ASC')
      .addOrderBy('td.tagId', 'ASC')
      .addOrderBy('def.moduleDefinitionId', 'ASC')
      .addOrderBy('sm.instanceId', 'ASC')
      .getMany()) as ModuleTagIdMapRow[];

    const result: TaggedModuleDownloadModel[] = [];
    let current: TaggedModuleDownloadModel | null = null;

    for (const row of rows) {
      const subgraphId = row.module!.subgraph!.subgraphId;
      const tagId = row.tagDefinition!.tagId;
      const isVoice = row.tagDefinition!.isVoice;

      if (
        !current ||
        current.subgraphId !== subgraphId ||
        current.tagId !== tagId
      ) {
        current = {subgraphId, tagId, isVoice, moduleInstances: []};
        result.push(current);
      }

      current.moduleInstances.push({
        moduleId: row.module!.definition!.moduleDefinitionId,
        instanceId: row.module!.instanceId,
      });
    }

    return result;
  }

  // ─── Tag Data ─────────────────────────────────────────────────────────────

  async readTagData(fileSystemId: number): Promise<TagDataDownloadModel[]> {
    const baseRows = await this.fetchModuleTagIdMapRows(fileSystemId);
    if (baseRows.length === 0) return [];

    const mapIds = baseRows.map(r => r.systemId);
    const tkvRows = await this.fetchTkvsByMapIds(mapIds);

    const tkvMap = new Map<number, TkvRow[]>();
    for (const tkv of tkvRows) {
      if (!tkvMap.has(tkv.moduleTagIdMapSystemId))
        tkvMap.set(tkv.moduleTagIdMapSystemId, []);
      tkvMap.get(tkv.moduleTagIdMapSystemId)!.push(tkv);
    }
    for (const row of baseRows) row.tkvs = tkvMap.get(row.systemId) ?? [];

    const tkvIds = tkvRows.map(t => t.systemId);
    const [tkvValRows, paramRows] = await Promise.all([
      this.fetchTkvValues(tkvIds),
      tkvIds.length > 0
        ? this.fetchTkvParameterPayloads(tkvIds)
        : Promise.resolve([]),
    ]);

    const tkvValMap = new Map<number, TkvValuesRow[]>();
    for (const v of tkvValRows) {
      if (!tkvValMap.has(v.tkvSystemId)) tkvValMap.set(v.tkvSystemId, []);
      tkvValMap.get(v.tkvSystemId)!.push(v);
    }
    for (const tkv of tkvRows) tkv.values = tkvValMap.get(tkv.systemId) ?? [];

    return this.buildTagDataModels(baseRows, paramRows);
  }

  private async fetchModuleTagIdMapRows(
    fileSystemId: number,
  ): Promise<ModuleTagIdMapRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.ModuleTagIdMap)
      .createQueryBuilder('mtim')
      .leftJoinAndSelect('mtim.module', 'sm')
      .leftJoinAndSelect('sm.subgraph', 'sg')
      .leftJoinAndSelect('mtim.tagDefinition', 'td')
      .where('sm.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('sg.subgraphId', 'ASC')
      .addOrderBy('td.tagId', 'ASC')
      .getMany() as Promise<ModuleTagIdMapRow[]>;
  }

  private fetchTkvsByMapIds(mapIds: number[]): Promise<TkvRow[]> {
    return this.queryInChunks(mapIds, ids =>
      this.dataSource
        .getRepository(ENTITY_NAMES.Tkv)
        .createQueryBuilder('tkv')
        .where('tkv.moduleTagIdMapSystemId IN (:...ids)', {ids}),
    ) as Promise<TkvRow[]>;
  }

  private fetchTkvValues(tkvIds: number[]): Promise<TkvValuesRow[]> {
    return this.queryInChunks(tkvIds, ids =>
      this.dataSource
        .getRepository(ENTITY_NAMES.TkvValues)
        .createQueryBuilder('tv')
        .leftJoinAndSelect('tv.valueDef', 'vd')
        .leftJoinAndSelect('vd.keys', 'k')
        .where('tv.tkvSystemId IN (:...ids)', {ids}),
    ) as Promise<TkvValuesRow[]>;
  }

  private fetchTkvParameterPayloads(
    tkvSystemIds: number[],
  ): Promise<TkvParameterPayloadRow[]> {
    return this.queryInChunks(tkvSystemIds, ids =>
      this.dataSource
        .getRepository(ENTITY_NAMES.TkvParameterPayload)
        .createQueryBuilder('tpp')
        .leftJoinAndSelect('tpp.spfParameter', 'param')
        .where('tpp.tkvSystemId IN (:...ids)', {ids})
        .orderBy('tpp.tkvSystemId', 'ASC')
        .addOrderBy('param.paramId', 'ASC'),
    ) as Promise<TkvParameterPayloadRow[]>;
  }

  private buildTagDataModels(
    rows: ModuleTagIdMapRow[],
    paramRows: TkvParameterPayloadRow[],
  ): TagDataDownloadModel[] {
    const paramMap = new Map<
      number,
      Array<{parameterId: number; payload: Uint8Array}>
    >();
    for (const row of paramRows) {
      if (!paramMap.has(row.tkvSystemId)) paramMap.set(row.tkvSystemId, []);
      paramMap.get(row.tkvSystemId)!.push({
        parameterId: row.spfParameter!.paramId,
        payload: row.payload!,
      });
    }

    const result: TagDataDownloadModel[] = [];
    let current: TagDataDownloadModel | null = null;

    for (const row of rows) {
      const subgraphId = row.module!.subgraph!.subgraphId;
      const tagId = row.tagDefinition!.tagId;

      if (
        !current ||
        current.subgraphId !== subgraphId ||
        current.tagId !== tagId
      ) {
        const firstTkv = (row.tkvs ?? [])[0];
        const numTagKeyValues = (firstTkv?.values ?? []).length;
        current = {subgraphId, tagId, numTagKeyValues, tkvs: []};
        result.push(current);
      }

      for (const tkv of row.tkvs ?? []) {
        const vals = [...(tkv.values ?? [])].sort(
          (a, b) =>
            (a.valueDef?.keys?.keyId ?? 0) - (b.valueDef?.keys?.keyId ?? 0),
        );
        const tagKeyValues = vals.map(v => v.valueDef!.valueId);

        current.tkvs.push({
          tagKeyValues,
          modules: [
            {
              moduleInstanceId: row.module!.instanceId,
              parameters: paramMap.get(tkv.systemId) ?? [],
            },
          ],
        });
      }
    }

    return result.filter((m: TagDataDownloadModel) => m.tkvs.length > 0);
  }

  // ─── Driver Calibration ───────────────────────────────────────────────────

  async readDriverCalibrationData(
    fileSystemId: number,
  ): Promise<DriverCalibrationDownloadModel[]> {
    const dkvEntries = await this.fetchAllDkvEntries(fileSystemId);
    if (dkvEntries.length === 0) return [];

    const dkvIds = dkvEntries.map(e => e.systemId);
    const [valRows, paramRows] = await Promise.all([
      this.fetchDkvValues(dkvIds),
      this.fetchParametersForDkvs(dkvIds),
    ]);

    const valMap = new Map<number, DkvValuesRow[]>();
    for (const v of valRows) {
      if (!valMap.has(v.dkvSystemId)) valMap.set(v.dkvSystemId, []);
      valMap.get(v.dkvSystemId)!.push(v);
    }
    for (const dkv of dkvEntries) dkv.values = valMap.get(dkv.systemId) ?? [];

    return this.buildDriverCalibrationModels(dkvEntries, paramRows);
  }

  private async fetchAllDkvEntries(fileSystemId: number): Promise<DkvRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.Dkv)
      .createQueryBuilder('dkv')
      .leftJoinAndSelect('dkv.driverModule', 'dm')
      .leftJoinAndSelect('dm.definition', 'dmd')
      .where('dm.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('dmd.moduleDefinitionId', 'ASC')
      .addOrderBy('dkv.systemId', 'ASC')
      .getMany() as Promise<DkvRow[]>;
  }

  private fetchDkvValues(dkvIds: number[]): Promise<DkvValuesRow[]> {
    return this.queryInChunks(dkvIds, ids =>
      this.dataSource
        .getRepository(ENTITY_NAMES.DkvValues)
        .createQueryBuilder('dv')
        .leftJoinAndSelect('dv.valueDef', 'vd')
        .leftJoinAndSelect('vd.keys', 'k')
        .where('dv.dkvSystemId IN (:...ids)', {ids}),
    ) as Promise<DkvValuesRow[]>;
  }

  private fetchParametersForDkvs(
    dkvSystemIds: number[],
  ): Promise<DkvParameterPayloadRow[]> {
    return this.queryInChunks(dkvSystemIds, ids =>
      this.dataSource
        .getRepository(ENTITY_NAMES.DkvParameterPayload)
        .createQueryBuilder('dpp')
        .leftJoinAndSelect('dpp.driverParameter', 'dmpd')
        .where('dpp.dkvSystemId IN (:...ids)', {ids})
        .orderBy('dpp.dkvSystemId', 'ASC')
        .addOrderBy('dmpd.parameterId', 'ASC'),
    ) as Promise<DkvParameterPayloadRow[]>;
  }

  private buildDriverCalibrationModels(
    dkvEntries: DkvRow[],
    paramRows: DkvParameterPayloadRow[],
  ): DriverCalibrationDownloadModel[] {
    // Build param map: dkvSystemId → sorted parameters
    const paramMap = new Map<
      number,
      Array<{parameterId: number; payload: Uint8Array}>
    >();
    for (const row of paramRows) {
      if (!paramMap.has(row.dkvSystemId)) paramMap.set(row.dkvSystemId, []);
      if (row.payload) {
        paramMap.get(row.dkvSystemId)!.push({
          parameterId: row.driverParameter!.parameterId,
          payload: row.payload,
        });
      }
    }

    // Group by (moduleDefinitionId, keyIds-signature)
    const groupMap = new Map<string, DriverCalibrationDownloadModel>();
    const groupOrder: string[] = [];

    for (const dkv of dkvEntries) {
      const moduleDefinitionId =
        dkv.driverModule?.definition?.moduleDefinitionId ?? 0;

      const vals = [...(dkv.values ?? [])].sort(
        (a, b) =>
          (a.valueDef?.keys?.keyId ?? 0) - (b.valueDef?.keys?.keyId ?? 0),
      );
      const keyIds = vals.map(v => v.valueDef!.keys.keyId);
      const valueIds = vals.map(v => v.valueDef!.valueId);

      const groupKey = `${moduleDefinitionId}:${keyIds.join(',')}`;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {moduleDefinitionId, keyIds, ckvs: []});
        groupOrder.push(groupKey);
      }

      const parameters = paramMap.get(dkv.systemId) ?? [];
      if (parameters.length > 0) {
        groupMap.get(groupKey)!.ckvs.push({valueIds, parameters});
      }
    }

    // Sort groups: moduleDefinitionId ASC, then keyIds lex ASC
    const result = groupOrder.map(k => groupMap.get(k)!);
    result.sort((a, b) => {
      if (a.moduleDefinitionId !== b.moduleDefinitionId) {
        return a.moduleDefinitionId - b.moduleDefinitionId;
      }
      return compareNumberArrays(a.keyIds, b.keyIds);
    });

    // Sort CKVs within each group: valueIds lex ASC
    for (const group of result) {
      group.ckvs.sort((a, b) => compareNumberArrays(a.valueIds, b.valueIds));
    }

    return result;
  }

  async readKeyDefinitions(
    fileSystemId: number,
  ): Promise<KeyDefinitionDownloadModel[]> {
    const [keyRows, valueRows] = await Promise.all([
      this.dataSource
        .getRepository(ENTITY_NAMES.KeyDefinition)
        .createQueryBuilder('k')
        .where('k.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('k.keyId', 'ASC')
        .getMany() as Promise<KeyDefinitionRow[]>,
      this.dataSource
        .getRepository(ENTITY_NAMES.ValueDefinition)
        .createQueryBuilder('v')
        .innerJoin('v.keys', 'k')
        .where('k.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('k.keyId', 'ASC')
        .addOrderBy('v.valueId', 'ASC')
        .getMany() as Promise<ValueDefinitionRow[]>,
    ]);

    const valuesMap = new Map<number, ValueDefinitionDownloadModel[]>();
    for (const row of valueRows) {
      if (!valuesMap.has(row.keySystemId)) {
        valuesMap.set(row.keySystemId, []);
      }
      valuesMap.get(row.keySystemId)!.push({
        valueId: row.valueId,
        name: row.name,
        description: row.description ?? undefined,
        enumMember: row.enumMember ?? undefined,
        specialValue: row.specialValue ?? undefined,
      });
    }

    return keyRows.map(row => ({
      keyId: row.keyId,
      name: row.name,
      description: row.description ?? undefined,
      isVoice: row.isVoice == null ? undefined : Boolean(row.isVoice),
      isDynamic: row.isDynamic == null ? undefined : Boolean(row.isDynamic),
      isCalibrationKey:
        row.isCalibrationKey == null
          ? undefined
          : Boolean(row.isCalibrationKey),
      isGraphKey: row.isGraphKey == null ? undefined : Boolean(row.isGraphKey),
      enumName: row.enumName ?? undefined,
      enumMember: row.enumMember ?? undefined,
      calKeyEnumMember: row.calKeyEnumMember ?? undefined,
      graphKeyEnumMember: row.graphKeyEnumMember ?? undefined,
      specialityKeyValue: row.specialityKeyValue ?? undefined,
      values: valuesMap.get(row.systemId) ?? [],
    }));
  }

  async readTagDefinitions(
    fileSystemId: number,
  ): Promise<TagDefinitionDownloadModel[]> {
    const [tagRows, linkRows] = await Promise.all([
      this.dataSource
        .getRepository(ENTITY_NAMES.TagDefinition)
        .createQueryBuilder('td')
        .where('td.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('td.tagId', 'ASC')
        .getMany() as Promise<TagDefinitionRow[]>,
      this.dataSource
        .getRepository(ENTITY_NAMES.TagKeyDefLink)
        .createQueryBuilder('link')
        .innerJoinAndSelect('link.keyDefinition', 'key')
        .innerJoin('link.tagDefinition', 'td')
        .where('td.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('link.tagDefinitionSystemId', 'ASC')
        .addOrderBy('key.keyId', 'ASC')
        .getMany() as Promise<TagKeyDefLinkRow[]>,
    ]);

    const linksMap = new Map<number, TagKeyDownloadModel[]>();
    for (const link of linkRows) {
      if (!linksMap.has(link.tagDefinitionSystemId)) {
        linksMap.set(link.tagDefinitionSystemId, []);
      }
      linksMap.get(link.tagDefinitionSystemId)!.push({
        keyId: link.keyDefinition!.keyId,
        keyName: link.keyDefinition!.name,
        enumValue: link.tagEnumValue ?? undefined,
      });
    }

    return tagRows.map(row => ({
      tagId: row.tagId,
      name: row.name,
      description: row.description ?? undefined,
      isVoice: Boolean(row.isVoice),
      enumName: row.cHeaderEnumName ?? undefined,
      enumMember: row.cHeaderEnumValue ?? undefined,
      supportedKeys: linksMap.get(row.systemId) ?? [],
    }));
  }

  async readSpfModuleDefinitions(
    fileSystemId: number,
  ): Promise<SpfModuleDefinitionDownloadModel[]> {
    const [
      moduleRows,
      paramRows,
      portGroupRows,
      portDefRows,
      staticPortRows,
      staticIntentRows,
      dynamicIntentRows,
      containerTypeLinkRows,
    ] = await Promise.all([
      this.dataSource
        .getRepository(ENTITY_NAMES.SpfModuleDefinition)
        .createQueryBuilder('def')
        .leftJoinAndSelect('def.processor', 'pd')
        .where('def.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('def.moduleDefinitionId', 'ASC')
        .getMany() as Promise<SpfModuleDefinitionRow[]>,
      this.dataSource
        .getRepository(ENTITY_NAMES.SpfModuleParameterDefinition)
        .createQueryBuilder('param')
        .innerJoin('param.spfModuleDefinition', 'def')
        .where('def.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('param.spfModuleDefinitionSystemId', 'ASC')
        .addOrderBy('param.paramId', 'ASC')
        .getMany() as Promise<SpfModuleParameterDefinitionRow[]>,
      this.dataSource
        .getRepository(ENTITY_NAMES.DataPortGroup)
        .createQueryBuilder('pg')
        .innerJoin('pg.moduleDefinition', 'def')
        .where('def.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('pg.moduleDefinitionSystemId', 'ASC')
        .getMany() as Promise<DataPortGroupRow[]>,
      this.dataSource
        .getRepository(ENTITY_NAMES.DataPortDefinition)
        .createQueryBuilder('port')
        .innerJoin('port.dataPortGroup', 'pg')
        .innerJoin('pg.moduleDefinition', 'def')
        .where('def.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('port.dataPortGroupSystemId', 'ASC')
        .addOrderBy('port.dataPortId', 'ASC')
        .getMany() as Promise<DataPortDefinitionRow[]>,
      this.dataSource
        .getRepository(ENTITY_NAMES.StaticControlPortDefinition)
        .createQueryBuilder('sp')
        .innerJoin('sp.moduleDefinition', 'def')
        .where('def.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('sp.moduleDefinitionSystemId', 'ASC')
        .addOrderBy('sp.portId', 'ASC')
        .getMany() as Promise<StaticControlPortDefinitionRow[]>,
      this.dataSource
        .getRepository(ENTITY_NAMES.StaticIntentDefinition)
        .createQueryBuilder('si')
        .innerJoin('si.staticControlPortDefinition', 'sp')
        .innerJoin('sp.moduleDefinition', 'def')
        .where('def.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('si.staticControlPortDefinitionSystemId', 'ASC')
        .addOrderBy('si.intentId', 'ASC')
        .getMany() as Promise<StaticIntentDefinitionRow[]>,
      this.dataSource
        .getRepository(ENTITY_NAMES.DynamicIntentDefinition)
        .createQueryBuilder('di')
        .innerJoin('di.moduleDefinition', 'def')
        .where('def.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('di.moduleDefinitionSystemId', 'ASC')
        .addOrderBy('di.intentId', 'ASC')
        .getMany() as Promise<DynamicIntentDefinitionRow[]>,
      this.dataSource
        .getRepository('ModuleDefinitionContainerTypeLink')
        .createQueryBuilder('link')
        .innerJoinAndSelect('link.containerType', 'ct')
        .innerJoin('link.moduleDefinition', 'def')
        .where('def.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('link.moduleDefinitionSystemId', 'ASC')
        .getMany() as Promise<ModuleDefinitionContainerTypeLinkRow[]>,
    ]);

    const paramsMap = this.buildSpfParamsMap(paramRows);
    const dataPortsMap = this.buildDataPortsMap(portDefRows);
    const portGroupsMap = this.buildPortGroupsMap(portGroupRows, dataPortsMap);
    const staticIntentsMap = this.buildStaticIntentsMap(staticIntentRows);
    const staticPortsMap = this.buildStaticPortsMap(
      staticPortRows,
      staticIntentsMap,
    );
    const dynamicIntentsMap = this.buildDynamicIntentsMap(dynamicIntentRows);
    const containerTypeIdsMap = this.buildContainerTypeIdsMap(
      containerTypeLinkRows,
    );

    return moduleRows.map(row => ({
      moduleDefinitionId: row.moduleDefinitionId,
      name: row.name,
      displayName: row.displayName ?? undefined,
      description: row.description ?? undefined,
      groupName: row.groupName ?? undefined,
      searchKeys: row.modSearchKeys ?? undefined,
      stackSize: row.stackSize,
      params: paramsMap.get(row.systemId) ?? [],
      portGroups: portGroupsMap.get(row.systemId) ?? [],
      staticControlPorts: staticPortsMap.get(row.systemId) ?? [],
      dynamicIntents: dynamicIntentsMap.get(row.systemId) ?? [],
      supportedProcessorIds:
        row.processor?.processorDefinitionId != null
          ? [row.processor.processorDefinitionId]
          : [],
      supportedContainerTypes: containerTypeIdsMap.get(row.systemId) ?? [],
    }));
  }

  private buildSpfParamsMap(
    rows: SpfModuleParameterDefinitionRow[],
  ): Map<number, SpfParamDefDownloadModel[]> {
    const map = new Map<number, SpfParamDefDownloadModel[]>();
    for (const row of rows) {
      if (!map.has(row.spfModuleDefinitionSystemId))
        map.set(row.spfModuleDefinitionSystemId, []);
      map.get(row.spfModuleDefinitionSystemId)!.push({
        paramId: row.paramId,
        name: row.name ?? undefined,
        description: row.description ?? undefined,
        maxSize: row.maxSize,
        pidType: row.pidType,
        elementsStructure: row.elementsStructure ?? '[]',
        isReadOnly: Boolean(row.isReadOnly),
        toolPolicies: row.toolPolicies ?? undefined,
      });
    }
    return map;
  }

  private buildDataPortsMap(
    rows: DataPortDefinitionRow[],
  ): Map<number, DataPortDownloadModel[]> {
    const map = new Map<number, DataPortDownloadModel[]>();
    for (const row of rows) {
      if (!map.has(row.dataPortGroupSystemId))
        map.set(row.dataPortGroupSystemId, []);
      map.get(row.dataPortGroupSystemId)!.push({
        portId: row.dataPortId,
        name: row.name ?? undefined,
      });
    }
    return map;
  }

  private buildPortGroupsMap(
    rows: DataPortGroupRow[],
    dataPortsMap: Map<number, DataPortDownloadModel[]>,
  ): Map<number, DataPortGroupDownloadModel[]> {
    const map = new Map<number, DataPortGroupDownloadModel[]>();
    for (const row of rows) {
      if (!map.has(row.moduleDefinitionSystemId))
        map.set(row.moduleDefinitionSystemId, []);
      map.get(row.moduleDefinitionSystemId)!.push({
        maxPortCount: row.maxAllowedPortCount,
        portIoType: row.portIoType === PORT_IO_TYPE.Input ? 'Input' : 'Output',
        ports: dataPortsMap.get(row.systemId) ?? [],
      });
    }
    return map;
  }

  private buildStaticIntentsMap(
    rows: StaticIntentDefinitionRow[],
  ): Map<number, StaticIntentDownloadModel[]> {
    const map = new Map<number, StaticIntentDownloadModel[]>();
    for (const row of rows) {
      if (!map.has(row.staticControlPortDefinitionSystemId))
        map.set(row.staticControlPortDefinitionSystemId, []);
      map.get(row.staticControlPortDefinitionSystemId)!.push({
        intentId: row.intentId,
        name: row.name,
      });
    }
    return map;
  }

  private buildStaticPortsMap(
    rows: StaticControlPortDefinitionRow[],
    staticIntentsMap: Map<number, StaticIntentDownloadModel[]>,
  ): Map<number, StaticControlPortDownloadModel[]> {
    const map = new Map<number, StaticControlPortDownloadModel[]>();
    for (const row of rows) {
      if (!map.has(row.moduleDefinitionSystemId))
        map.set(row.moduleDefinitionSystemId, []);
      map.get(row.moduleDefinitionSystemId)!.push({
        portId: row.portId,
        portName: row.portName ?? '',
        intents: staticIntentsMap.get(row.systemId) ?? [],
      });
    }
    return map;
  }

  private buildDynamicIntentsMap(
    rows: DynamicIntentDefinitionRow[],
  ): Map<number, DynamicIntentDownloadModel[]> {
    const map = new Map<number, DynamicIntentDownloadModel[]>();
    for (const row of rows) {
      if (!map.has(row.moduleDefinitionSystemId))
        map.set(row.moduleDefinitionSystemId, []);
      map.get(row.moduleDefinitionSystemId)!.push({
        intentId: row.intentId,
        name: row.name,
        maxPort: row.maxPort,
      });
    }
    return map;
  }

  private buildContainerTypeIdsMap(
    links: ModuleDefinitionContainerTypeLinkRow[],
  ): Map<number, number[]> {
    const map = new Map<number, number[]>();
    for (const link of links) {
      if (!map.has(link.moduleDefinitionSystemId))
        map.set(link.moduleDefinitionSystemId, []);
      map.get(link.moduleDefinitionSystemId)!.push(link.containerType!.value);
    }
    return map;
  }

  async readDriverModuleDefinitions(
    fileSystemId: number,
  ): Promise<DriverModuleDefinitionDownloadModel[]> {
    const [moduleRows, paramRows] = await Promise.all([
      this.dataSource
        .getRepository(ENTITY_NAMES.DriverModuleDefinition)
        .createQueryBuilder('def')
        .where('def.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('def.moduleDefinitionId', 'ASC')
        .getMany() as Promise<DriverModuleDefinitionRow[]>,
      this.dataSource
        .getRepository(ENTITY_NAMES.DriverModuleParameterDefinition)
        .createQueryBuilder('param')
        .innerJoin('param.driverModuleDefinition', 'def')
        .where('def.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('param.driverModuleDefinitionSystemId', 'ASC')
        .addOrderBy('param.parameterId', 'ASC')
        .getMany() as Promise<DriverModuleParameterDefinitionRow[]>,
    ]);

    const paramsMap = new Map<number, DriverParamDefDownloadModel[]>();
    for (const row of paramRows) {
      if (!paramsMap.has(row.driverModuleDefinitionSystemId))
        paramsMap.set(row.driverModuleDefinitionSystemId, []);
      paramsMap.get(row.driverModuleDefinitionSystemId)!.push({
        parameterId: row.parameterId,
        name: row.name ?? undefined,
        description: row.description ?? undefined,
        maxSize: row.maxSize,
        paramStructure: row.paramStructure,
      });
    }

    return moduleRows.map(row => ({
      moduleDefinitionId: row.moduleDefinitionId,
      name: row.name,
      description: row.description ?? undefined,
      groupName: row.groupName ?? undefined,
      params: paramsMap.get(row.systemId) ?? [],
    }));
  }

  async readSpfPropertyDefinitions(
    fileSystemId: number,
  ): Promise<SpfPropertyDefinitionDownloadModel[]> {
    const [subgraphRows, containerRows] = await Promise.all([
      this.dataSource
        .getRepository(ENTITY_NAMES.SubgraphPropertyDefinition)
        .createQueryBuilder('sp')
        .where('sp.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('sp.propertyId', 'ASC')
        .getMany() as Promise<SubgraphPropertyRow[]>,
      this.dataSource
        .getRepository(ENTITY_NAMES.ContainerProperty)
        .createQueryBuilder('cp')
        .where('cp.fileSystemId = :fileSystemId', {fileSystemId})
        .orderBy('cp.propertyId', 'ASC')
        .getMany() as Promise<ContainerPropertyRow[]>,
    ]);

    const result: SpfPropertyDefinitionDownloadModel[] = [
      ...subgraphRows.map(row => ({
        propertyId: row.propertyId,
        name: row.name,
        description: row.description ?? undefined,
        maxSize: row.maxSize,
        elementsStructure: row.elementsStructure ?? '[]',
        categoryName: 'SG_CFG',
        isVoice: Boolean(row.isVoice),
      })),
      ...containerRows.map(row => ({
        propertyId: row.propertyId,
        name: row.name,
        description: row.description ?? undefined,
        maxSize: row.maxSize,
        elementsStructure: row.elementsStructure ?? '[]',
        categoryName: 'CONTAINTER_CFG',
      })),
    ];

    return result;
  }

  async readDriverPropertyDefinitions(
    fileSystemId: number,
  ): Promise<DriverPropertyDefinitionDownloadModel[]> {
    const rows = (await this.dataSource
      .getRepository(ENTITY_NAMES.ModulePropertyDefinition)
      .createQueryBuilder('prop')
      .where('prop.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('prop.propertyId', 'ASC')
      .getMany()) as ModulePropertyRow[];

    return rows.map(row => ({
      propertyId: row.propertyId,
      name: row.name,
      description: row.description ?? undefined,
      maxSize: row.maxSize,
      propertyStructure: row.propertyStructure,
    }));
  }

  async readConfiguration(
    fileSystemId: number,
  ): Promise<ConfigurationDownloadModel | null> {
    const row = (await this.dataSource
      .getRepository(ENTITY_NAMES.Configuration)
      .createQueryBuilder('c')
      .select([
        'c.portStrategy',
        'c.defaultProcessorDomain',
        'c.rtcConfig',
        'c.alsaLibConfig',
      ])
      .where('c.fileSystemId = :fileSystemId', {fileSystemId})
      .getOne()) as ConfigurationRow | null;

    if (!row) return null;

    return {
      portStrategy: row.portStrategy,
      defaultProcessorDomain: row.defaultProcessorDomain,
      rtcConfig: row.rtcConfig,
      alsaLibConfig: row.alsaLibConfig,
    };
  }

  async readProcessorDefinitions(
    fileSystemId: number,
  ): Promise<ProcessorDefinitionDownloadModel[]> {
    const rows = (await this.dataSource
      .getRepository(ENTITY_NAMES.ProcessorDefinition)
      .createQueryBuilder('pd')
      .where('pd.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('pd.processorDefinitionId', 'ASC')
      .getMany()) as ProcessorDefinitionRow[];

    return rows.map(row => ({
      processorDefinitionId: row.processorDefinitionId,
      name: row.name,
    }));
  }

  async readContainerTypeDefinitions(
    fileSystemId: number,
  ): Promise<ContainerTypeDefinitionDownloadModel[]> {
    const rows = (await this.dataSource
      .getRepository(ENTITY_NAMES.ContainerType)
      .createQueryBuilder('ct')
      .innerJoin('ct.moduleDefinitionLinks', 'link')
      .innerJoin(
        'link.moduleDefinition',
        'def',
        'def.fileSystemId = :fileSystemId',
        {
          fileSystemId,
        },
      )
      .distinct(true)
      .orderBy('ct.value', 'ASC')
      .getMany()) as ContainerTypeRow[];

    return rows.map(row => ({
      value: row.value,
      name: row.name,
    }));
  }
}
