import { Query } from "@application/orchestration/cqrs/queries/query";
import { generateUuid } from "@shared/utilities/uuid";

export abstract class BaseQuery implements Query {
  readonly id: string = generateUuid();
  readonly timeStamp: Date = new Date();

  constructor(public readonly clientId?: string) {}
}
