import {BaseQuery} from '../../../shared/base-query.js';

/**
 * Query to get all components (modules, data links, control links) for specific use cases
 */
export class GetComponentsQuery extends BaseQuery {
  constructor(
    public readonly useCaseSystemIds: number[],
    clientId: string,
  ) {
    super(clientId);
  }
}
