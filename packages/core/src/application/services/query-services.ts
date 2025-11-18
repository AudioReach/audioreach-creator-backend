import type {ModuleQueryService} from './module/module-query-service.js';
import type {UseCaseQueryService} from './usecase/usecase-query-service.js';
import type {ProjectQueryService} from './project/project-query-service.js';

export interface QueryServices {
  readonly modulesQueryService: ModuleQueryService;
  readonly useCaseQueryService: UseCaseQueryService;
  readonly projectQueryService: ProjectQueryService;
}
