import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Database } from '../common/database';
import { Public, Roles } from '../common/security';
import { audit } from '../common/events';
import { id, text, note, parse, page } from '../common/validation';
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  mustChangePassword: true,
  createdAt: true,
};
@ApiTags('Administração')
@Controller()
export class AdminController {
  constructor(private db: Database) {}
  @Roles('ADMIN') @Get('users') users() {
    return this.db.user.findMany({ select: userSelect, orderBy: { name: 'asc' } });
  }
  @Roles('ADMIN') @Post('users') async createUser(@Body() body: any, @Req() r: any) {
    const { password, ...b } = parse(
      z.object({
        name: text,
        email: z.email().transform((s) => s.toLowerCase()),
        role: z.enum(['ADMIN', 'TECHNICIAN', 'ATTENDANT']),
        password: z.string().min(12).max(200),
      }),
      body,
    );
    const passwordHash = await bcrypt.hash(password, 12);
    return this.db.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { ...b, passwordHash }, select: userSelect });
      await audit(tx, r.user, 'Usuário criado', 'User', u.id);
      return u;
    });
  }
  @Roles('ADMIN') @Patch('users/:id') async updateUser(
    @Param('id') key: string,
    @Body() body: any,
    @Req() r: any,
  ) {
    const userId = parse(id, key);
    const b = parse(
      z
        .object({
          name: text.optional(),
          email: z
            .email()
            .transform((s) => s.toLowerCase())
            .optional(),
          role: z.enum(['ADMIN', 'TECHNICIAN', 'ATTENDANT']).optional(),
          active: z.boolean().optional(),
        })
        .strict(),
      body,
    );
    return this.db.serial(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (userId === r.user.id && (b.active === false || (b.role && b.role !== 'ADMIN')))
        throw new BadRequestException('Você não pode desativar ou rebaixar seu próprio acesso.');
      if (
        current.role === 'ADMIN' &&
        current.active &&
        (b.active === false || (b.role && b.role !== 'ADMIN'))
      ) {
        if ((await tx.user.count({ where: { role: 'ADMIN', active: true } })) <= 1)
          throw new BadRequestException('Mantenha pelo menos um administrador ativo.');
      }
      const u = await tx.user.update({
        where: { id: userId },
        data: { ...b, tokenVersion: { increment: 1 } },
        select: userSelect,
      });
      await tx.session.deleteMany({ where: { userId } });
      await audit(tx, r.user, 'Usuário atualizado', 'User', userId);
      return u;
    });
  }
  @Roles('ADMIN') @Delete('users/:id') deactivate(@Param('id') key: string, @Req() r: any) {
    return this.updateUser(key, { active: false }, r);
  }
  // Intencionalmente público: contém somente dados institucionais e termos usados na abertura/impressão de OS.
  @Public() @Get('settings/public') async publicSettings() {
    return this.db.systemSettings.findUnique({
      where: { id: 'main' },
      select: {
        name: true,
        logo: true,
        cnpj: true,
        phone: true,
        whatsapp: true,
        address: true,
        hours: true,
        terms: true,
        warrantyDays: true,
        orderPrefix: true,
        printCopies: true,
      },
    });
  }
  @Roles('ADMIN') @Get('settings') settings() {
    return this.db.systemSettings.findUnique({ where: { id: 'main' } });
  }
  @Roles('ADMIN') @Patch('settings') async updateSettings(@Body() body: any, @Req() r: any) {
    const b = parse(
      z
        .object({
          name: text.optional(),
          logo: z
            .string()
            .max(2000)
            .refine((s) => !s || s.startsWith('https://'), 'Use uma URL HTTPS')
            .optional(),
          cnpj: z.string().max(30).optional(),
          phone: z.string().max(30).optional(),
          whatsapp: z.string().max(30).optional(),
          address: note.optional(),
          hours: z.string().max(500).optional(),
          terms: note.optional(),
          warrantyDays: z.number().int().min(0).max(3650).optional(),
          orderPrefix: z.string().max(12).optional(),
          printCopies: z.number().int().min(1).max(3).optional(),
        })
        .strict(),
      body,
    );
    return this.db.$transaction(async (tx) => {
      const s = await tx.systemSettings.upsert({ where: { id: 'main' }, create: b, update: b });
      await audit(tx, r.user, 'Configurações atualizadas', 'SystemSettings', 'main');
      return s;
    });
  }
  @Roles('ADMIN') @Get('audit') async logs(@Query() q: any) {
    return {
      items: await this.db.auditLog.findMany({ ...page(q), orderBy: { createdAt: 'desc' } }),
      total: await this.db.auditLog.count(),
    };
  }
  @Get('notifications') async notifications(@Query() q: any) {
    return {
      items: await this.db.notification.findMany({ ...page(q), orderBy: { createdAt: 'desc' } }),
    };
  }
}
