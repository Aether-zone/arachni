import { Inject, Injectable } from '@nestjs/common';
import type { Driver } from 'neo4j-driver';

import type { GraphProjection } from './graph-node';
import { NEO4J_DRIVER } from './neo4j.providers';

/**
 * The graph itself.
 *
 * Two things run through every query here and are worth stating once:
 *
 * **`organizationId` is on the node, not implied by the connection.** One
 * Neo4j holds every tenant's graph, so a query that forgot it would read
 * across the boundary. Every match below carries it.
 *
 * **Writes `MERGE` on the IRI rather than `CREATE`.** An event arrives more
 * than once — at-least-once is what the broker offers — and two documents can
 * mention the same resource. Merging makes a redelivery a no-op and lets
 * whichever document arrives second fill in a node the first only pointed at.
 */
@Injectable()
export class GraphRepository {
  constructor(@Inject(NEO4J_DRIVER) private readonly driver: Driver) {}

  async upsert(
    organizationId: string,
    projection: GraphProjection,
  ): Promise<void> {
    const session = this.driver.session();

    try {
      /*
       * One transaction for the whole document. A projection is a single
       * resource and the things it names; half of it in the graph is a state
       * no reader should ever see.
       */
      await session.executeWrite(async (tx) => {
        for (const node of projection.nodes) {
          await tx.run(
            `
            MERGE (n:Resource { uri: $uri, organizationId: $organizationId })
            SET n += $properties
            WITH n, $labels AS labels
            CALL apoc.create.addLabels(n, labels) YIELD node
            RETURN node
            `,
            {
              uri: node.uri,
              labels: this.toLabels(node.types),
              properties: node.properties,
              organizationId,
            },
          );
        }

        /*
         * The ownership edges. `PART_OF` is arachni's own, not the document's:
         * it records that a node was defined inside another and should not
         * outlive it. Written after the nodes so both ends exist.
         */
        for (const node of projection.nodes) {
          if (!node.partOf) {
            continue;
          }

          await tx.run(
            `
            MATCH (part:Resource { uri: $uri, organizationId: $organizationId })
            MATCH (whole:Resource { uri: $partOf, organizationId: $organizationId })
            MERGE (part)-[:PART_OF]->(whole)
            `,
            { uri: node.uri, partOf: node.partOf, organizationId },
          );
        }

        /*
         * Parts the document no longer has.
         *
         * Re-projecting a resource overwrites what it still contains, but a
         * participation removed from a meeting would otherwise linger for
         * ever — attached to nothing, and still answering a query for
         * participations. This is the same leak as the one `delete` fixes,
         * reached by editing rather than deleting.
         *
         * Scoped to parts of *this* root, so nothing another document owns is
         * touched.
         */
        await tx.run(
          `
          MATCH (part:Resource)-[:PART_OF*1..]->(root:Resource { uri: $root, organizationId: $organizationId })
          WHERE NOT part.uri IN $keep
          DETACH DELETE part
          `,
          {
            root: projection.root,
            keep: projection.nodes.map((node) => node.uri),
            organizationId,
          },
        );

        for (const relationship of projection.relationships) {
          /*
           * The type is interpolated because Cypher will not parameterise a
           * relationship type. `toRelationshipType` is what makes that safe:
           * anything but letters, digits and underscore is stripped, so no
           * value reaching here can close the bracket and add a clause.
           */
          const type = this.toRelationshipType(relationship.type);

          await tx.run(
            `
            MERGE (from:Resource { uri: $from, organizationId: $organizationId })
            MERGE (to:Resource { uri: $to, organizationId: $organizationId })
            MERGE (from)-[r:${type}]->(to)
            SET r += $properties
            `,
            {
              from: relationship.from,
              to: relationship.to,
              properties: relationship.properties,
              organizationId,
            },
          );
        }
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Removes a resource and every edge touching it.
   *
   * `DETACH DELETE`, because a node with edges cannot be deleted otherwise —
   * and an edge to a resource that is gone is worse than no edge.
   */
  async delete(organizationId: string, uri: string): Promise<void> {
    const session = this.driver.session();

    try {
      await session.executeWrite(async (tx) => {
        /*
         * The resource *and* everything defined inside it.
         *
         * `DETACH DELETE` on the resource alone removed the meeting and its
         * edges but left every participation standing — nodes belonging to
         * nothing, still matching a query for participations. A participation
         * has no meaning without its meeting; the person it points at does,
         * which is why the cascade follows `PART_OF` rather than every edge.
         *
         * `*1..` so a part of a part goes too. `OPTIONAL MATCH` because most
         * resources have no parts at all, and an inner join would make the
         * delete a no-op for them.
         */
        await tx.run(
          `
          MATCH (n:Resource { uri: $uri, organizationId: $organizationId })
          OPTIONAL MATCH (part:Resource)-[:PART_OF*1..]->(n)
          DETACH DELETE n, part
          `,
          { uri, organizationId },
        );
      });
    } finally {
      await session.close();
    }
  }

  /** Whether the store answers. Used by the health probe, not by the flow. */
  async ping(): Promise<void> {
    const session = this.driver.session();

    try {
      await session.run('RETURN 1');
    } finally {
      await session.close();
    }
  }

  /**
   * `@type`s as Neo4j labels.
   *
   * `Resource` is always there — it is what every query matches on — and the
   * document's own types are added beside it, so `aether:Meeting` becomes a
   * `Meeting` label anything can match without knowing the vocabulary.
   */
  private toLabels(types: string[]): string[] {
    return types
      .map((type) => (type.includes(':') ? type.split(':').pop()! : type))
      .map((type) => type.replace(/[^a-zA-Z0-9_]/g, ''))
      .filter((type) => type.length > 0);
  }

  private toRelationshipType(type: string): string {
    const safe = type.replace(/[^a-zA-Z0-9_]/g, '').toUpperCase();

    // A relationship must have a type; an empty one would be a syntax error
    // rather than a bad edge, which is a worse way to find out.
    return safe.length > 0 ? safe : 'RELATED_TO';
  }
}
