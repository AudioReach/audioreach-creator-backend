import type {ContainerAggregate} from 'domain/entities/usecase-data/container/container-aggregate.js';
import type {SpfModule} from 'domain/entities/usecase-data/module/spf-module-aggregate.js';
import {buildModules} from './../entity-builders/module-entity-builder.js';
import type {SystemIdReservationService} from 'application/ports/persistence/systemId-reservation-service.port.js';

export interface EntitiesReferenceIndexer {
  moduleById: Map<number, SpfModule>;
  containerById: Map<number, ContainerAggregate>;
}

export class EntityBuilderService {
  constructor(
    private entitiesReferenceIndexer: EntitiesReferenceIndexer,
    private idReservationService: SystemIdReservationService,
  ) {}
  async buildAll(/* parsed objects */): Promise<boolean> {
    buildModules(this.entitiesReferenceIndexer, this.idReservationService);
    return true;
  }
}
