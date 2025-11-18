export interface KeyVectorRepository {
  /**
   * Insert or retrieve existing KeyVector by value systemIds.
   * Uses internal hash-based deduplication - if KeyVector with same values exists, returns existing one.
   *
   * @param valueSystemIds - Array of value definition systemIds
   * @returns KeyVector systemId (new or existing)
   */
  insertOrGetKeyVector(valueSystemIds: number[]): Promise<number>;

  /**
   * Delete KeyVector (only if not referenced by any entity)
   *
   * @param systemId - KeyVector systemId
   * @throws Error if KeyVector is still referenced by foreign key constraints
   */
  deleteKeyVector(systemId: number): Promise<void>;
}
