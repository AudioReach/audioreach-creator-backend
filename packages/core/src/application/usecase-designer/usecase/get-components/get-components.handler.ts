import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../services/query-services.js';
import type {UseCaseComponentsReadModel} from '../../../services/usecase/query-models/index.js';
import {GetComponentsQuery} from './get-components.query.js';

/**
 * Handler for GetComponentsQuery
 * Retrieves all components (modules, data links, control links) for specific use cases
 */
export class GetComponentsHandler
  implements
    QueryHandler<GetComponentsQuery, Promise<UseCaseComponentsReadModel>>
{
  constructor(private queryServices: QueryServices) {}

  async handle(query: GetComponentsQuery): Promise<UseCaseComponentsReadModel> {
    // Get all components for the specified use cases
    return await this.queryServices.useCaseQueryService.getAllComponentsForUseCases(
      query.useCaseSystemIds,
    );
  }
}
