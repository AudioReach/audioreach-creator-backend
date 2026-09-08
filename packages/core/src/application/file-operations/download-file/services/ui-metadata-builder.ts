/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  UiMetadata,
  UiUsecase,
  UiSubgraph,
  UiModule,
  UiCalViewUiPersistence,
  UiPayloadMapEntry,
  UiSubsystem,
  UiSubsystemChild,
  UiDataLink,
  UiSwitch,
  UiSwitchDataLink,
  UiSwitchControlLink,
  UiSwitchModuleInfo,
  UiSwitchConnection,
  UiSwitchDataPortsInfo,
  UiSwitchControlPortsInfo,
} from '../../shared/awsp-serializers/v1/ui-metadata/index.js';
import type {
  UiUsecaseDownloadModel,
  UiSubgraphDownloadModel,
  UiModuleDownloadModel,
  UiCkvDownloadModel,
  UiSubsystemDownloadModel,
  UiDataLinkDownloadModel,
  UiFileExtrasDownloadModel,
  DownloadEntities,
  KeyDefinitionDownloadModel,
} from '../../../ports/persistence/query-services/bulk-read/bulk-read-query-service.js';
import type {
  PersistedSwitch,
  PersistedSwitchMetaLink,
} from '../../shared/awsp-serializers/v1/ui-metadata/index.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {
  USECASE_TYPE,
  type UsecaseType,
} from '../../../../domain/entities/usecase-data/usecase/usecase-type.js';
import {
  AWSP_USECASE_TYPE,
  type AwspUsecaseType,
} from '../../shared/awsp-serializers/v1/ui-metadata/ui-metadata.schema.js';
import {v4 as uuidv4} from 'uuid';

/**
 * Reconstructs UiMetadata from DownloadEntities for .awsp file generation.
 */
export class UiMetadataBuilder {
  constructor(private readonly logger?: Logger) {}

  build(entities: DownloadEntities): UiMetadata {
    const {payloadMap, moduleUiPersistenceMap} = this.buildPayloadMap(
      entities.uiModules ?? [],
      entities.keyDefinitions ?? [],
    );

    const metadata = new UiMetadata();
    metadata.version = {major: 1, minor: 0};
    metadata.payloadMap = payloadMap;
    metadata.usecases = this.buildUsecases(
      entities.uiUsecases ?? [],
      entities.keyDefinitions ?? [],
    );
    metadata.subgraphs = this.buildSubgraphs(
      entities.uiSubgraphs ?? [],
      entities.keyDefinitions ?? [],
    );
    metadata.modules = this.buildModules(
      entities.uiModules ?? [],
      moduleUiPersistenceMap,
    );
    metadata.subsystems = this.buildSubsystems(entities.uiSubsystems ?? []);
    metadata.dataLinks = this.buildDataLinks(entities.uiDataLinks ?? []);
    metadata.switches = this.buildSwitches(
      entities.uiFileExtras,
      entities.uiModules ?? [],
    );
    if (entities.uiFileExtras?.uiSrsMetadataJson) {
      try {
        metadata.srsMetadata = JSON.parse(
          entities.uiFileExtras.uiSrsMetadataJson,
        ) as typeof metadata.srsMetadata;
      } catch (error) {
        this.logger?.logWarn({
          component: 'UiMetadataBuilder',
          msg: 'parseSrsMetadata',
          description: `Failed to parse uiSrsMetadataJson — srsMetadata will be omitted`,
          error: error instanceof Error ? error : new Error(String(error)),
          tag: 'download-file',
        });
      }
    }
    return metadata;
  }

