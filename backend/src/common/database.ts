import { Global, Injectable, Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
@Injectable()
export class Database extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
  async serial<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let n = 0; ; n++) {
      try {
        return await this.$transaction(fn, { isolationLevel: 'Serializable', timeout: 15000 });
      } catch (e: any) {
        if (e.code !== 'P2034' || n >= 4) throw e;
      }
    }
  }
}
@Global()
@Module({ providers: [Database], exports: [Database] })
export class DatabaseModule {}
