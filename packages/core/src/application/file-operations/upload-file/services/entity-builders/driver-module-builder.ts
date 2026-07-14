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
import {DriverModule} from '../../../../../domain/entities/driver-module-data/driver-module.js';
import type {BuildResult} from '../../types/issue-collection.js';
import type {Issue} from '../../../../../shared/issues/index.js';
import {
  IssueSeverity,
  ISSUE_ENTITY_TYPE,
} from '../../../../../shared/issues/index.js';
import {ERROR_CODES} from '../../../../../shared/errors/error-codes.js';
import type {ParsedAcdb} from '../../models/parsed-acdb.js';
import {DriverCalibrationDataBuilder} from './driver-calibration-data-builder.js';

/**
 * Builder for converting driver module definition IDs to DriverModule domain entities.
 * Driver modules have a one-to-one relationship with their definitions.
 * Each driver module definition has exactly one instance.
 */
export class DriverModuleBuilder {
  constructor(
    private readonly idGenerator: IdGenerationPort,
    private readonly foreignKeyMapper: ForeignKeyMapper,
    private readonly logger?: Logger,
  ) {}

  /**
   * Build DriverModule entities from driver module definition IDs with system IDs assigned.
   * Creates one module instance per definition (one-to-one relationship).
   *
   * @param moduleDefinitionIds - Array of driver module definition IDs (natural keys)
   * @param fileSystemId - The file system ID to associate with the modules
   * @param parsedAcdb - Optional parsed ACDB data for attaching calibration data
   * @returns Promise resolving to BuildResult with entities and issues
   */
  async buildDriverModules(
    moduleDefinitionIds: number[],
    fileSystemId: number,
    parsedAcdb?: ParsedAcdb,
  ): Promise<BuildResult<DriverModule>> {
    if (!moduleDefinitionIds || moduleDefinitionIds.length === 0) {
      return {entities: [], issues: []};
    }

    this.logger?.logDebug({
      msg: `Building ${moduleDefinitionIds.length} driver modules`,
      action: 'driver_module_building_start',
      component: 'DriverModuleBuilder',
      tag: 'driver-modules',
      timestamp: new Date(),
    });

    const entities: DriverModule[] = [];
    const issues: Issue[] = [];

    // Step 1: Build driver module entities
    for (const moduleDefinitionId of moduleDefinitionIds) {
      try {
        // Resolve definition systemId
        const definitionSystemId =
          this.foreignKeyMapper.getDriverModuleDefinitionSystemId(
            asNaturalId(moduleDefinitionId),
          );

        if (!definitionSystemId) {
          issues.push({
            code: ERROR_CODES.INVALID_ENTITY_DATA,
            message: `No driver module definition systemId mapping found for moduleDefinitionId ${moduleDefinitionId}`,
            severity: IssueSeverity.Error,
            impactedEntity: {
              entityType: ISSUE_ENTITY_TYPE.DriverModule,
              systemId: moduleDefinitionId,
            },
          });
          continue;
        }

        // Create driver module entity
        const driverModule = new DriverModule({
          systemId: await this.idGenerator.getNextId(fileSystemId),
          definitionSystemId,
          fileSystemId,
        });

        // Store module mapping immediately
        this.foreignKeyMapper.addDriverModuleMapping(
          asNaturalId(moduleDefinitionId),
          asSystemId(driverModule.systemId),
        );

        entities.push(driverModule);
      } catch (error) {
        issues.push({
          code: ERROR_CODES.INVALID_ENTITY_DATA,
          message: `Failed to build driver module for definition ${moduleDefinitionId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          severity: IssueSeverity.Error,
          impactedEntity: {
            entityType: ISSUE_ENTITY_TYPE.DriverModule,
            systemId: moduleDefinitionId,
          },
        });
      }
    }

    // Step 2: Attach calibration data if ACDB provided
    if (parsedAcdb && entities.length > 0) {
      await this.attachCalibrationData(entities, parsedAcdb, fileSystemId);
    }

    this.logger?.logInfo({
      msg: `Successfully built ${entities.length} driver modules with system IDs assigned, ${issues.length} failures`,
      action: 'driver_module_building_complete',
      component: 'DriverModuleBuilder',
      tag: 'driver-modules',
      timestamp: new Date(),
    });

    return {
      entities,
      issues,
    };
  }

  /**
   * Attach calibration data to driver modules.
   * Builds DkvData with KeyVector deduplication and attaches them to their respective modules.
   */
  private async attachCalibrationData(
    driverModules: DriverModule[],
    parsedAcdb: ParsedAcdb,
    fileSystemId: number,
  ): Promise<void> {
    const calibrationBuilder = new DriverCalibrationDataBuilder(
      this.idGenerator,
      this.logger,
    );

    try {
      // Build calibration data grouped by module systemId
      const dkvDataByModule =
        await calibrationBuilder.buildCalibrationDataByModule(
          parsedAcdb,
          this.foreignKeyMapper,
          fileSystemId,
        );

      // Attach DkvData to their respective modules
      for (const driverModule of driverModules) {
        const moduleDkvData = dkvDataByModule.get(driverModule.systemId);
        if (moduleDkvData) {
          for (const dkvData of moduleDkvData) {
            driverModule.addDkvData(dkvData);
          }
        }
      }
    } catch (error) {
      // Log warning but don't fail the entire build
      this.logger?.logWarn({
        msg: `Failed to attach calibration data: ${error instanceof Error ? error.message : 'Unknown error'}`,
        action: 'calibration_attachment_failed',
        component: 'DriverModuleBuilder',
        tag: 'calibration-attachment',
        timestamp: new Date(),
      });
    }
  }
}