  private buildPayloadMap(
    uiModules: UiModuleDownloadModel[],
    keyDefs: KeyDefinitionDownloadModel[],
  ): {
    payloadMap: UiPayloadMapEntry[];
    moduleUiPersistenceMap: Map<number, UiCalViewUiPersistence[]>;
  } {
    const payloadMap: UiPayloadMapEntry[] = [];
    const moduleUiPersistenceMap = new Map<number, UiCalViewUiPersistence[]>();
    const valueIdToKeyId = this.buildValueIdToKeyIdMap(keyDefs);

    for (const mod of uiModules) {
      const calViews = mod.ckvs.map(ckv =>
        this.buildCalView(ckv, payloadMap, valueIdToKeyId),
      );
      if (calViews.length > 0) {
        moduleUiPersistenceMap.set(mod.systemId, calViews);
      }
    }

    return {payloadMap, moduleUiPersistenceMap};
  }

  private buildValueIdToKeyIdMap(
    keyDefs: KeyDefinitionDownloadModel[],
  ): Map<number, number> {
    const map = new Map<number, number>();
    for (const kd of keyDefs) {
      for (const v of kd.values) {
        map.set(v.valueNaturalId, kd.keyNaturalId);
      }
    }
    return map;
  }

  private buildCalView(
    ckv: UiCkvDownloadModel,
    payloadMap: UiPayloadMapEntry[],
    valueIdToKeyId: Map<number, number>,
  ): UiCalViewUiPersistence {
    const calView = new UiCalViewUiPersistence();

    const payloadId = uuidv4();
    const entry = new UiPayloadMapEntry();
    entry.id = payloadId;
    if (ckv.uiPersistence === null) {
      entry.data = '';
    } else if (ckv.uiPersistence.length === 0) {
      throw new Error(
        `CKV systemId=${ckv.ckvSystemId} has a non-null but empty uiPersistence buffer`,
      );
    } else {
      entry.data = Buffer.from(ckv.uiPersistence).toString('base64');
    }
    payloadMap.push(entry);
    calView.payloadId = payloadId;

    if (ckv.valueIds.length > 0) {
      const keyIds = ckv.valueIds.map(vid => valueIdToKeyId.get(vid) ?? 0);
      calView.calKeyValue = this.buildKeyValueString(keyIds, ckv.valueIds);
    }

    return calView;
  }

  private buildUsecases(
    uiUsecases: UiUsecaseDownloadModel[],
    _keyDefs: KeyDefinitionDownloadModel[],
  ): UiUsecase[] {
    return uiUsecases.map(uc => {
      const usecase = new UiUsecase();
      usecase.keyValue = this.buildKeyValueString(uc.keyIds, uc.valueIds);
      usecase.aliasId = uc.aliasNaturalId
        ? `0x${uc.aliasNaturalId.toString(16).toUpperCase().padStart(8, '0')}`
        : undefined;
      usecase.aliasName = uc.aliasName || undefined;
      usecase.categoryName = uc.categoryName;
      usecase.type = mapUsecaseTypeToAwspType(uc.type);
      usecase.orderedKeys = uc.orderedKeys
        ? (JSON.parse(uc.orderedKeys) as Array<{id: number}>)
        : [];
      usecase.reviewedAt = uc.reviewedAt ?? undefined;
      return usecase;
    });
  }

  private buildSubgraphs(
    uiSubgraphs: UiSubgraphDownloadModel[],
    _keyDefs: KeyDefinitionDownloadModel[],
  ): UiSubgraph[] {
    return uiSubgraphs.map(sg => {
      const subgraph = new UiSubgraph();
      subgraph.id = sg.subgraphNaturalId;
      subgraph.name = sg.name;
      subgraph.reviewedAt = sg.reviewedAt ?? undefined;
      // supportedKeyValues: reconstruct from sgkvValueIds grouped by SGKV
      // For now emit empty — SGKV grouping requires knowing which valueIds belong to which SGKV entry
      // This is a known limitation: we store flat valueIds, not per-SGKV groups
      subgraph.supportedKeyValues = [];
      return subgraph;
    });
  }

  private buildModules(
    uiModules: UiModuleDownloadModel[],
    moduleUiPersistenceMap: Map<number, UiCalViewUiPersistence[]>,
  ): UiModule[] {
    return uiModules.map(mod => {
      const module = new UiModule();
      module.definitionId = mod.definitionNaturalId;
      module.instanceId = mod.instanceNaturalId;
      module.aliasName = mod.aliasName || undefined;
      module.reviewedAt = mod.reviewedAt ?? undefined;
      module.calViewUiPersistences =
        moduleUiPersistenceMap.get(mod.systemId) ?? [];
      return module;
    });
  }

