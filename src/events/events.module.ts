import { Module } from '@nestjs/common';

import { GraphModule } from '../graph/graph.module';
import { AetherEventListener } from './aether-event.listener';

/**
 * The subscription side.
 *
 * `RabbitMqModule` is configured at the root and is `@Global`, so the
 * listener's `@RabbitSubscribe` is discovered without this module importing it.
 */
@Module({
  imports: [GraphModule],
  providers: [AetherEventListener],
})
export class EventsModule {}
