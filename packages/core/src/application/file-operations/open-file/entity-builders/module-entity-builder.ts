import {SpfModule} from 'domain/entities/usecase-data/module/spf-module-aggregate.js';
import type {SystemIdReservationService} from './../../../ports/persistence/systemId-reservation-service.port.js';
import type {EntitiesReferenceIndexer} from '../services/entity-builder-service.js';

export function buildModules(
  entitiesReferenceIndexer: EntitiesReferenceIndexer,
  idReservationService: SystemIdReservationService,
  /* parsed objects */
): SpfModule[] {
  /*
    Counts instances per table.
    Reserves systemIds via IdReservationService for the current entity.
    Assign IDs deterministically (sorted by natural key) and construct entities/aggregates.
    Wire references via EntitiesReferenceIndexer (resolve dependent natural keys to systemIds).
    Put ( naturalKey →  entity) into EntitiesReferenceIndexer.
    Simple validations: if a dependency is missing, record error; do not assign a systemId to an invalid entity.
    */

  // ============================================================
  // STEP 1: Count instances per table
  // ============================================================
  //   const modulesCount = parsedModules.length;

  //   let dataPortsCount = 0;
  //   let controlPortsCount = 0;
  //   let parameterDefinitionsCount = 0;
  //   let ckvsCount = 0;
  //   let tagsCount = 0;

  //   for (const parsed of parsedModules) {
  //     dataPortsCount += parsed.dataPorts.length;
  //     controlPortsCount += parsed.controlPorts.length;
  //     parameterDefinitionsCount += parsed.parameterDefinitions.length;
  //     ckvsCount += parsed.ckvs.length;
  //     tagsCount += parsed.tags.length;
  //   }

  //   // ============================================================
  //   // STEP 2: Reserve systemIds for ALL tables (aggregate + children)
  //   // ============================================================
  //   const [
  //     moduleRange,
  //     dataPortRange,
  //     controlPortRange,
  //     paramDefRange,
  //     ckvRange,
  //     tagRange,
  //   ] = await Promise.all([
  //     idReservationService.reserveRange('SpfModule', modulesCount),
  //     idReservationService.reserveRange('DataPort', dataPortsCount),
  //     idReservationService.reserveRange('ControlPort', controlPortsCount),
  //     idReservationService.reserveRange(
  //       'SpfModuleParameterDefinition',
  //       parameterDefinitionsCount,
  //     ),
  //     idReservationService.reserveRange('Ckv', ckvsCount),
  //     idReservationService.reserveRange('TagData', tagsCount),
  //   ]);

  //   // Create cursors for deterministic ID assignment
  //   const moduleCursor = new IdCursor(moduleRange.start, moduleRange.end);
  //   const dataPortCursor = new IdCursor(dataPortRange.start, dataPortRange.end);
  //   const controlPortCursor = new IdCursor(
  //     controlPortRange.start,
  //     controlPortRange.end,
  //   );
  //   const paramDefCursor = new IdCursor(paramDefRange.start, paramDefRange.end);
  //   const ckvCursor = new IdCursor(ckvRange.start, ckvRange.end);
  //   const tagCursor = new IdCursor(tagRange.start, tagRange.end);

  // Validation e.g.
  // --------------------------------------------------------
  // STEP 6: Simple validation - check dependencies
  // --------------------------------------------------------
  //   if (!containerSystemId) {
  //     errors.push({
  //       naturalKey,
  //       reason: `Container not found: ${parsed.containerNaturalKey}`,
  //     });
  //     continue; // Skip this module
  //   }

  //   if (!subgraphSystemId) {
  //     errors.push({
  //       naturalKey,
  //       reason: `Subgraph not found: ${parsed.subgraphNaturalKey}`,
  //     });
  //     continue;
  // }
  return [];
}
