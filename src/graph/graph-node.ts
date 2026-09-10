/**
 * A JSON-LD document flattened into something a graph store can hold.
 *
 * The mapper turns one document into this; the repository writes it. Keeping
 * the shape in between means neither has to know about the other — the mapper
 * has no Cypher in it, and the repository never sees an `@context`.
 */

export interface GraphNode {
  /** The resource's IRI. Unique within an organization, and how it is found. */
  uri: string;
  /** The `@type`s, which become Neo4j labels. */
  types: string[];
  organizationId?: string;
  /** Everything that was a literal on the document. */
  properties: Record<string, unknown>;
  /**
   * The IRI of the resource this node was *defined inside*, when it was.
   *
   * The distinction the mapper draws between a nested resource and a bare
   * `{ '@id': … }` reference is invisible in the finished graph — both end up
   * as an edge — but it is exactly what decides whether a node should survive
   * its neighbour being deleted. A participation exists only as part of its
   * meeting; the person it points at does not. Recording it here is what lets
   * the repository delete the first and leave the second.
   */
  partOf?: string;
}

export interface GraphRelationship {
  /** IRI of the subject. */
  from: string;
  /** IRI of the object. */
  to: string;
  /** The predicate, upper-cased into a Neo4j relationship type. */
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphProjection {
  /** IRI of the document this projection is of — the one node that is not a part. */
  root: string;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}
