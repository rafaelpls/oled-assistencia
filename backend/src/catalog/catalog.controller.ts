import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Database } from '../common/database';
import { Roles, decryptPin, encryptPin } from '../common/security';
import { audit } from '../common/events';
import { id, text, note, cents, phone, parse, page } from '../common/validation';
const customerSchema = z.object({
  name: text,
  phone,
  cpf: z
    .string()
    .regex(/^\d{11}$/)
    .optional()
    .or(z.literal('')),
  email: z.email().optional().or(z.literal('')),
  address: note.optional(),
  notes: note.optional(),
});
const deviceSchema = z.object({
  customerId: id,
  brand: text,
  model: text,
  imei: z
    .string()
    .regex(/^\d{15}$/)
    .optional()
    .or(z.literal('')),
  color: text.optional().or(z.literal('')),
  pin: z.string().max(100).optional(),
  notes: note.optional(),
});
const deviceSelect = {
  id: true,
  customerId: true,
  brand: true,
  model: true,
  imei: true,
  color: true,
  notes: true,
  customer: { select: { name: true } },
};
const technicianDeviceSelect = {
  id: true,
  customerId: true,
  brand: true,
  model: true,
  color: true,
  notes: true,
  customer: { select: { name: true } },
};
const supplierSchema = z.object({
  name: text,
  company: text.optional().or(z.literal('')),
  phone: z.string().max(30).optional(),
  whatsapp: z.string().max(30).optional(),
  email: z.email().optional().or(z.literal('')),
  notes: note.optional(),
});
const productSchema = z
  .object({
    name: text,
    sku: text,
    category: text,
    brand: z.string().max(100).optional(),
    model: z.string().max(150).optional(),
    screenType: z.enum(['LCD', 'Incell', 'OLED', 'AMOLED', 'Original', 'Outro', '']).optional(),
    quality: z.string().max(100).optional(),
    supplierId: id.nullable().optional(),
    costCents: cents.optional(),
    saleCents: cents,
    installationCents: cents.optional(),
    minStock: z.number().int().min(0).max(100000).optional(),
    location: z.string().max(100).optional(),
    notes: note.optional(),
    active: z.boolean().optional(),
  })
  .strict();
