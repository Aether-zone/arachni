import { Injectable, Logger } from '@nestjs/common';
import type { JsonLdDocument } from '@aether-zone/organon';

import { GraphRepository } from './graph.repository';
import { JsonLdMapper } from './json-ld.mapper';

/**
 * What arachni does with a document: flatten it, and write it.
 *
 * The two steps are separate classes because they fail differently. A document
 * the mapper cannot read is the producer's problem and will never succeed; a
 * write that fails is the store's and might. See how the listener treats them.
 */
@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(
    private readonly mapper: JsonLdMapper,
    private readonly repository: GraphRepository,
  ) {}

  async upsert(
    organizationId: string,
    document: JsonLdDocument,
  ): Promise<void> {
    const projection = this.mapper.map(document);

    await this.repository.upsert(organizationId, projection);

    this.logger.log(
      `Projected ${document['@id']} into ${projection.nodes.length} node(s) and ${projection.relationships.length} relationship(s)`,
    );
  }

  async delete(organizationId: string, uri: string): Promise<void> {
    await this.repository.delete(organizationId, uri);

    this.logger.log(`Removed ${uri}`);
  }
}
