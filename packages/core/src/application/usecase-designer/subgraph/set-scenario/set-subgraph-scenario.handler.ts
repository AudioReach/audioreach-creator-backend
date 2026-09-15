/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {InvalidOperationException} from '../../../../shared/exceptions/invalid-operation.exception.js';
import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import {
  serializeDefaultParameterData,
  serializeParameterData,
} from '../../shared/serialize-elements.js';
import type {ElementData as ElementCalData} from '../../../../domain/entities/definitions/common/types/element-data.js';
import {BinaryDataReader} from '../../shared/utils/binary-data-reader.js';
import {encodeVsidPayload} from '../../../../domain/services/subgraph-property/subgraph-property-payload-codec.js';
import {
  SUB_GRAPH_PROP_ID_SCENARIO_ID,
  SUB_GRAPH_PROP_ID_VSID,
  SUB_GRAPH_PROP_CLOCK_SCALE_FACTOR,
  SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL,
} from '../../../../domain/entities/definitions/subgraph/subgraph-ids.js';
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {SetSubgraphScenarioCommand} from './set-subgraph-scenario.command.js';
import type {ScenarioChangeDto} from '../dto/subgraph-write-result-types.js';
import type {SubgraphPropertyDefinition} from '../../../../domain/entities/definitions/subgraph/subgraph-property-definitions.js';
import type {SubgraphWithProperties} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {SpfModuleBase} from '../../../ports/persistence/repositories/module/module.repository.js';

type MutationLog = Pick<
  ScenarioChangeDto,
  | 'propertiesAdded'
  | 'propertiesRemoved'
  | 'moduleCkvsAdded'
  | 'moduleCkvsDeleted'
>;

