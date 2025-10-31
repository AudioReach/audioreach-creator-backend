/**
 * Helper cursor to consume a contiguous ID range deterministically.
 */
class IdCursor {
  private current: number;
  constructor(
    private readonly start: number,
    private readonly end: number,
  ) {
    this.current = start;
  }
  next(): number {
    if (this.current >= this.end) {
      throw new Error(
        'IdCursor overflow: requested more IDs than reserved range.',
      );
    }
    return this.current++;
  }
  remaining(): number {
    return Math.max(0, this.end - this.current);
  }
}
