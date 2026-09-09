import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { AppModule } from './app.module';

/**
 * arachni has almost no HTTP surface — it listens on the bus — but it still
 * serves organon's health probes, which is what an orchestrator restarts it
 * from.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3120;

  await app.listen(port);

  Logger.log(`arachni is listening on the bus; health on :${port}/health`);
}

void bootstrap();