export class SetSubgraphScenarioHandler implements CommandHandler<
  SetSubgraphScenarioCommand,
  ScenarioChangeDto
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    command: SetSubgraphScenarioCommand,
  ): Promise<ScenarioChangeDto> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const repository = this.uow.getSubgraphRepository();

    const subgraph = await repository.getAggregate(
      command.subgraphSystemId,
      fileSystemId,
    );
    if (!subgraph) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }

    const allDefs = await repository.getPropertyDefinitions(fileSystemId);
    const {
      scenarioDef,
      currentScenario,
      requestedScenario,
      serializedScenario,
    } = this.resolveScenarioContext(command, subgraph, allDefs);

    if (currentScenario === requestedScenario) {
      return {
        groupId,
        propertiesAdded: [],
        propertiesRemoved: [],
        moduleCkvsAdded: [],
        moduleCkvsDeleted: [],
      };
    }

    const isAudioToVoice =
      currentScenario !== SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL &&
      requestedScenario === SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL;
    const isVoiceToAudio =
      currentScenario === SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL &&
      requestedScenario !== SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL;

    let optimalVsid: number | undefined;
    if (isAudioToVoice) {
      optimalVsid = await this.getOptimalVsid(
        command.subgraphSystemId,
        fileSystemId,
        allDefs,
      );
    }

    // Pre-fetch modules before transaction — reads must not be inside the write transaction
    const modules =
      isAudioToVoice || isVoiceToAudio
        ? await this.uow
            .getModuleRepository()
            .getModulesBySubgraphId(command.subgraphSystemId, fileSystemId)
        : [];

    const log: MutationLog = {
      propertiesAdded: [],
      propertiesRemoved: [],
      moduleCkvsAdded: [],
      moduleCkvsDeleted: [],
    };

    await this.uow.startTransaction();
    try {
      if (isAudioToVoice) {
        await this.audioToVoiceCascade(
          command.subgraphSystemId,
          fileSystemId,
          subgraph,
          allDefs,
          optimalVsid,
          modules,
          log,
        );
      } else if (isVoiceToAudio) {
        await this.voiceToAudioCascade(
          command.subgraphSystemId,
          fileSystemId,
          subgraph,
          allDefs,
          modules,
          log,
        );
      }

      await repository.setPropertyData(
        command.subgraphSystemId,
        scenarioDef.systemId,
        serializedScenario,
      );

      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }

    return {groupId, ...log};
  }

  private resolveScenarioContext(
    command: SetSubgraphScenarioCommand,
    subgraph: SubgraphWithProperties,
    definitions: SubgraphPropertyDefinition[],
  ) {
    const scenarioDef = definitions.find(
      definition => definition.naturalId === SUB_GRAPH_PROP_ID_SCENARIO_ID,
    );
    if (!scenarioDef) {
      throw new ResourceNotFoundException(
        'Scenario property definition not found',
      );
    }

    const scenarioProp = subgraph.properties.find(
      p => p.propertySystemId === scenarioDef.systemId,
    );
    const currentScenario = scenarioProp?.payload
      ? new BinaryDataReader(scenarioProp.payload).readUInt32()
      : undefined;

    const requestedScenario = Number(command.elements[0]?.value);

    const serialized = serializeParameterData(
      {
        systemId: scenarioDef.systemId,
        isReadOnly: false,
        elementsStructure: scenarioDef.elementsStructure,
      },
      command.elements as unknown as ElementCalData[],
    );
    if (!serialized.ok) {
      throw new InvalidOperationException(serialized.error);
    }
    return {
      scenarioDef,
      currentScenario,
      requestedScenario,
      serializedScenario: serialized.value,
    };
  }

  private async audioToVoiceCascade(
    subgraphSystemId: number,
    fileSystemId: number,
    subgraph: SubgraphWithProperties,
    allDefs: SubgraphPropertyDefinition[],
    optimalVsid: number | undefined,
    modules: SpfModuleBase[],
    log: MutationLog,
  ): Promise<void> {
    const voiceDefs = allDefs.filter(d => d.isVoice);
    const clockScaleDef = allDefs.find(
      d => d.naturalId === SUB_GRAPH_PROP_CLOCK_SCALE_FACTOR,
    );
    const existingPropIds = new Set(
      subgraph.properties.map(p => p.propertySystemId),
    );

    for (const def of voiceDefs) {
      if (existingPropIds.has(def.systemId)) continue;
      const payload = this.serializeDefaultPropertyData(def);
      const newId = await this.uow
        .getSubgraphRepository()
        .addProperty(subgraphSystemId, def.systemId, payload);
      log.propertiesAdded.push({
        systemId: String(newId),
        naturalId: def.naturalId,
        propertyName: def.name,
      });
    }

    if (clockScaleDef) {
      const clockProp = subgraph.properties.find(
        p => p.propertySystemId === clockScaleDef.systemId,
      );
      if (clockProp) {
        await this.uow
          .getSubgraphRepository()
          .removeProperty(subgraphSystemId, clockProp.systemId);
        log.propertiesRemoved.push({
          systemId: String(clockProp.systemId),
          naturalId: clockScaleDef.naturalId,
          propertyName: clockScaleDef.name,
        });
      }
    }

    if (optimalVsid !== undefined) {
      const vsidDef = allDefs.find(
        definition => definition.naturalId === SUB_GRAPH_PROP_ID_VSID,
      );
      if (vsidDef) {
        await this.uow
          .getSubgraphRepository()
          .setPropertyData(
            subgraphSystemId,
            vsidDef.systemId,
            encodeVsidPayload(optimalVsid),
          );
      }
    }

    await this.wipeModuleCalData(modules, fileSystemId, log);

    const vcpmDefs = await this.uow
      .getVcpmDefinitionRepository()
      .getAllVcpmModuleDefinitions(fileSystemId);
    const defaults = vcpmDefs.map(definition => ({
      definitionSystemId: definition.systemId,
      parameters: definition.parameters.map(parameter => {
        const serialized = serializeDefaultParameterData(parameter);
        if (!serialized.ok) {
          throw new InvalidOperationException(serialized.error);
        }
        return {
          parameterSystemId: parameter.systemId,
          payload: serialized.value,
        };
      }),
    }));
    await this.uow
      .getVcpmDefinitionRepository()
      .addVcpmCfgDefaultData(subgraphSystemId, defaults);
  }

  private async voiceToAudioCascade(
    subgraphSystemId: number,
    fileSystemId: number,
    subgraph: SubgraphWithProperties,
    allDefs: SubgraphPropertyDefinition[],
    modules: SpfModuleBase[],
    log: MutationLog,
  ): Promise<void> {
    await this.wipeModuleCalData(modules, fileSystemId, log);

    const voiceDefs = allDefs.filter(d => d.isVoice);
    for (const def of voiceDefs) {
      const voiceProp = subgraph.properties.find(
        p => p.propertySystemId === def.systemId,
      );
      if (!voiceProp) continue;
      await this.uow
        .getSubgraphRepository()
        .removeProperty(subgraphSystemId, voiceProp.systemId);
      log.propertiesRemoved.push({
        systemId: String(voiceProp.systemId),
        naturalId: def.naturalId,
        propertyName: def.name,
      });
    }

    const clockScaleDef = allDefs.find(
      d => d.naturalId === SUB_GRAPH_PROP_CLOCK_SCALE_FACTOR,
    );
    if (clockScaleDef) {
      const payload = this.serializeDefaultPropertyData(clockScaleDef);
      const newId = await this.uow
        .getSubgraphRepository()
        .addProperty(subgraphSystemId, clockScaleDef.systemId, payload);
      log.propertiesAdded.push({
        systemId: String(newId),
        naturalId: clockScaleDef.naturalId,
        propertyName: clockScaleDef.name,
      });
    }

    await this.uow
      .getSubgraphRepository()
      .removeAllVcpmCfgData(subgraphSystemId);
  }

  private serializeDefaultPropertyData(
    definition: SubgraphPropertyDefinition,
  ): Uint8Array {
    const serialized = serializeDefaultParameterData(definition);
    if (!serialized.ok) {
      throw new InvalidOperationException(serialized.error);
    }
    return serialized.value;
  }

  private async wipeModuleCalData(
    modules: SpfModuleBase[],
    fileSystemId: number,
    _log: MutationLog,
  ): Promise<void> {
    await Promise.all(
      modules.map(mod =>
        // TODO(subgraph-write-review): This compatibility call currently
        // performs only TKV cleanup. CKV deletion and zero-CKV reset are
        // intentionally disabled until core creates and passes a reset plan.
        this.uow
          .getModuleRepository()
          .wipeCalData(mod.systemId, fileSystemId)
          .then(wiped => ({mod, wiped})),
      ),
    );
    /*
     * TODO(subgraph-write-review): Re-enable CKV deletion and zero-CKV reset
     * reporting when core owns the CKV reset-plan creation. Both mutation-log
     * updates are intentionally deferred from this PR.
     *
     * for (const {mod, wiped} of results) {
     *   log.moduleCkvsDeleted.push(
     *     ...wiped.ckvsDeleted.map(c => ({
     *       moduleSystemId: String(mod.systemId),
     *       ckvSystemId: String(c),
     *     })),
     *   );
     *   log.moduleCkvsAdded.push(
     *     ...wiped.zeroCkvsAdded.map(c => ({
     *       moduleSystemId: String(mod.systemId),
     *       ckvSystemId: String(c),
     *     })),
     *   );
     * }
     */
  }

  private async getOptimalVsid(
    subgraphSystemId: number,
    fileSystemId: number,
    allDefs: SubgraphPropertyDefinition[],
  ): Promise<number> {
    const vsidDef = allDefs.find(d => d.naturalId === SUB_GRAPH_PROP_ID_VSID);
    if (!vsidDef)
      throw new ResourceNotFoundException('VSID property definition not found');

    const scenarioDefSystemId = allDefs.find(
      d => d.naturalId === SUB_GRAPH_PROP_ID_SCENARIO_ID,
    )?.systemId;
    const foundVsids = await this.bfsCollectVoiceVsids(
      subgraphSystemId,
      fileSystemId,
      vsidDef.systemId,
      scenarioDefSystemId,
    );

    if (foundVsids.size === 0) {
      const serialized = serializeDefaultParameterData(vsidDef);
      if (!serialized.ok) {
        throw new InvalidOperationException(
          `Unable to generate default VSID payload: ${serialized.error}`,
        );
      }

      try {
        return new BinaryDataReader(serialized.value).readUInt32();
      } catch {
        throw new InvalidOperationException(
          'Unable to read generated default VSID payload',
        );
      }
    }
    if (foundVsids.size === 1) {
      return [...foundVsids][0];
    }
    throw new DomainRuleViolationException([
      {
        code: 'VSID_CONFLICT',
        message: `Conflicting VSIDs found across linked usecases: ${[...foundVsids].join(', ')}`,
        severity: IssueSeverity.Error,
      },
    ]);
  }

  /**
   * Subgraphs form a graph through their shared usecases. Traverse that
   * graph to find linked voice subgraphs whose VSID can be reused when the
   * current subgraph changes from an audio scenario to voice-call mode.
   */
  private async bfsCollectVoiceVsids(
    startSubgraphId: number,
    fileSystemId: number,
    vsidDefSystemId: number,
    scenarioDefSystemId: number | undefined,
  ): Promise<Set<number>> {
    // Pass 1: BFS using only getSubgraphIdsInSameUsecases
    const reachableIds = await this.bfsReachableIds(
      startSubgraphId,
      fileSystemId,
    );
    reachableIds.delete(startSubgraphId); // exclude self — we only want linked Voice subgraphs

    if (reachableIds.size === 0) return new Set();

    // Pass 2: batch-fetch properties in 2 queries
    const subgraphMap = await this.uow
      .getSubgraphRepository()
      .getAggregates([...reachableIds], fileSystemId);

    // Pass 3: collect VSIDs from Voice subgraphs only
    const foundVsids = new Set<number>();
    for (const [, sg] of subgraphMap) {
      if (scenarioDefSystemId !== undefined) {
        const scenarioProp = sg.properties.find(
          p => p.propertySystemId === scenarioDefSystemId,
        );
        const scenarioVal = scenarioProp?.payload
          ? new BinaryDataReader(scenarioProp.payload).readUInt32()
          : undefined;
        if (scenarioVal !== SUB_GRAPH_PROP_ID_SCENARIO_VALUE_VOICE_CALL)
          continue;
      }
      const vsidProp = sg.properties.find(
        p => p.propertySystemId === vsidDefSystemId,
      );
      if (vsidProp?.payload) {
        foundVsids.add(new BinaryDataReader(vsidProp.payload).readUInt32());
      }
    }
    return foundVsids;
  }

  /**
   * Expand the graph one level at a time. `visited` prevents revisiting a
   * subgraph when usecases create cycles and guarantees termination.
   * Repository traversal keeps the handler independent of link tables.
   */
  private async bfsReachableIds(
    startId: number,
    fileSystemId: number,
  ): Promise<Set<number>> {
    const visited = new Set<number>([startId]);
    let frontier = [startId];

    while (frontier.length > 0) {
      const linked = await this.uow
        .getSubgraphRepository()
        .getSubgraphIdsInSameUsecasesForMany(frontier, fileSystemId);
      frontier = linked.filter(id => !visited.has(id));
      for (const id of frontier) visited.add(id);
    }
    return visited;
  }
}
