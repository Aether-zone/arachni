import { Injectable } from '@nestjs/common';
import type { JsonLdContext, JsonLdDocument } from '@aether-zone/organon';

import type {
  GraphNode,
  GraphProjection,
  GraphRelationship,
} from './graph-node';

/**
 * Flattens a JSON-LD document into nodes and relationships.
 *
 * The whole job is deciding, for each property, whether it is a *literal* the
 * subject holds or an *edge* to another resource — and those look identical in
 * JSON until you look at the shape of the value.
 */
@Injectable()
export class JsonLdMapper {
  map(document: JsonLdDocument): GraphProjection {
    const nodes = new Map<string, GraphNode>();
    const relationships: GraphRelationship[] = [];

    this.mapResource(document, document['@context'], nodes, relationships);

    return { nodes: [...nodes.values()], relationships };
  }

  private mapResource(
    resource: JsonLdDocument,
    parentContext: JsonLdContext,
    nodes: Map<string, GraphNode>,
    relationships: GraphRelationship[],
  ): string {
    const uri = resource['@id'];

    if (!uri) {
      throw new Error('JSON-LD resource has no @id');
    }

    /*
     * A nested resource may declare its own context, and it wins over the one
     * it inherits — the spec's rule, and the reason this is threaded down
     * rather than read once at the top.
     */
    const context: JsonLdContext = {
      ...parentContext,
      ...((resource['@context'] as JsonLdContext | undefined) ?? {}),
    };

    const node = this.getOrCreateNode(resource, nodes);

    for (const [property, value] of Object.entries(resource)) {
      // `@id`, `@type` and `@context` are the document's own machinery.
      if (property.startsWith('@')) {
        continue;
      }

      this.mapProperty(uri, property, value, context, nodes, relationships);
    }

    return node.uri;
  }

  private mapProperty(
    subject: string,
    property: string,
    value: unknown,
    context: JsonLdContext,
    nodes: Map<string, GraphNode>,
    relationships: GraphRelationship[],
  ): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        this.mapProperty(
          subject,
          property,
          item,
          context,
          nodes,
          relationships,
        );
      }

      return;
    }

    /*
     * `{ '@id': … }` and nothing else: a pointer at a resource described
     * elsewhere. It becomes an edge to a node this document does not define,
     * which may not exist yet — the repository merges on the IRI, so whichever
     * document arrives second fills the other's placeholder in.
     */
    if (this.isReference(value)) {
      const target = this.getOrCreateNode(value, nodes);

      relationships.push({
        from: subject,
        to: target.uri,
        type: this.relationshipType(this.resolvePredicate(property, context)),
        properties: {},
      });

      return;
    }

    // An object with more than an `@id` is a nested resource: a node of its
    // own, and an edge to it.
    if (this.isResource(value)) {
      const target = this.mapResource(value, context, nodes, relationships);

      relationships.push({
        from: subject,
        to: target,
        type: this.relationshipType(this.resolvePredicate(property, context)),
        properties: {},
      });

      return;
    }

    // Anything else is a literal the subject holds.
    const node = nodes.get(subject);

    if (node) {
      node.properties[property] = value;
    }
  }

  /** A term's IRI, where the context defines one. */
  private resolvePredicate(property: string, context: JsonLdContext): string {
    return context[property] ?? property;
  }

  /**
   * The local name of a predicate, as a Neo4j relationship type.
   *
   * `aether:participant` and `https://aether.zone/vocab/participant` both
   * become `PARTICIPANT`, so two documents that spell the same predicate
   * differently still meet on one edge type.
   */
  private relationshipType(predicate: string): string {
    const localName = predicate.includes(':')
      ? predicate.split(':').pop()!
      : predicate.split('/').pop()!;

    return localName.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  }

  private getOrCreateNode(
    resource: Pick<JsonLdDocument, '@id'> & Partial<JsonLdDocument>,
    nodes: Map<string, GraphNode>,
  ): GraphNode {
    const uri = resource['@id']!;
    const existing = nodes.get(uri);

    if (existing) {
      return existing;
    }

    const node: GraphNode = {
      uri,
      types: this.types(resource['@type']),
      properties: {},
    };

    nodes.set(uri, node);

    return node;
  }

  private types(type: unknown): string[] {
    if (!type) {
      return [];
    }

    return Array.isArray(type) ? (type as string[]) : [type as string];
  }

  /** A bare pointer: exactly one key, and it is `@id`. */
  private isReference(value: unknown): value is { '@id': string } {
    return (
      typeof value === 'object' &&
      value !== null &&
      '@id' in value &&
      Object.keys(value).length === 1
    );
  }

  private isResource(value: unknown): value is JsonLdDocument {
    return typeof value === 'object' && value !== null;
  }
}
