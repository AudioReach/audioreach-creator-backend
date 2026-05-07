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

/**
 * Database implementation of UseCaseQueryService
 * Handles querying use cases with their global key vectors from the database
 */
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

    // Approach 1: Use 3 separate optimized queries for better performance and reliability
    const [modules, dataLinks, controlLinks] = await Promise.all([
      this.queryModulesForUseCases(useCaseSystemIds),
      this.queryDataLinksForUseCases(useCaseSystemIds),
      this.queryControlLinksForUseCases(useCaseSystemIds),
    ]);

    return new UseCaseComponentsReadModel(modules, dataLinks, controlLinks);
  }

  /**
   * Query modules (nodes with spfModule) for specific use cases
   */
  private async queryModulesForUseCases(
    useCaseSystemIds: number[],
  ): Promise<ModuleReadModel[]> {
    const nodes = await this.dataSource
      .getRepository('Node')
      .createQueryBuilder('node')
      .innerJoin('use_case_nodes', 'ucn', 'ucn.node_system_id = node.systemId')
      .where('ucn.use_case_system_id IN (:...useCaseSystemIds)', {
        useCaseSystemIds,
      })
      // Join module and related data
      .leftJoinAndSelect('node.spfModule', 'spfModule')
      .leftJoinAndSelect('spfModule.container', 'container')
      .leftJoinAndSelect('spfModule.subgraph', 'subgraph')
      // Join ports
      .leftJoinAndSelect('node.dataPorts', 'dataPort')
      .leftJoinAndSelect('node.controlPorts', 'controlPort')
      .leftJoinAndSelect('controlPort.allocatedIntents', 'intent')
      .getMany();

    // Deduplicate and map to read models
    const moduleMap = new Map<number, ModuleReadModel>();
    for (const node of nodes) {
      const nodeRow = node as NodeRow;
      if (nodeRow.spfModule && !moduleMap.has(nodeRow.systemId)) {
        const moduleReadModel =
          UseCaseQueryMappers.mapNodeToModuleReadModel(nodeRow);
        moduleMap.set(nodeRow.systemId, moduleReadModel);
      }
    }

    return [...moduleMap.values()];
  }

  /**
   * Query data links for specific use cases
   */
  private async queryDataLinksForUseCases(
    useCaseSystemIds: number[],
  ): Promise<DataLinkReadModel[]> {
    const dataLinks = await this.dataSource
      .getRepository('DataLink')
      .createQueryBuilder('dl')
      .innerJoin(
        'use_case_data_links',
        'ucdl',
        'ucdl.data_link_system_id = dl.systemId',
      )
      .where('ucdl.use_case_system_id IN (:...useCaseSystemIds)', {
        useCaseSystemIds,
      })
      .getMany();

    // Deduplicate and map to read models
    const dataLinkMap = new Map<number, DataLinkReadModel>();
    for (const dataLink of dataLinks) {
      const dataLinkRow = dataLink as DataLinkRow;
      if (!dataLinkMap.has(dataLinkRow.systemId)) {
        const dataLinkReadModel =
          UseCaseQueryMappers.mapToDataLinkReadModel(dataLinkRow);
        dataLinkMap.set(dataLinkRow.systemId, dataLinkReadModel);
      }
    }

    return [...dataLinkMap.values()];
  }

  /**
   * Query control links for specific use cases
   */
  private async queryControlLinksForUseCases(
    useCaseSystemIds: number[],
  ): Promise<ControlLinkReadModel[]> {
    const controlLinks = await this.dataSource
      .getRepository('ControlLink')
      .createQueryBuilder('cl')
      .innerJoin(
        'use_case_control_links',
        'uccl',
        'uccl.control_link_system_id = cl.systemId',
      )
      .where('uccl.use_case_system_id IN (:...useCaseSystemIds)', {
        useCaseSystemIds,
      })
      .getMany();

    // Deduplicate and map to read models
    const controlLinkMap = new Map<number, ControlLinkReadModel>();
    for (const controlLink of controlLinks) {
      const controlLinkRow = controlLink as ControlLinkRow;
      if (!controlLinkMap.has(controlLinkRow.systemId)) {
        const controlLinkReadModel =
          UseCaseQueryMappers.mapToControlLinkReadModel(controlLinkRow);
        controlLinkMap.set(controlLinkRow.systemId, controlLinkReadModel);
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
