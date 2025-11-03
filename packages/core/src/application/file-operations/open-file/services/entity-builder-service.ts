import type {Container} from 'domain/entities/usecase-data/container/container.js';
import type {SpfModule} from 'domain/entities/usecase-data/module/spf-module.js';
import {buildModules} from './../entity-builders/module-entity-builder.js';
import type {SystemIdReservationService} from 'application/ports/persistence/systemId-reservation-service.port.js';

export interface EntitiesReferenceIndexer {
  moduleById: Map<number, SpfModule>;
  containerById: Map<number, Container>;
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
