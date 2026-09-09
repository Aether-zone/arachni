import { baseEnvSchema } from '@aether-zone/organon';
import { z } from 'zod';

/**
 * What arachni needs, on top of the `NODE_ENV`, `PORT` and `LOG_LEVEL` every
 * service has.
 *
 * The Neo4j password has no default. A store this service can reach with a
 * development password is one it can also reach in production if nobody
 * remembered to set it, and a boot failure is the louder way to find out.
 */
export const envSchema = baseEnvSchema.extend({
  /**
   * Bolt, not HTTP. The workspace compose file publishes it on **7387** — 7687
   * is the container's own port and is remapped because the default is
   * commonly taken.
   */
  NEO4J_URI: z.string().min(1).default('bolt://localhost:7387'),
  NEO4J_USERNAME: z.string().min(1).default('neo4j'),
  NEO4J_PASSWORD: z.string().min(1),
  /** Left unset, the driver uses the server's default database. */
  NEO4J_DATABASE: z.string().min(1).optional(),

  /*
   * RabbitMQ.
   *
   * **The broker is shared, not per-service.** Every aether-zone service
   * publishes to one exchange, which is the only arrangement in which an event
   * from akouo reaches arachni. A broker of arachni's own would leave this
   * service subscribed to nothing.
   */

  /** `amqp://user:pass@host:5682`, matching the workspace compose file. */
  RABBITMQ_URI: z
    .string()
    .min(1)
    .default('amqp://aether-zone:Ch4nG3M3!@localhost:5682'),
  /** The shared topic exchange. Must match every other service's. */
  RABBITMQ_EXCHANGE: z.string().min(1).default('aether-zone'),
  /**
   * Wait this long for the broker before finishing the boot, in milliseconds.
   * `0` starts anyway and connects in the background.
   *
   * Unlike loculus, arachni exists *to* consume: a broker it cannot reach means
   * it has no work at all, so waiting is the honest default.
   */
  RABBITMQ_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(0).default(10_000),
});

export type Env = z.infer<typeof envSchema>;
