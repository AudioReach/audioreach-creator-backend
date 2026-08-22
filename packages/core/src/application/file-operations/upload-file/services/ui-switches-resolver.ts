/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  UiSwitch,
  PersistedSwitch,
  PersistedSwitchDataLink,
  PersistedSwitchControlLink,
  PersistedSwitchModuleRef,
} from '../../shared/awsp-serializers/v1/ui-metadata/index.js';
import type {ForeignKeyMapper} from './foreign-key-mapper.js';
import {asNaturalId} from '../../../../shared/types/branded-ids.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';

/**
 * Resolves UiSwitch[] (instanceId-keyed) to a JSON string with systemId-keyed references.
 * Called after all spfModule insertions so ForeignKeyMapper has full instanceId→systemId coverage.
 */
export class UiSwitchesResolver {
  constructor(private readonly logger?: Logger) {}

  resolve(
    switches: UiSwitch[],
    fkMapper: ForeignKeyMapper,
  ): string | undefined {
    if (!switches || switches.length === 0) return undefined;

    const stored: PersistedSwitch[] = switches.map(sw => {
      const modules: PersistedSwitchModuleRef[] = sw.modules
        .map(m => {
          const systemId = fkMapper.getSpfModuleSystemId(
            asNaturalId(m.instanceId),
          );
          if (systemId === undefined) {
            this.logger?.logWarn({
              component: 'UiSwitchesResolver',
              action: 'resolveModule',
              msg: `Switch ${sw.id}: module instanceId ${m.instanceId} has no systemId mapping — dropped`,
              timestamp: new Date(),
              tag: 'ui-switches',
            });
          }
          return systemId !== undefined ? {systemId: systemId as number} : null;
        })
        .filter((m): m is PersistedSwitchModuleRef => m !== null);

      const dataLinks: PersistedSwitchDataLink[] = sw.dataLinks
        .map(dl => {
          const srcSysId = fkMapper.getSpfModuleSystemId(
            asNaturalId(dl.sourceId),
          );
          const dstSysId = fkMapper.getSpfModuleSystemId(
            asNaturalId(dl.destinationId),
          );
          if (srcSysId === undefined || dstSysId === undefined) {
            this.logger?.logWarn({
              component: 'UiSwitchesResolver',
              action: 'resolveDataLink',
              msg: `Switch ${sw.id}: dataLink ${dl.sourceId}→${dl.destinationId} has unresolved systemId — dropped`,
              timestamp: new Date(),
              tag: 'ui-switches',
            });
            return null;
          }
          return {
            sourceSystemId: srcSysId as number,
            sourcePortId: dl.sourcePortId,
            destSystemId: dstSysId as number,
            destinationPortId: dl.destinationPortId,
            metaLinks: (dl.metaLinks ?? []).flatMap(ml => {
              const mlSrcSysId = fkMapper.getSpfModuleSystemId(
                asNaturalId(ml.sourceId),
              );
              const mlDstSysId = fkMapper.getSpfModuleSystemId(
                asNaturalId(ml.destinationId),
              );
              if (mlSrcSysId === undefined || mlDstSysId === undefined)
                return [];
              return [
                {
                  sourceSystemId: mlSrcSysId as number,
                  sourcePortId: ml.sourcePortId,
                  sourceType: ml.sourceType,
                  destinationSystemId: mlDstSysId as number,
                  destinationPortId: ml.destinationPortId,
                  destinationType: ml.destinationType,
                  category: ml.category,
                },
              ];
            }),
          };
        })
        .filter((dl): dl is PersistedSwitchDataLink => dl !== null);

      const controlLinks: PersistedSwitchControlLink[] = sw.controlLinks
        .map(cl => {
          const srcSysId = fkMapper.getSpfModuleSystemId(
            asNaturalId(cl.sourceId),
          );
          const dstSysId = fkMapper.getSpfModuleSystemId(
            asNaturalId(cl.destinationId),
          );
          if (srcSysId === undefined || dstSysId === undefined) {
            this.logger?.logWarn({
              component: 'UiSwitchesResolver',
              action: 'resolveControlLink',
              msg: `Switch ${sw.id}: controlLink ${cl.sourceId}→${cl.destinationId} has unresolved systemId — dropped`,
              timestamp: new Date(),
              tag: 'ui-switches',
            });
            return null;
          }
          return {
            sourceSystemId: srcSysId as number,
            sourcePortId: cl.sourcePortId,
            destSystemId: dstSysId as number,
            destinationPortId: cl.destinationPortId,
            metaLinks: (cl.metaLinks ?? []).flatMap(ml => {
              const mlSrcSysId = fkMapper.getSpfModuleSystemId(
                asNaturalId(ml.sourceId),
              );
              const mlDstSysId = fkMapper.getSpfModuleSystemId(
                asNaturalId(ml.destinationId),
              );
              if (mlSrcSysId === undefined || mlDstSysId === undefined)
                return [];
              return [
                {
                  sourceSystemId: mlSrcSysId as number,
                  sourcePortId: ml.sourcePortId,
                  sourceType: ml.sourceType,
                  destinationSystemId: mlDstSysId as number,
                  destinationPortId: ml.destinationPortId,
                  destinationType: ml.destinationType,
                  category: ml.category,
                },
              ];
            }),
          };
        })
        .filter((cl): cl is PersistedSwitchControlLink => cl !== null);

      return {
        id: sw.id,
        parentSubgraphId: sw.parentSubgraphId,
        parentSubsystemId: sw.parentSubsystemId,
        type: sw.type,
        inputPort: sw.inputPort?.toJSON(),
        outputPort: sw.outputPort?.toJSON(),
        controlPort: sw.controlPort?.toJSON(),
        modules,
        dataLinks,
        controlLinks,
      };
    });

    return JSON.stringify(stored);
  }
}
