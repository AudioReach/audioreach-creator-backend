import type {
  UseCaseReadModel,
  UseCaseComponentsReadModel,
} from './query-models/index.js';

/**
 * Query service interface for use case queries
 */
export interface UseCaseQueryService {
  /**
   * Get all use cases with their global key vectors for a specific file
   * @param fileId - The file system ID to filter use cases by
   * @returns Promise resolving to array of use case read models
   */
  getAllUseCases(fileId: number): Promise<UseCaseReadModel[]>;

  /**
   * Get all components (modules, data links, control links) for given use cases
   * @param useCaseSystemIds - Array of use case system IDs
   * @returns Promise resolving to use case components read model
   */
  getAllComponentsForUseCases(
    useCaseSystemIds: number[],
  ): Promise<UseCaseComponentsReadModel>;
}
