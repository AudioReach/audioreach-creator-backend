export interface BaseInsertError {
  /** System ID of the failing entity */
  systemId: number;

  /** Human-readable error message */
  message: string;

  /** System ID of parent entity (if child failed) */
  parentSystemId?: number;
}
