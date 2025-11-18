import type {UseCaseQueryService} from '@arc/core';
import {
  UseCaseReadModel,
  UseCaseComponentsReadModel,
  type KeyVectorReadModel,
  type ModuleReadModel,
  type DataLinkReadModel,
  type ControlLinkReadModel,
} from '@arc/core';
import {DataSource} from 'typeorm';
import type {UseCaseRow} from '../../entity-schema/index.js';
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
      .leftJoinAndSelect('uc.keyVector', 'kv')
      .leftJoinAndSelect('kv.values', 'v')
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

    // Query all use cases with their components using comprehensive joins
    const queryBuilder = this.dataSource
      .getRepository('UseCase')
      .createQueryBuilder('uc')
      .where('uc.systemId IN (:...useCaseSystemIds)', {useCaseSystemIds})
      // Join nodes and modules
      .leftJoinAndSelect('uc.nodes', 'node')
      .leftJoinAndSelect('node.spfModule', 'spfModule')
      .leftJoinAndSelect('spfModule.container', 'container')
      .leftJoinAndSelect('spfModule.subgraph', 'subgraph')
      .leftJoinAndSelect('spfModule.definition', 'moduleDefinition')
      // Join data ports
      .leftJoinAndSelect('node.dataPorts', 'dataPort')
      // Join control ports and intents
      .leftJoinAndSelect('node.controlPorts', 'controlPort')
      .leftJoinAndSelect('controlPort.allocatedIntents', 'intent')
      .leftJoinAndSelect('intent.staticIntentDefinition', 'staticIntentDef')
      // Join data links
      .leftJoinAndSelect('uc.dataLinks', 'dataLink')
      // Join control links
      .leftJoinAndSelect('uc.controlLinks', 'controlLink');

    const useCases = await queryBuilder.getMany();

    // Extract and deduplicate components
    const moduleMap = new Map<number, ModuleReadModel>();
    const dataLinkMap = new Map<number, DataLinkReadModel>();
    const controlLinkMap = new Map<number, ControlLinkReadModel>();

    for (const useCase of useCases) {
      // Process modules (nodes with spfModule)
      if (useCase.nodes) {
        for (const node of useCase.nodes) {
          if (node.spfModule && !moduleMap.has(node.systemId)) {
            const moduleReadModel =
              UseCaseQueryMappers.mapNodeToModuleReadModel(node);
            moduleMap.set(node.systemId, moduleReadModel);
          }
        }
      }

      // Process data links
      if (useCase.dataLinks) {
        for (const dataLink of useCase.dataLinks) {
          if (!dataLinkMap.has(dataLink.systemId)) {
            const dataLinkReadModel =
              UseCaseQueryMappers.mapToDataLinkReadModel(dataLink);
            dataLinkMap.set(dataLink.systemId, dataLinkReadModel);
          }
        }
      }

      // Process control links
      if (useCase.controlLinks) {
        for (const controlLink of useCase.controlLinks) {
          if (!controlLinkMap.has(controlLink.systemId)) {
            const controlLinkReadModel =
              UseCaseQueryMappers.mapToControlLinkReadModel(controlLink);
            controlLinkMap.set(controlLink.systemId, controlLinkReadModel);
          }
        }
      }
    }

    return new UseCaseComponentsReadModel(
      Array.from(moduleMap.values()),
      Array.from(dataLinkMap.values()),
      Array.from(controlLinkMap.values()),
    );
  }

  private mapToReadModel(useCaseRow: UseCaseRow): UseCaseReadModel {
    const gkv: KeyVectorReadModel[] = [];

    if (useCaseRow.keyVector?.values) {
      for (const value of useCaseRow.keyVector.values) {
        gkv.push(UseCaseQueryMappers.mapValueToKeyVector(value));
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
