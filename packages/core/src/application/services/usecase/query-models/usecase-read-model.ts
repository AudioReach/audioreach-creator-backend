import type {KeyVectorReadModel} from './key-vector-read-model.js';

/**
 * Use case read model for query responses
 */
export class UseCaseReadModel {
  constructor(
    public readonly systemId: number,
    public readonly gkv: KeyVectorReadModel[],
    public readonly alias?: string,
    public readonly aliasId?: number,
    public readonly categories?: string[],
  ) {}
}
