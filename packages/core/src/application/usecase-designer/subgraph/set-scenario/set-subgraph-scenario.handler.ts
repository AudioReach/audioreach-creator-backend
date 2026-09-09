/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {InvalidInputException} from '../../../../shared/exceptions/invalid-input.exception.js';
import {InvalidOperationException} from '../../../../shared/exceptions/invalid-operation.exception.js';
import {DomainRuleViolationException} from '../../../../shared/exceptions/domain-rule-violation.exception.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import {
  serializeDefaultParameterData,
  serializeParameterData,
} from '../../shared/serialize-elements.js';
import type {ElementData} from '../../../../domain/entities/definitions/common/types/element-data.js';
import {BinaryDataReader} from '../../shared/utils/binary-data-reader.js';
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
import type {
  SubgraphRepository,
  SubgraphWithProperties,
} from '../../../ports/persistence/repositories/subgraph/subgraph.repository.js';
import type {
  ModuleRepository,
  SpfModuleBase,
} from '../../../ports/persistence/repositories/module/module.repository.js';

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
    const subgraphRepository = this.uow.getSubgraphRepository();

    const subgraph = await subgraphRepository.getAggregate(
      command.subgraphSystemId,
      fileSystemId,
    );
    if (!subgraph) {
      throw new ResourceNotFoundException(
        `Subgraph ${command.subgraphSystemId} not found`,
      );
    }

    const allDefs =
      await subgraphRepository.getPropertyDefinitions(fileSystemId);
    const {scenarioDef, currentScenario, requestedScenario} =
      this.resolveScenarioContext(command, subgraph, allDefs);

    if (currentScenario === requestedScenario) {
      return {
        groupId,
        propertiesAdded: [],
        propertiesRemoved: [],
        moduleCkvsAdded: [],
        moduleCkvsDeleted: [],
      };
    }

    const serialized = serializeParameterData(
      {
        systemId: scenarioDef.systemId,
        elementsStructure: scenarioDef.elementsStructure,
      },
      command.elements as unknown as ElementData[],
    );
    if (!serialized.ok) {
      throw new InvalidInputException(serialized.error);
    }
    const serializedScenario = serialized.value;

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
        subgraphRepository,
      );
    }

    // Pre-fetch modules before transaction — reads must not be inside the write transaction
    const moduleRepository = this.uow.getModuleRepository();
    const modules =
      isAudioToVoice || isVoiceToAudio
        ? await moduleRepository.getModulesBySubgraphId(
            command.subgraphSystemId,
            fileSystemId,
          )
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
          subgraphRepository,
          moduleRepository,
        );
      } else if (isVoiceToAudio) {
        await this.voiceToAudioCascade(
          command.subgraphSystemId,
          fileSystemId,
          subgraph,
          allDefs,
          modules,
          log,
          subgraphRepository,
          moduleRepository,
        );
      }

      await subgraphRepository.setPropertyData(
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

    return {
      scenarioDef,
      currentScenario,
      requestedScenario,
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
    subgraphRepository: SubgraphRepository,
    moduleRepository: ModuleRepository,
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
      const newId = await subgraphRepository.addProperty(
        subgraphSystemId,
        def.systemId,
        payload,
      );
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
        await subgraphRepository.removeProperty(
          subgraphSystemId,
          clockProp.systemId,
        );
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
        const vsidPayload = new Uint8Array(8);
        new DataView(vsidPayload.buffer).setUint32(0, optimalVsid, true);
        await subgraphRepository.setPropertyData(
          subgraphSystemId,
          vsidDef.systemId,
          vsidPayload,
        );
      }
    }

    await this.wipeModuleCalData(modules, fileSystemId, moduleRepository, log);

    const vcpmDefinitionRepository = this.uow.getVcpmDefinitionRepository();
    const vcpmDefs =
      await vcpmDefinitionRepository.getAllVcpmModuleDefinitions(fileSystemId);
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
    await vcpmDefinitionRepository.addVcpmCfgDefaultData(
      subgraphSystemId,
      defaults,
    );
  }

  private async voiceToAudioCascade(
    subgraphSystemId: number,
    fileSystemId: number,
    subgraph: SubgraphWithProperties,
    allDefs: SubgraphPropertyDefinition[],
    modules: SpfModuleBase[],
    log: MutationLog,
    subgraphRepository: SubgraphRepository,
    moduleRepository: ModuleRepository,
  ): Promise<void> {
    await this.wipeModuleCalData(modules, fileSystemId, moduleRepository, log);

    const voiceDefs = allDefs.filter(d => d.isVoice);
    for (const def of voiceDefs) {
      const voiceProp = subgraph.properties.find(
        p => p.propertySystemId === def.systemId,
      );
      if (!voiceProp) continue;
      await subgraphRepository.removeProperty(
        subgraphSystemId,
        voiceProp.systemId,
      );
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
      const newId = await subgraphRepository.addProperty(
        subgraphSystemId,
        clockScaleDef.systemId,
        payload,
      );
      log.propertiesAdded.push({
        systemId: String(newId),
        naturalId: clockScaleDef.naturalId,
        propertyName: clockScaleDef.name,
      });
    }

    await subgraphRepository.removeAllVcpmCfgData(subgraphSystemId);
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
    moduleRepository: ModuleRepository,
    _log: MutationLog,
  ): Promise<void> {
    await Promise.all(
      modules.map(async mod => {
        await moduleRepository.wipeAllCkvData(mod.systemId, fileSystemId);
        await moduleRepository.wipeAllTkvData(mod.systemId, fileSystemId);
      }),
    );
  }

  private async getOptimalVsid(
    subgraphSystemId: number,
    fileSystemId: number,
    allDefs: SubgraphPropertyDefinition[],
    subgraphRepository: SubgraphRepository,
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
      subgraphRepository,
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
    subgraphRepository: SubgraphRepository,
  ): Promise<Set<number>> {
    // Pass 1: BFS using only getSubgraphIdsInSameUsecases
    const reachableIds = await this.bfsReachableIds(
      startSubgraphId,
      fileSystemId,
      subgraphRepository,
    );
    reachableIds.delete(startSubgraphId); // exclude self — we only want linked Voice subgraphs

    if (reachableIds.size === 0) return new Set();

    // Pass 2: batch-fetch properties in 2 queries
    const subgraphMap = await subgraphRepository.getAggregates(
      [...reachableIds],
      fileSystemId,
    );

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
    subgraphRepository: SubgraphRepository,
  ): Promise<Set<number>> {
    const visited = new Set<number>([startId]);
    let frontier = [startId];

    while (frontier.length > 0) {
      const linked =
        await subgraphRepository.getSubgraphIdsInSameUsecasesForMany(
          frontier,
          fileSystemId,
        );
      frontier = linked.filter(id => !visited.has(id));
      for (const id of frontier) visited.add(id);
    }
    return visited;
  }
}
