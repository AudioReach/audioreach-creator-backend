import { BaseQuery } from "@application/shared/base-query";

export class GetModuleCompactQuery extends BaseQuery {
  constructor(
    public readonly instanceId: number,
    clientId?: string,
  ) {
    super(clientId);
  }
}
