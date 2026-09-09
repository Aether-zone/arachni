import { Provider } from '@nestjs/common';
import neo4j, { type Driver } from 'neo4j-driver';

export const NEO4J_DRIVER = 'NEO4J_DRIVER';
export const NEO4J_CONFIG = 'NEO4J_CONFIG';

export interface Neo4jConfig {
  /** Bolt URL. The workspace compose file publishes it on 7387, not 7687. */
  uri: string;
  username: string;
  password: string;
  /** The database to open sessions against. */
  database?: string;
}

export const createNeo4jProviders = (): Provider[] => [
  {
    provide: NEO4J_DRIVER,
    useFactory: (config: Neo4jConfig): Driver =>
      neo4j.driver(
        config.uri,
        neo4j.auth.basic(config.username, config.password),
        {
          /*
           * The driver is lazy: it does not connect here, and a bad address
           * surfaces at the first query rather than at boot. That is what the
           * health indicator is for — see `Neo4jHealth`.
           */
          disableLosslessIntegers: true,
        },
      ),
    inject: [NEO4J_CONFIG],
  },
];
