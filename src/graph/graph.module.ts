import { Module } from '@nestjs/common';
import { ENV } from '@aether-zone/organon';

import { GraphRepository } from './graph.repository';
import { GraphService } from './graph.service';
import { JsonLdMapper } from './json-ld.mapper';
import {
  NEO4J_CONFIG,
  createNeo4jProviders,
  type Neo4jConfig,
} from './neo4j.providers';
import type { Env } from '../env';

/**
 * The graph, and the driver behind it.
 *
 * `GraphService` is exported so the event listener can use it without going
 * through HTTP — the listener is one caller of it, not the only way in.
 */
@Module({
  providers: [
    {
      provide: NEO4J_CONFIG,
      // `ENV` is the validated environment itself, not a service to ask.
      useFactory: (env: Env): Neo4jConfig => ({
        uri: env.NEO4J_URI,
        username: env.NEO4J_USERNAME,
        password: env.NEO4J_PASSWORD,
        database: env.NEO4J_DATABASE,
      }),
      inject: [ENV],
    },
    ...createNeo4jProviders(),
    JsonLdMapper,
    GraphRepository,
    GraphService,
  ],
  exports: [GraphService, GraphRepository],
})
export class GraphModule {}
