import { Module } from '@nestjs/common';
import { ENV, OrganonModule, RabbitMqModule } from '@aether-zone/organon';

import { EventsModule } from './events/events.module';
import { GraphModule } from './graph/graph.module';
import { envSchema, type Env } from './env';

@Module({
  imports: [
    OrganonModule.forRoot({
      config: { schema: envSchema },
      logging: { base: { service: 'arachni' } },
      health: {},
    }),

    /*
     * Events. The exchange is shared with every other aether-zone service, so
     * what akouo publishes is reachable here.
     *
     * arachni exists to consume, so unlike a service that merely announces
     * things, it waits for the broker at boot: no connection means no work at
     * all, and starting anyway would look healthy while doing nothing.
     */
    RabbitMqModule.registerAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        uri: env.RABBITMQ_URI,
        exchange: env.RABBITMQ_EXCHANGE,
        connectTimeoutMs:
          env.RABBITMQ_CONNECT_TIMEOUT_MS === 0
            ? false
            : env.RABBITMQ_CONNECT_TIMEOUT_MS,
      }),
    }),

    GraphModule,
    EventsModule,
  ],
})
export class AppModule {}
