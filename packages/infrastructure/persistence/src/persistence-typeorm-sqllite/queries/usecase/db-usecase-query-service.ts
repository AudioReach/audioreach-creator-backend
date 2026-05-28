/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  UseCaseQueryService,
  KeyVectorReadModel,
  ModuleReadModel,
  DataLinkReadModel,
  ControlLinkReadModel,
} from '@arc/core';
import {UseCaseReadModel, UseCaseComponentsReadModel} from '@arc/core';
import {DataSource} from 'typeorm';
import type {
  UseCaseRow,
  NodeRow,
  DataLinkRow,
  ControlLinkRow,
} from '../../entity-schema/index.js';
import {UseCaseQueryMappers} from './usecase-query-mappers.js';

export class DbUseCaseQueryService implements UseCaseQueryService {
  constructor(private readonly dataSource: DataSource) {}

  async getAllUseCases(fileId: number): Promise<UseCaseReadModel[]> {
    const useCases = await this.dataSource
      .getRepository('UseCase')
      .createQueryBuilder('uc')
      .where('uc.fileSystemId = :fileId', {fileId})
      .leftJoinAndSelect('uc.gkvEntries', 'gkv')
      .leftJoinAndSelect('gkv.valueDef', 'v')
      .leftJoinAndSelect('v.keys', 'k')
      .leftJoinAndSelect('uc.categories', 'cat')
      .getMany();

    return useCases.map(useCaseRow =>
      this.mapToReadModel(useCaseRow as UseCaseRow),
    );
  }

  async getAllComponentsForUseCases(
    useCaseSystemIds: number[],
  ): Promise<UseCaseComponentsReadModel> {
    if (useCaseSystemIds.length === 0) {
      return new UseCaseComponentsReadModel([], [], []);
    }

    const [modules, dataLinks, controlLinks] = await Promise.all([
      this.queryModulesForUseCases(useCaseSystemIds),
      this.queryDataLinksForUseCases(useCaseSystemIds),
      this.queryControlLinksForUseCases(useCaseSystemIds),
    ]);

    return new UseCaseComponentsReadModel(modules, dataLinks, controlLinks);
  }

  private async queryModulesForUseCases(
    ids: number[],
  ): Promise<ModuleReadModel[]> {
    const nodes = await this.dataSource
      .getRepository('Node')
      .createQueryBuilder('node')
      .innerJoin('spf_modules', 'sm', 'sm.system_id = node.systemId')
      .innerJoin(
        'use_case_subgraphs',
        'ucs',
        'ucs.subgraph_system_id = sm.subgraph_system_id AND ucs.usecase_system_id IN (:...ids)',
        {ids},
      )
      .leftJoinAndSelect('node.spfModule', 'spfModule')
      .leftJoinAndSelect('spfModule.container', 'container')
      .leftJoinAndSelect('spfModule.subgraph', 'subgraph')
      .leftJoinAndSelect('node.dataPorts', 'dataPort')
      .leftJoinAndSelect('node.controlPorts', 'controlPort')
      .leftJoinAndSelect('controlPort.allocatedIntents', 'intent')
      .getMany();

    const moduleMap = new Map<number, ModuleReadModel>();
    for (const node of nodes) {
      const nodeRow = node as NodeRow;
      if (nodeRow.spfModule && !moduleMap.has(nodeRow.systemId)) {
        moduleMap.set(
          nodeRow.systemId,
          UseCaseQueryMappers.mapNodeToModuleReadModel(nodeRow),
        );
      }
    }

    return [...moduleMap.values()];
  }

  private async queryDataLinksForUseCases(
    ids: number[],
  ): Promise<DataLinkReadModel[]> {
    const intraSubgraph = await this.dataSource
      .getRepository('DataLink')
      .createQueryBuilder('dl')
      .innerJoin(
        'use_case_subgraphs',
        'ucs',
        'ucs.subgraph_system_id = dl.sourceSubgraphSystemId AND ucs.usecase_system_id IN (:...ids)',
        {ids},
      )
      .where("dl.linkType = 'INTRA_SUBGRAPH'")
      .getMany();

    const intraUsecase = await this.dataSource
      .getRepository('DataLink')
      .createQueryBuilder('dl')
      .innerJoin(
        'use_case_subgraph_pairs',
        'ucsp',
        'ucsp.source_subgraph_system_id = dl.sourceSubgraphSystemId AND ucsp.dest_subgraph_system_id = dl.destSubgraphSystemId AND ucsp.usecase_system_id IN (:...ids)',
        {ids},
      )
      .where("dl.linkType = 'INTRA_USECASE'")
      .getMany();

    const dataLinkMap = new Map<number, DataLinkReadModel>();
    for (const dl of [...intraSubgraph, ...intraUsecase]) {
      const row = dl as DataLinkRow;
      if (!dataLinkMap.has(row.systemId)) {
        dataLinkMap.set(
          row.systemId,
          UseCaseQueryMappers.mapToDataLinkReadModel(row),
        );
      }
    }

    return [...dataLinkMap.values()];
  }

  private async queryControlLinksForUseCases(
    ids: number[],
  ): Promise<ControlLinkReadModel[]> {
    const intraSubgraph = await this.dataSource
      .getRepository('ControlLink')
      .createQueryBuilder('cl')
      .innerJoin(
        'use_case_subgraphs',
        'ucs',
        'ucs.subgraph_system_id = cl.sourceSubgraphSystemId AND ucs.usecase_system_id IN (:...ids)',
        {ids},
      )
      .where("cl.linkType = 'INTRA_SUBGRAPH'")
      .getMany();

    const intraUsecase = await this.dataSource
      .getRepository('ControlLink')
      .createQueryBuilder('cl')
      .innerJoin(
        'use_case_subgraph_pairs',
        'ucsp',
        'ucsp.source_subgraph_system_id = cl.sourceSubgraphSystemId AND ucsp.dest_subgraph_system_id = cl.destSubgraphSystemId AND ucsp.usecase_system_id IN (:...ids)',
        {ids},
      )
      .where("cl.linkType = 'INTRA_USECASE'")
      .getMany();

    const controlLinkMap = new Map<number, ControlLinkReadModel>();
    for (const cl of [...intraSubgraph, ...intraUsecase]) {
      const row = cl as ControlLinkRow;
      if (!controlLinkMap.has(row.systemId)) {
        controlLinkMap.set(
          row.systemId,
          UseCaseQueryMappers.mapToControlLinkReadModel(row),
        );
      }
    }

    return [...controlLinkMap.values()];
  }

  private mapToReadModel(useCaseRow: UseCaseRow): UseCaseReadModel {
    const gkv: KeyVectorReadModel[] = [];

    if (useCaseRow.gkvEntries) {
      for (const entry of useCaseRow.gkvEntries) {
        if (entry.valueDef) {
          gkv.push(UseCaseQueryMappers.mapValueToKeyVector(entry.valueDef));
        }
      }
    }

    const categories = useCaseRow.categories?.map(cat => cat.name);

    return new UseCaseReadModel(
      useCaseRow.systemId,
      gkv,
      useCaseRow.alias,
      useCaseRow.aliasId,
      categories,
    );
  }
}
