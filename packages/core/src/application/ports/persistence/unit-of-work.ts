import type {BulkImportRepository} from './repositories/bulk-import/bulk-import.repository.js';
import type {ProjectRepository} from './repositories/project/project.repostiory.js';

export interface UnitOfWork {
  /**
   * Begins a new transaction.
   * Performs the task
   * commit if success, rollback if error
   */
  executeInTransaction<T>(task: () => Promise<T>): Promise<T>;

  getBulkImportRepository(): BulkImportRepository;
  getProjectRepository(): ProjectRepository;
}
