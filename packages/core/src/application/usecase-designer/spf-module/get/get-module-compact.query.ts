import {BaseQuery} from '../../../shared/base-query.js';

export class GetModuleCompactQuery extends BaseQuery {
  constructor(
    public readonly instanceId: number,
    clientId: string,
  ) {
    super(clientId);
  }
}
