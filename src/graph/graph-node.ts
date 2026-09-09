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
  nodes: GraphNode[];
  relationships: GraphRelationship[];
}
