import type {UnitOfWork} from 'application/ports/persistence/unit-of-work.js';
import {
  EntityBuilderService,
  type EntitiesReferenceIndexer,
} from './entity-builder-service.js';
import type {ContainerAggregate} from 'domain/entities/usecase-data/container/container-aggregate.js';
import type {SpfModule} from 'domain/entities/usecase-data/module/spf-module-aggregate.js';
import type {SystemIdReservationService} from 'application/ports/persistence/systemId-reservation-service.port.js';

export class UploadFileOrchestrator implements EntitiesReferenceIndexer {
  private builderService: EntityBuilderService;

  /* -----EntitiesReferenceIndexer ------*/
  readonly moduleById: Map<number, SpfModule> = new Map<number, SpfModule>();
  readonly containerById: Map<number, ContainerAggregate> = new Map<
    number,
    ContainerAggregate
  >();
  /* -------------------------------------*/

  constructor(
    private uow: UnitOfWork,
    private idReservationService: SystemIdReservationService,
  ) {
    this.builderService = new EntityBuilderService(this, idReservationService);
  }

  async orchestrate(/* byte arrays */): Promise<boolean> {
    //  const parsedItems = this.parser.Parse();
    const result = this.builderService.buildAll(/*parsedItems*/);
    return true;
  }

  persistEntities() {
    // Fill the items in DB in the correct order
    // const moduleRepo = this.uow.getModuleRepo();
    // moduleRepo.BulkInsert(moduleById);
  }
}