@ApiTags('Cadastros')
@Controller()
export class CatalogController {
  constructor(private db: Database) {}
  @Roles('ADMIN', 'ATTENDANT', 'TECHNICIAN') @Get('customers') async customers(
    @Query() q: any,
    @Req() r: any,
  ) {
    const s = String(q.search || '').slice(0, 100);
    const where = s
      ? {
          OR: [
            { name: { contains: s, mode: 'insensitive' as const } },
            { phone: { contains: s.replace(/\D/g, '') || s } },
            { cpf: { contains: s } },
          ],
        }
      : {};
    if (r.user.role === 'TECHNICIAN') {
      if (s.trim().length < 3) return { items: [], total: 0 };
      const items = await this.db.customer.findMany({
        where,
        take: Math.min(10, page(q).take),
        skip: 0,
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      return { items, total: items.length };
    }
    return {
      items: await this.db.customer.findMany({ where, ...page(q), orderBy: { name: 'asc' } }),
      total: await this.db.customer.count({ where }),
    };
  }
  @Roles('ADMIN', 'ATTENDANT') @Post('customers') async createCustomer(
    @Body() b: any,
    @Req() r: any,
  ) {
    const data = parse(customerSchema, b);
    return this.db.serial(async (tx) => {
      const existing = await tx.customer.findUnique({ where: { phone: data.phone } });
      if (existing) return { customer: existing, existing: true };
      const c = await tx.customer.create({ data });
      await audit(tx, r.user, 'Cliente criado', 'Customer', c.id);
      return { customer: c, existing: false };
    });
  }
  @Roles('ADMIN', 'ATTENDANT') @Get('customers/:id') async customer(@Param('id') key: string) {
    const c = await this.db.customer.findUnique({
      where: { id: parse(id, key) },
      include: {
        devices: { select: deviceSelect },
        orders: {
          orderBy: { createdAt: 'desc' },
          include: { device: { select: deviceSelect }, warranty: true, items: true },
        },
      },
    });
    if (!c) throw new NotFoundException();
    return c;
  }
  @Roles('ADMIN', 'ATTENDANT') @Patch('customers/:id') async updateCustomer(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    const data = parse(customerSchema.partial(), b);
    return this.db.$transaction(async (tx) => {
      const c = await tx.customer.update({ where: { id: parse(id, key) }, data });
      await audit(tx, r.user, 'Cliente atualizado', 'Customer', c.id);
      return c;
    });
  }
  @Get('devices') async devices(@Query() q: any, @Req() r: any) {
    const s = String(q.search || '').slice(0, 100);
    const where = {
      ...(q.customerId ? { customerId: parse(id, q.customerId) } : {}),
      ...(s
        ? {
            OR: [
              { model: { contains: s, mode: 'insensitive' as const } },
              { customer: { name: { contains: s, mode: 'insensitive' as const } } },
              ...(r.user.role === 'TECHNICIAN' ? [] : [{ imei: { contains: s } }]),
            ],
          }
        : {}),
    };
    return {
      items: await this.db.device.findMany({
        where,
        ...page(q),
        select: r.user.role === 'TECHNICIAN' ? technicianDeviceSelect : deviceSelect,
      }),
      total: await this.db.device.count({ where }),
    };
  }
  @Roles('ADMIN', 'ATTENDANT') @Post('devices') async createDevice(@Body() b: any, @Req() r: any) {
    const { pin, ...data } = parse(deviceSchema, b);
    return this.db.$transaction(async (tx) => {
      const d = await tx.device.create({
        data: { ...data, pinEncrypted: encryptPin(pin) },
        select: deviceSelect,
      });
      await audit(tx, r.user, 'Aparelho criado', 'Device', d.id);
      return d;
    });
  }
  @Get('devices/:id') async device(@Param('id') key: string, @Req() r: any) {
    const d = await this.db.device.findUnique({
      where: { id: parse(id, key) },
      select: {
        ...(r.user.role === 'TECHNICIAN' ? technicianDeviceSelect : deviceSelect),
        orders: { include: { warranty: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!d) throw new NotFoundException();
    return d;
  }
  @Roles('ADMIN', 'TECHNICIAN') @Post('devices/:id/reveal-pin') async revealPin(
    @Param('id') key: string,
    @Req() r: any,
  ) {
    const d = await this.db.device.findUniqueOrThrow({ where: { id: parse(id, key) } });
    await audit(this.db, r.user, 'Consulta de PIN', 'Device', d.id);
    return { pin: d.pinEncrypted ? decryptPin(d.pinEncrypted) : null };
  }
  @Get('technicians') technicians() {
    return this.db.user.findMany({
      where: { active: true, role: { in: ['ADMIN', 'TECHNICIAN'] } },
      select: { id: true, name: true },
    });
  }
  @Roles('ADMIN') @Get('suppliers') suppliers() {
    return this.db.supplier.findMany({ orderBy: { name: 'asc' } });
  }
  @Roles('ADMIN') @Post('suppliers') async supplierCreate(@Body() b: any, @Req() r: any) {
    return this.db.$transaction(async (tx) => {
      const s = await tx.supplier.create({ data: parse(supplierSchema, b) });
      await audit(tx, r.user, 'Fornecedor criado', 'Supplier', s.id);
      return s;
    });
  }
  @Roles('ADMIN') @Patch('suppliers/:id') async supplierUpdate(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.db.$transaction(async (tx) => {
      const s = await tx.supplier.update({
        where: { id: parse(id, key) },
        data: parse(supplierSchema.partial(), b),
      });
      await audit(tx, r.user, 'Fornecedor atualizado', 'Supplier', s.id);
      return s;
    });
  }
  @Get('products') products(@Query() q: any, @Req() r: any) {
    return this.productList(q, r.user.role === 'ADMIN');
  }
  @Get('screens') screens(@Query() q: any, @Req() r: any) {
    return this.productList({ ...q, category: 'Telas' }, r.user.role === 'ADMIN');
  }
  async productList(q: any, admin: boolean) {
    const s = String(q.search || '').slice(0, 100);
    const where: any = {
      ...(admin && q.includeInactive === 'true'
        ? {}
        : admin && q.active === 'false'
          ? { active: false }
          : { active: true }),
      ...(s
        ? {
            OR: ['name', 'sku', 'model'].map((f) => ({
              [f]: { contains: s, mode: 'insensitive' },
            })),
          }
        : {}),
      ...Object.fromEntries(
        ['category', 'brand', 'screenType', 'quality', 'supplierId']
          .filter((f) => q[f])
          .map((f) => [f, String(q[f])]),
      ),
      ...(q.available === 'true' ? { stock: { gt: 0 } } : {}),
    };
    const items = await this.db.product.findMany({
      where,
      ...page(q),
      include: { supplier: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return {
      items: items.map((p) => {
        if (admin) return p;
        const { costCents, ...safe } = p;
        return safe;
      }),
      total: await this.db.product.count({ where }),
    };
  }
  @Roles('ADMIN') @Post('products') async productCreate(@Body() b: any, @Req() r: any) {
    return this.db.$transaction(async (tx) => {
      const p = await tx.product.create({ data: parse(productSchema, b) });
      await audit(tx, r.user, 'Produto criado', 'Product', p.id);
      return p;
    });
  }
  @Roles('ADMIN') @Patch('products/:id') async productUpdate(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.db.$transaction(async (tx) => {
      const p = await tx.product.update({
        where: { id: parse(id, key) },
        data: parse(productSchema.partial(), b),
      });
      await audit(tx, r.user, 'Produto/preço atualizado', 'Product', p.id);
      return p;
    });
  }
  @Roles('ADMIN') @Get('stock') async stock(@Query() q: any) {
    return {
      items: await this.db.stockMovement.findMany({
        ...page(q),
        where: q.productId ? { productId: parse(id, q.productId) } : {},
        include: { product: { select: { name: true, sku: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    };
  }
  @Roles('ADMIN') @Post('stock/movement') async movement(@Body() body: any, @Req() r: any) {
    const b = parse(
      z
        .object({
          productId: id,
          kind: z.enum(['ENTRY', 'EXIT', 'ADJUSTMENT']),
          quantity: z.number().int().min(1).max(100000),
          direction: z.enum(['IN', 'OUT']).optional(),
          note: note.min(1),
        })
        .refine((value) => value.kind !== 'ADJUSTMENT' || !!value.direction, {
          message: 'Informe direction IN ou OUT para ajuste de estoque.',
          path: ['direction'],
        }),
      body,
    );
    return this.db.serial(async (tx) => {
      const delta =
        b.kind === 'EXIT' || (b.kind === 'ADJUSTMENT' && b.direction === 'OUT')
          ? -b.quantity
          : b.quantity;
      const updated = await tx.product.updateMany({
        where: { id: b.productId, ...(delta < 0 ? { stock: { gte: -delta } } : {}) },
        data: { stock: { increment: delta } },
      });
      if (!updated.count)
        throw new BadRequestException('Produto inexistente ou estoque insuficiente.');
      const p = await tx.product.findUniqueOrThrow({ where: { id: b.productId } });
      const m = await tx.stockMovement.create({
        data: {
          productId: b.productId,
          kind: b.kind,
          quantity: delta,
          balance: p.stock,
          note: b.note,
          userId: r.user.id,
        },
      });
      await audit(tx, r.user, 'Movimentação de estoque', 'Product', p.id);
      if (p.stock <= p.minStock)
        await tx.notification.create({
          data: { message: `Estoque baixo: ${p.name} (${p.stock})` },
        });
      return m;
    });
  }
}
