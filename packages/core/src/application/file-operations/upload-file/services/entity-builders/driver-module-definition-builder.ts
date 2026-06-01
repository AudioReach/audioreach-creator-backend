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
import {DriverModuleDefinition} from '../../../../../domain/entities/definitions/driver-module/driver-module-definition.js';
import {DriverModuleParameterDefinition} from '../../../../../domain/entities/definitions/driver-module/driver-module-parameter-definition.js';
import type {DriverModuleDefinition as AwspDriverModuleDefinition} from '../../../shared/awsp-serializers/v1/definitions/index.js';
import type {
  BuildResult,
  EntityBuildIssue,
} from '../../types/issue-collection.js';
import {ENTITY_TYPES, ISSUE_SEVERITY} from '../../types/issue-collection.js';
import {ERROR_CODES} from '../../../../../shared/errors/error-codes.js';

/**
 * Service responsible for building domain DriverModuleDefinition entities from AWSP DriverModuleDefinitions.
 */
export class DriverModuleDefinitionBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build domain DriverModuleDefinition entities from AWSP DriverModuleDefinitions with system IDs assigned
   * @param awspModuleDefinitions - Array of AWSP driver module definitions to transform
   * @param fileSystemId - The file system ID to associate with the module definitions
   * @returns Promise resolving to BuildResult with entities and issues
   */
  async buildDriverModuleDefinitions(
    awspModuleDefinitions: AwspDriverModuleDefinition[],
    fileSystemId: number,
  ): Promise<BuildResult<DriverModuleDefinition>> {
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
      msg: `Building ${awspModuleDefinitions.length} driver module definitions`,
      action: 'driver_module_definition_building_start',
      component: 'DriverModuleDefinitionBuilder',
      tag: 'driver-module-definitions',
      timestamp: new Date(),
    });

    const entities: DriverModuleDefinition[] = [];
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
          message: `Failed to build driver module definition ${awspDef.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          entityType: ENTITY_TYPES.DRIVER_MODULE_DEFINITION,
        });
      }
    }

    this.logger?.logInfo({
      msg: `Successfully built ${entities.length} driver module definitions with system IDs assigned, ${issues.length} failures`,
      action: 'driver_module_definition_building_complete',
      component: 'DriverModuleDefinitionBuilder',
      tag: 'driver-module-definitions',
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

  /**
   * Create a driver module definition entity with system ID assigned
   */
  private async createModuleDefinition(
    awspDef: AwspDriverModuleDefinition,
    fileSystemId: number,
  ): Promise<DriverModuleDefinition> {
    const definition = new DriverModuleDefinition({
      systemId: 0, // Will be assigned below
      moduleDefinitionId: awspDef.id,
      fileSystemId,
      name: awspDef.name,
      displayName: awspDef.displayName || awspDef.name,
      description: awspDef.description,
      parameters: [], // Will be built separately
    });

    // Assign system ID to module definition
    definition.systemId = await this.idGenerator.getNextId(fileSystemId);

    // Store module definition mapping immediately
    this.foreignKeyMapper.addDriverModuleDefinitionMapping(
      asNaturalId(definition.moduleDefinitionId),
      asSystemId(definition.systemId),
    );

    return definition;
  }

  /**
   * Build parameter definitions for a module definition
   */
  private async buildParameterDefinitions(
    awspDef: AwspDriverModuleDefinition,
    definition: DriverModuleDefinition,
    fileSystemId: number,
    issues: EntityBuildIssue[],
  ): Promise<void> {
    if (!awspDef.paramDefinitions || awspDef.paramDefinitions.length === 0) {
      return;
    }

    for (const awspParam of awspDef.paramDefinitions) {
      try {
        const paramSystemId = await this.idGenerator.getNextId(fileSystemId);

        const param = new DriverModuleParameterDefinition({
          systemId: paramSystemId,
          parameterId: awspParam.id,
          name: awspParam.name,
          description: awspParam.description,
          maxSize: awspParam.maxSize || 0,
          paramStructure: JSON.stringify(awspParam.elements),
          driverModuleDefinitionSystemId: definition.systemId,
        });

        definition.parameters.push(param);

        // Store parameter definition mapping immediately
        this.foreignKeyMapper.addDriverParamDefinitionMapping(
          asSystemId(definition.systemId),
          asNaturalId(param.parameterId),
          asSystemId(param.systemId),
        );
      } catch (error) {
        issues.push({
          severity: ISSUE_SEVERITY.ERROR,
          code: ERROR_CODES.INVALID_ENTITY_DATA,
          message: `Failed to build parameter ${awspParam.id} for driver module ${awspDef.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          entityType: ENTITY_TYPES.DRIVER_MODULE_DEFINITION,
        });
      }
    }
  }
}
