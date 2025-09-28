import {Query} from '../orchestration/cqrs/queries/query.js';
import {generateUuid} from '../../shared/utilities/uuid.js';

export abstract class BaseQuery implements Query {
  readonly id: string;
  readonly timeStamp: Date = new Date();

  constructor(public readonly clientId: string) {
    this.id = generateUuid();
  }
}