  private buildSubsystems(
    uiSubsystems: UiSubsystemDownloadModel[],
  ): UiSubsystem[] {
    return uiSubsystems.map(ss => {
      const subsystem = new UiSubsystem();
      subsystem.id = ss.subsystemNaturalId;
      subsystem.name = ss.name;
      subsystem.filteredGraphKeys = undefined;
      subsystem.children = ss.children.map(c => {
        const child = new UiSubsystemChild();
        child.id = c.naturalId;
        child.type = c.type;
        return child;
      });
      return subsystem;
    });
  }

  private buildDataLinks(uiDataLinks: UiDataLinkDownloadModel[]): UiDataLink[] {
    return uiDataLinks.map(dl => {
      const link = new UiDataLink();
      link.isEcLink = Boolean(dl.isEc ?? false);
      link.sourceId = dl.sourceInstanceNaturalId;
      link.sourcePortId = dl.sourcePortNaturalId;
      link.destinationId = dl.destinationInstanceNaturalId;
      link.destinationPortId = dl.destinationPortNaturalId;
      return link;
    });
  }

  private buildSwitches(
    fileExtras: UiFileExtrasDownloadModel | undefined,
    uiModules: UiModuleDownloadModel[],
  ): UiSwitch[] {
    const raw = fileExtras?.uiSwitchesJson;
    if (!raw) return [];

    let storedSwitches: PersistedSwitch[];
    try {
      storedSwitches = JSON.parse(raw) as PersistedSwitch[];
    } catch {
      return [];
    }

    // Build live set from current DB state
    const liveSystemIds = new Set(uiModules.map(m => m.systemId));
    const systemIdToInstanceId = new Map(
      uiModules.map(m => [m.systemId, m.instanceNaturalId]),
    );

    return storedSwitches
      .map(sw => {
        const liveModules = sw.modules.filter(m =>
          liveSystemIds.has(m.systemId),
        );
        if (liveModules.length === 0) return null;

        const liveDataLinks = sw.dataLinks.filter(
          dl =>
            liveSystemIds.has(dl.sourceSystemId) &&
            liveSystemIds.has(dl.destSystemId),
        );
        const liveControlLinks = sw.controlLinks.filter(
          cl =>
            liveSystemIds.has(cl.sourceSystemId) &&
            liveSystemIds.has(cl.destSystemId),
        );

        const remapped: PersistedSwitch = {
          ...sw,
          modules: liveModules.map(m => ({
            systemId: systemIdToInstanceId.get(m.systemId) ?? m.systemId,
          })),
          dataLinks: liveDataLinks.map(dl => ({
            ...dl,
            sourceSystemId:
              systemIdToInstanceId.get(dl.sourceSystemId) ?? dl.sourceSystemId,
            destSystemId:
              systemIdToInstanceId.get(dl.destSystemId) ?? dl.destSystemId,
            metaLinks: (dl.metaLinks ?? []).map(
              (ml: PersistedSwitchMetaLink) => ({
                ...ml,
                sourceSystemId:
                  systemIdToInstanceId.get(ml.sourceSystemId) ??
                  ml.sourceSystemId,
                destinationSystemId:
                  systemIdToInstanceId.get(ml.destinationSystemId) ??
                  ml.destinationSystemId,
              }),
            ),
          })),
          controlLinks: liveControlLinks.map(cl => ({
            ...cl,
            sourceSystemId:
              systemIdToInstanceId.get(cl.sourceSystemId) ?? cl.sourceSystemId,
            destSystemId:
              systemIdToInstanceId.get(cl.destSystemId) ?? cl.destSystemId,
            metaLinks: (cl.metaLinks ?? []).map(
              (ml: PersistedSwitchMetaLink) => ({
                ...ml,
                sourceSystemId:
                  systemIdToInstanceId.get(ml.sourceSystemId) ??
                  ml.sourceSystemId,
                destinationSystemId:
                  systemIdToInstanceId.get(ml.destinationSystemId) ??
                  ml.destinationSystemId,
              }),
            ),
          })),
        };
        return this.rebuildSwitch(remapped);
      })
      .filter((sw): sw is UiSwitch => sw !== null);
  }

