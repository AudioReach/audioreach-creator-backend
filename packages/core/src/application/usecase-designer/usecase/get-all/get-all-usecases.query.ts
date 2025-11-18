import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to get all use cases with their global key vectors for a specific project
 */
export class GetAllUseCasesQuery extends BaseQuery {
  constructor(
    public readonly projectId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
