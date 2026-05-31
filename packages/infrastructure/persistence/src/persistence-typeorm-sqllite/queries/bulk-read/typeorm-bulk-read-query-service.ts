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
} from '@arc/core';
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
import type {ModuleTagIdMapRow} from '../../entity-schema/usecase-data/module/spf-module-tag-data.schema.js';

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

  constructor(private readonly dataSource: DataSource) {
    if (!this.dataSource) {
      throw new Error('DataSource is required');
    }
  }

  async readAllEntitiesForFile(
    fileSystemId: number,
  ): Promise<DownloadEntities> {
    const [
      headerMetadata,
      usecaseData,
      subgraphData,
      containerData,
      calibrationData,
    ] = await Promise.all([
      this.readFileProperties(fileSystemId),
      this.readUsecaseData(fileSystemId),
      this.readSubgraphData(fileSystemId),
      this.readContainerData(fileSystemId),
      this.readCalibrationData(fileSystemId),
    ]);

    return {
      headerMetadata,
      usecaseData,
      subgraphData,
      containerData,
      calibrationData,
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
      subgraphIds: (uc.subgraphs ?? [])
        .map(sg => sg.subgraphId)
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
      .leftJoinAndSelect('uc.subgraphs', 'sg')
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
        types: ['INTRA_SUBGRAPH', 'INTER_USECASE'],
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
        types: ['INTRA_SUBGRAPH', 'INTER_USECASE'],
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
      const sgId = row.subgraph!.subgraphId;
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
        maxInputPorts: dataPorts.filter(dp => dp.portIoType === 'Input').length,
        maxOutputPorts: dataPorts.filter(dp => dp.portIoType === 'Output')
          .length,
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
        isInterGraph: dl.linkType === 'INTER_USECASE',
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
        isInterGraph: cl.linkType === 'INTER_USECASE',
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

  /**
   * Read all calibration data (audio + voice) with no scenario filtering.
   * Application layer uses isVoiceSubgraph(subgraph.properties) to split.
   */
  async readCalibrationData(
    fileSystemId: number,
  ): Promise<CalibrationDataDownloadModel[]> {
    const ckvEntries = await this.fetchAllCkvEntries(fileSystemId);

    const sortedEntries = this.sortCkvEntries(ckvEntries);

    const ckvSystemIds = sortedEntries.map(e => e.systemId);
    const paramRows =
      ckvSystemIds.length > 0
        ? await this.fetchParametersForCkvs(ckvSystemIds)
        : [];

    return this.buildCalibrationModels(sortedEntries, paramRows);
  }

  private async fetchAllCkvEntries(fileSystemId: number): Promise<CkvRow[]> {
    return this.dataSource
      .getRepository(ENTITY_NAMES.Ckv)
      .createQueryBuilder('ckv')
      .leftJoinAndSelect('ckv.module', 'sm')
      .leftJoinAndSelect('sm.subgraph', 'sg')
      .leftJoinAndSelect('ckv.values', 'cv')
      .leftJoinAndSelect('cv.valueDef', 'vd')
      .leftJoinAndSelect('vd.keys', 'k')
      .where('sm.fileSystemId = :fileSystemId', {fileSystemId})
      .orderBy('sg.subgraphId', 'ASC')
      .addOrderBy('sm.instanceId', 'ASC')
      .getMany() as Promise<CkvRow[]>;
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

  /**
   * Sort hydrated CkvRow entries by subgraphId → keyIds → valueIds → moduleInstanceId.
   * Operates on number arrays — no comma-separated string parsing needed.
   */
  private sortCkvEntries(entries: CkvRow[]): CkvRow[] {
    return entries.sort((a, b) => {
      const sgA = a.module?.subgraph?.subgraphId ?? 0;
      const sgB = b.module?.subgraph?.subgraphId ?? 0;
      if (sgA !== sgB) return sgA - sgB;

      const aVals = this.toSortedCkvValues(a);
      const bVals = this.toSortedCkvValues(b);
      const maxLen = Math.max(aVals.length, bVals.length);

      for (let i = 0; i < maxLen; i++) {
        const ak = aVals[i]?.valueDef?.keys?.keyId ?? -1;
        const bk = bVals[i]?.valueDef?.keys?.keyId ?? -1;
        if (ak !== bk) return ak - bk;
      }
      for (let i = 0; i < maxLen; i++) {
        const av = aVals[i]?.valueDef?.valueId ?? -1;
        const bv = bVals[i]?.valueDef?.valueId ?? -1;
        if (av !== bv) return av - bv;
      }
      return (a.module?.instanceId ?? 0) - (b.module?.instanceId ?? 0);
    });
  }

  private toSortedCkvValues(ckv: CkvRow): CkvValuesRow[] {
    return [...(ckv.values ?? [])].sort(
      (x, y) => (x.valueDef?.keys?.keyId ?? 0) - (y.valueDef?.keys?.keyId ?? 0),
    );
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

      const sortedVals = [...(ckv.values ?? [])].sort(
        (x, y) =>
          (x.valueDef?.keys?.keyId ?? 0) - (y.valueDef?.keys?.keyId ?? 0),
      );
      const keyIds = sortedVals.map(v => v.valueDef!.keys.keyId);
      const valueIds = sortedVals.map(v => v.valueDef!.valueId);

      if (!currentSg || currentSg.subgraphId !== subgraphId) {
        currentSg = {subgraphId, masterKeys: [], keyValueCombinations: []};
        result.push(currentSg);
        currentKvCombo = null;
        masterKeyTracker.set(subgraphId, new Map());
      }

      const mkMap = masterKeyTracker.get(subgraphId)!;
      for (const val of sortedVals) {
        const keyId = val.valueDef!.keys.keyId;
        if (!mkMap.has(keyId)) {
          mkMap.set(keyId, val.valueDef!.keys.isDynamic ?? false);
        }
      }

      if (
        !currentKvCombo ||
        currentKvCombo.keyIds.join(',') !== keyIds.join(',') ||
        currentKvCombo.valueIds.join(',') !== valueIds.join(',')
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
}
