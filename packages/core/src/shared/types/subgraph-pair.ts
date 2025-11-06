/**
 * Represents a subgraph connection pair with source and destination IDs
 */
export class SubgraphPair {
  constructor(
    public readonly source: number,
    public readonly destination: number,
  ) {}

  /**
   * Check equality with another SubgraphPair
   */
  equals(other: SubgraphPair): boolean {
    return (
      this.source === other.source && this.destination === other.destination
    );
  }

  /**
   * String representation of the subgraph pair
   */
  toString(): string {
    return `SubgraphPair(${this.source} -> ${this.destination})`;
  }

  /**
   * Clone this SubgraphPair instance
   */
  clone(): SubgraphPair {
    return new SubgraphPair(this.source, this.destination);
  }
}
