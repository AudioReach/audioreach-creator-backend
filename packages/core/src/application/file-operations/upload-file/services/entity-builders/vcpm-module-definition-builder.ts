/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Logger} from '../../../../../shared/types/logger.interface.js';
import type {IdGenerationPort} from '../../../../ports/id-generation/id-generation.port.js';
import type {ForeignKeyMapper} from '../foreign-key-mapper.js';
import {
  asNaturalId,
  asSystemId,
} from '../../../../../shared/types/branded-ids.js';
import {VcpmModuleDefinition} from '../../../../../domain/entities/definitions/vcpm-module/vcpm-module-definition.js';
import {ParamDefinition} from '../../../../../domain/entities/definitions/common/entities/param-definition.js';
import {
  PARAM_TYPE,
  type ParamType,
} from '../../../../../domain/entities/definitions/common/types/param-type.js';
import {
  TOOL_POLICY,
  type ToolPolicy,
} from '../../../../../domain/entities/definitions/common/types/tool-policy-type.js';
import type {AwspVcpmModuleDefinition} from '../../../shared/awsp-serializers/v1/definitions/index.js';
import type {AwspPidType} from '../../../shared/awsp-serializers/v1/definitions/module-definition/type/pid-type.js';
import type {AwspToolPolicy} from '../../../shared/awsp-serializers/v1/definitions/module-definition/type/tool-policy.js';
import type {
  BuildResult,
  EntityBuildIssue,
} from '../../types/issue-collection.js';
import {ENTITY_TYPES, ISSUE_SEVERITY} from '../../types/issue-collection.js';
import {ERROR_CODES} from '../../../../../shared/errors/error-codes.js';
import {BinaryUtils} from '../../../../../shared/utilities/binary-utils.js';

export class VcpmModuleDefinitionBuilder {
  private static readonly PID_TYPE_MAPPING: Record<AwspPidType, ParamType> = {
    None: PARAM_TYPE.None,
    Shared: PARAM_TYPE.Shared,
    GlobalShared: PARAM_TYPE.GlobalShared,
  };

  private static readonly TOOL_POLICY_MAPPING: Record<
    AwspToolPolicy,
    ToolPolicy
  > = {
    Calibration: TOOL_POLICY.Calibration,
    RTC: TOOL_POLICY.Rtc,
    RTM: TOOL_POLICY.Rtm,
    RTCReadonly: TOOL_POLICY.RtcReadonly,
  };
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  async buildVcpmModuleDefinitions(
    awspModuleDefinitions: AwspVcpmModuleDefinition[],
    fileSystemId: number,
  ): Promise<BuildResult<VcpmModuleDefinition>> {
    if (!awspModuleDefinitions || awspModuleDefinitions.length === 0) {
      return {
        entities: [],
        issues: [],
        successCount: 0,
        errorCount: 0,
        warningCount: 0,
      };
    }

    this.logger?.logDebug({
      msg: `Building ${awspModuleDefinitions.length} VCPM module definitions`,
      action: 'vcpm_module_definition_building_start',
      component: 'VcpmModuleDefinitionBuilder',
      tag: 'vcpm-module-definitions',
      timestamp: new Date(),
    });

    const entities: VcpmModuleDefinition[] = [];
    const issues: EntityBuildIssue[] = [];

    for (const awspDef of awspModuleDefinitions) {
      try {
        const definition = await this.createModuleDefinition(
          awspDef,
          fileSystemId,
        );
        await this.buildParameterDefinitions(
          awspDef,
          definition,
          fileSystemId,
          issues,
        );
        entities.push(definition);
      } catch (error) {
        issues.push({
          severity: ISSUE_SEVERITY.ERROR,
          code: ERROR_CODES.INVALID_ENTITY_DATA,
          message: `Failed to build VCPM module definition ${BinaryUtils.toHexString(awspDef.id)}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          entityType: ENTITY_TYPES.VCPM_MODULE_DEFINITION,
        });
      }
    }

    this.logger?.logInfo({
      msg: `Successfully built ${entities.length} VCPM module definitions with system IDs assigned, ${issues.length} failures`,
      action: 'vcpm_module_definition_building_complete',
      component: 'VcpmModuleDefinitionBuilder',
      tag: 'vcpm-module-definitions',
      timestamp: new Date(),
    });

    return {
      entities,
      issues,
      successCount: entities.length,
      errorCount: issues.filter(i => i.severity === ISSUE_SEVERITY.ERROR)
        .length,
      warningCount: issues.filter(i => i.severity === ISSUE_SEVERITY.WARNING)
        .length,
    };
  }

  private async createModuleDefinition(
    awspDef: AwspVcpmModuleDefinition,
    fileSystemId: number,
  ): Promise<VcpmModuleDefinition> {
    const definition = new VcpmModuleDefinition({
      systemId: 0,
      moduleDefinitionId: awspDef.id,
      fileSystemId,
      name: awspDef.name,
      displayName: awspDef.displayName ?? awspDef.name,
      description: awspDef.description,
      parameters: [],
    });

    definition.systemId = await this.idGenerator.getNextId(fileSystemId);

    this.foreignKeyMapper.addVcpmModuleDefinitionMapping(
      asNaturalId(definition.moduleDefinitionId),
      asSystemId(definition.systemId),
    );

    return definition;
  }

  private async buildParameterDefinitions(
    awspDef: AwspVcpmModuleDefinition,
    definition: VcpmModuleDefinition,
    fileSystemId: number,
    issues: EntityBuildIssue[],
  ): Promise<void> {
    if (!awspDef.paramDefinitions || awspDef.paramDefinitions.length === 0) {
      return;
    }

    for (const awspParam of awspDef.paramDefinitions) {
      try {
        const paramSystemId = await this.idGenerator.getNextId(fileSystemId);

        const param = new ParamDefinition({
          systemId: paramSystemId,
          paramId: awspParam.id,
          name: awspParam.name,
          description: awspParam.description,
          maxSize: awspParam.maxSize ?? 0,
          toolPolicies: (awspParam.toolPolicies ?? []).map(
            p => VcpmModuleDefinitionBuilder.TOOL_POLICY_MAPPING[p],
          ),
          type: VcpmModuleDefinitionBuilder.PID_TYPE_MAPPING[awspParam.pidType],
          elementsStructure: JSON.stringify(awspParam.elements),
          isPersistent: false,
          isReadOnly: awspParam.isReadOnly ?? false,
        });

        definition.parameters.push(param);

        this.foreignKeyMapper.addVcpmParamDefinitionMapping(
          asSystemId(definition.systemId),
          asNaturalId(param.paramId),
          asSystemId(param.systemId),
        );
      } catch (error) {
        issues.push({
          severity: ISSUE_SEVERITY.ERROR,
          code: ERROR_CODES.INVALID_ENTITY_DATA,
          message: `Failed to build parameter ${BinaryUtils.toHexString(awspParam.id)} for VCPM module ${BinaryUtils.toHexString(awspDef.id)}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          entityType: ENTITY_TYPES.VCPM_MODULE_DEFINITION,
        });
      }
    }
  }
}
