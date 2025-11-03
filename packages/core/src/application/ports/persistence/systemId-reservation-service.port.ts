export type EntityType = 'SpfModule' | 'Container';

/**
 * Port: ID reservation service for upfront systemId allocation.
 * No domain imports here; pure application port.
 */
export interface ReservedRange {
  start: number; // inclusive
  end: number; // exclusive
  count: number;
}

export interface SystemIdReservationService {
  /**
   * Reserve a contiguous range of systemIds for a given entity type.
   * Implementations must be atomic and concurrency-safe.
   */
  reserveRange(
    entityType: EntityType,
    countRequested: number,
  ): Promise<ReservedRange>;

  /**
   * Optional: reserve a default blockSize range preconfigured per entity type.
   */
  reserveDefaultBlock(entityType: string): Promise<ReservedRange>;
}