  private rebuildSwitch(sw: PersistedSwitch): UiSwitch | null {
    const instance = new UiSwitch();
    instance.id = sw.naturalId;
    instance.parentSubgraphId = sw.parentSubgraphNaturalId;
    instance.parentSubsystemId = sw.parentSubsystemNaturalId;
    instance.type = sw.type;
    instance.inputPort = sw.inputPort
      ? Object.assign(new UiSwitchDataPortsInfo(), sw.inputPort)
      : undefined;
    instance.outputPort = sw.outputPort
      ? Object.assign(new UiSwitchDataPortsInfo(), sw.outputPort)
      : undefined;
    instance.controlPort = sw.controlPort
      ? Object.assign(new UiSwitchControlPortsInfo(), sw.controlPort)
      : undefined;
    instance.dataLinks = sw.dataLinks.map(dl => {
      const link = new UiSwitchDataLink();
      link.sourceId = dl.sourceSystemId;
      link.sourcePortId = dl.sourcePortNaturalId;
      link.destinationId = dl.destSystemId;
      link.destinationPortId = dl.destinationPortNaturalId;
      link.metaLinks = (dl.metaLinks ?? []).map(
        (ml: PersistedSwitchMetaLink) => {
          const conn = new UiSwitchConnection();
          conn.sourceId = ml.sourceSystemId;
          conn.sourcePortId = ml.sourcePortNaturalId;
          conn.sourceType = ml.sourceType;
          conn.destinationId = ml.destinationSystemId;
          conn.destinationPortId = ml.destinationPortNaturalId;
          conn.destinationType = ml.destinationType;
          conn.category = ml.category;
          return conn;
        },
      );
      return link;
    });
    instance.controlLinks = sw.controlLinks.map(cl => {
      const link = new UiSwitchControlLink();
      link.sourceId = cl.sourceSystemId;
      link.sourcePortId = cl.sourcePortNaturalId;
      link.destinationId = cl.destSystemId;
      link.destinationPortId = cl.destinationPortNaturalId;
      link.metaLinks = (cl.metaLinks ?? []).map(
        (ml: PersistedSwitchMetaLink) => {
          const conn = new UiSwitchConnection();
          conn.sourceId = ml.sourceSystemId;
          conn.sourcePortId = ml.sourcePortNaturalId;
          conn.sourceType = ml.sourceType;
          conn.destinationId = ml.destinationSystemId;
          conn.destinationPortId = ml.destinationPortNaturalId;
          conn.destinationType = ml.destinationType;
          conn.category = ml.category;
          return conn;
        },
      );
      return link;
    });
    instance.modules = sw.modules.map(m => {
      const mod = new UiSwitchModuleInfo();
      mod.instanceId = m.systemId;
      return mod;
    });
    return instance;
  }

  private buildKeyValueString(keyIds: number[], valueIds: number[]): string {
    if (keyIds.length !== valueIds.length) return '';
    const parts = keyIds.map(
      (keyId, i) =>
        `0x${keyId.toString(16).toUpperCase().padStart(8, '0')}:0x${valueIds[i].toString(16).toUpperCase().padStart(8, '0')}`,
    );
    return `[${parts.join(' ')}]`;
  }
}

function mapUsecaseTypeToAwspType(
  t: UsecaseType | undefined | null,
): AwspUsecaseType {
  switch (t) {
    case USECASE_TYPE.Ec:
      return AWSP_USECASE_TYPE.Ec;
    case USECASE_TYPE.Island:
      return AWSP_USECASE_TYPE.Island;
    default:
      return AWSP_USECASE_TYPE.Linked;
  }
}
