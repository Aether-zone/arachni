import { Nack, RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Injectable, Logger } from '@nestjs/common';
import { aetherEventSchema, type JsonLdDocument } from '@aether-zone/organon';

import { GraphService } from '../graph/graph.service';

/**
 * Everything the workspace announces about a resource, projected into the
 * graph.
 *
 * arachni subscribes to `#` — every routing key on the shared exchange — and
 * decides from the event itself, not from the key, what to do. A service that
 * had to be told about `meeting.created` before it could store a meeting would
 * need changing every time another service learned to announce something, and
 * that is precisely the coupling a shared vocabulary exists to remove.
 */
@Injectable()
export class AetherEventListener {
  private readonly logger = new Logger(AetherEventListener.name);

  constructor(private readonly graph: GraphService) {}

  @RabbitSubscribe({
    exchange: 'aether-zone',
    // Every key. See above.
    routingKey: '#',
    // Named, not anonymous: an anonymous queue is exclusive and vanishes with
    // the process, so a restart would lose whatever arrived meanwhile.
    queue: 'arachni.events',
    queueOptions: { durable: true },
  })
  async handle(message: unknown): Promise<Nack | undefined> {
    const parsed = aetherEventSchema.safeParse(message);

    if (!parsed.success) {
      /*
       * Not an Aether event, or a malformed one. Dropped rather than requeued:
       * it will not become valid on a second reading, and `Nack(true)` on a
       * message that can never succeed is an infinite loop that takes the
       * queue down with it.
       *
       * The exchange carries every service's events, so this is also the
       * ordinary path for one arachni has no interest in — hence debug, not
       * error.
       */
      this.logger.debug(
        `Ignoring a message that is not an Aether event: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')} ${issue.message}`)
          .join('; ')}`,
      );

      return new Nack(false);
    }

    const event = parsed.data;

    /*
     * Which tenant's graph this belongs in. An event without one cannot be
     * filed: the organization is on the node, and writing it under a guess
     * would put one tenant's resource where another can read it.
     */
    if (!event.organizationId) {
      this.logger.warn(
        `"${event.type}" for ${event.subject} carries no organizationId; dropping it`,
      );

      return new Nack(false);
    }

    try {
      if (event.type === 'aether:ResourceDeleted') {
        await this.graph.delete(event.organizationId, event.subject);

        return undefined;
      }

      await this.graph.upsert(
        event.organizationId,
        event.data as JsonLdDocument,
      );

      return undefined;
    } catch (cause) {
      /*
       * The store failed, which may well be temporary — so this one *is*
       * requeued. The write is idempotent (`MERGE` on the IRI), so redelivery
       * costs nothing but the round trip.
       */
      this.logger.error(
        `"${event.type}" for ${event.subject} could not be written; requeuing`,
        cause,
      );

      return new Nack(true);
    }
  }
}
