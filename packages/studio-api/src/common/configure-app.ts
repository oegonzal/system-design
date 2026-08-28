import { ValidationPipe, type INestApplication } from '@nestjs/common';

/**
 * Everything that turns a bare Nest app into *this* API.
 *
 * Called by both `main.ts` and the integration test harness, deliberately: if
 * the tests built their own pipe they could pass against validation rules
 * that production never applies.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.setGlobalPrefix('api');

  // The Next dev server runs on 4200; override in other environments.
  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? 'http://localhost:4200',
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // drop properties with no decorator
      forbidNonWhitelisted: true, // ...and 400 rather than ignoring them silently
      transform: true, // run @Type() coercion — needs class-transformer
      // Implicit conversion guesses from the TypeScript type and lets "abc"
      // arrive as NaN past @IsInt. Explicit @Type() is verbose and predictable.
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  return app;
}
