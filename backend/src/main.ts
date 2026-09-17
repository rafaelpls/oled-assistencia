import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { ArgumentsHost, Catch, Controller, ExceptionFilter, Get, HttpException, Module } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { Database, DatabaseModule } from './common/database';
import { AccessGuard, Public } from './common/security';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { OrdersModule } from './orders/orders.module';
import { AdminController } from './admin/admin.controller';
import { ReportsController } from './reports/reports.controller';
@Catch()
class Errors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (error instanceof HttpException)
      return res
        .status(error.getStatus())
        .json({
          message:
            typeof error.getResponse() === 'string'
              ? error.getResponse()
              : (error.getResponse() as any).message,
        });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const code = error.code;
      return res
        .status(code === 'P2025' ? 404 : 409)
        .json({
          message:
            code === 'P2002'
              ? 'Já existe um cadastro com este identificador.'
              : code === 'P2025'
                ? 'Registro não encontrado.'
                : 'Não foi possível concluir a operação. Confira os vínculos e tente novamente.',
        });
    }
    console.error('Unhandled API error', error?.name, error?.message);
    return res.status(500).json({ message: 'Não foi possível concluir a operação.' });
  }
}
@Controller('health')
class HealthController {
  constructor(private db: Database) {}

  @Public()
  @Get()
  async check() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok' };
  }
}
@Module({
  imports: [DatabaseModule, AuthModule, CatalogModule, OrdersModule],
  controllers: [AdminController, ReportsController, HealthController],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
function trustProxyValue(value?: string) {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric >= 0 ? numeric : value;
}
export async function bootstrap() {
  if (
    !process.env.DATABASE_URL ||
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32 ||
    !/^[a-f0-9]{64}$/i.test(process.env.PIN_ENCRYPTION_KEY || '')
  )
    throw new Error(
      'Configure DATABASE_URL, JWT_SECRET (mínimo 32 caracteres) e PIN_ENCRYPTION_KEY (64 hex).',
    );
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxyValue(process.env.TRUST_PROXY));
  app.use(helmet());
  app.use(cookieParser());
  const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
  app.enableCors({ origin, credentials: true });
  app.use((req: any, res: any, next: any) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !req.headers.authorization &&
      req.headers.origin !== origin
    )
      return res.status(403).json({ message: 'Origem da solicitação inválida.' });
    next();
  });
  app.use(
    ['/auth/login', '/auth/refresh'],
    rateLimit({
      windowMs: 15 * 60000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Muitas tentativas. Aguarde 15 minutos.' },
    }),
  );
  app.useGlobalFilters(new Errors());
  if (process.env.SWAGGER_ENABLED === 'true') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('OLED API')
        .setDescription(
          'API de assistência técnica. Sessões em cookies HttpOnly. Endpoints protegidos por RBAC.',
        )
        .setVersion('1.0')
        .addCookieAuth('oled_access')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT) || 4000, '0.0.0.0');
  return app;
}
if (require.main === module)
  bootstrap().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
