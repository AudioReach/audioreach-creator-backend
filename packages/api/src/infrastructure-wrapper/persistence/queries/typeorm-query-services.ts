import type {QueryServices, ModuleQueryService} from '@arc/core';
import {DataSource} from 'typeorm';

// Database implementation of ModuleQueryService
class DbModuleQueryService implements ModuleQueryService {
  // Add query methods here as needed
}

export class DbQueryServices implements QueryServices {
  readonly modulesQueryService: ModuleQueryService;

  constructor(_dataSource: DataSource) {
    this.modulesQueryService = new DbModuleQueryService();
  }
}
