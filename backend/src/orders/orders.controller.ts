import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { OrderStatus } from '@prisma/client';
import { Database } from '../common/database';
import { Roles } from '../common/security';
import { parse, page, cents, id, note } from '../common/validation';
import { OrdersService } from './orders.service';
import { createOrder, updateOrder, addItem } from './orders.dto';
const orderSearchOr = (search: string, role: string) => [
  ...(Number.isInteger(Number(search)) && Number(search) > 0
    ? [{ number: Number(search) }]
    : []),
  { customer: { name: { contains: search, mode: 'insensitive' as const } } },
  { device: { model: { contains: search, mode: 'insensitive' as const } } },
  ...(role === 'TECHNICIAN'
    ? []
    : [
        { customer: { phone: { contains: search } } },
        { device: { imei: { contains: search } } },
      ]),
];
@ApiTags('Ordens de serviço')
@Controller('service-orders')
export class OrdersController {
  constructor(
    private db: Database,
    private service: OrdersService,
  ) {}
  @Get() async list(@Query() q: any, @Req() r: any) {
    const search = String(q.search || '').slice(0, 100);
    const where: any = {
      ...(q.status ? { status: parse(z.nativeEnum(OrderStatus), q.status) } : {}),
      ...(q.technicianId ? { technicianId: parse(id, q.technicianId) } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(parse(z.iso.datetime(), q.from)) } : {}),
              ...(q.to ? { lte: new Date(parse(z.iso.datetime(), q.to)) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: orderSearchOr(search, r.user.role),
          }
        : {}),
    };
    return {
      items: await this.db.serviceOrder.findMany({
        where,
        ...page(q),
        orderBy: { createdAt: 'desc' },
        include: {
          customer:
            r.user.role === 'TECHNICIAN'
              ? { select: { id: true, name: true } }
              : true,
          device: { select: { id: true, brand: true, model: true } },
          technician: { select: { name: true } },
          budget: true,
          payments: true,
        },
      }),
      total: await this.db.serviceOrder.count({ where }),
    };
  }
  @Roles('ADMIN', 'TECHNICIAN', 'ATTENDANT') @Post() create(@Body() b: any, @Req() r: any) {
    return this.service.create(parse(createOrder, b), r.user);
  }
  @Get(':id') detail(@Param('id') key: string, @Req() r: any) {
    return this.service.detail(parse(id, key), r.user);
  }
  @Patch(':id') update(@Param('id') key: string, @Body() b: any, @Req() r: any) {
    return this.service.update(parse(id, key), parse(updateOrder, b), r.user);
  }
  @Roles('ADMIN', 'TECHNICIAN') @Post(':id/status') status(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    const data = parse(z.object({ status: z.nativeEnum(OrderStatus), note: note.default('') }), b);
    return this.service.status(parse(id, key), data.status, data.note, r.user);
  }
  @Roles('ADMIN', 'TECHNICIAN') @Post(':id/items') item(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.service.item(parse(id, key), parse(addItem, b), r.user);
  }
  @Roles('ADMIN', 'TECHNICIAN') @Delete(':id/items/:itemId') remove(
    @Param('id') key: string,
    @Param('itemId') item: string,
    @Req() r: any,
  ) {
    return this.service.removeItem(parse(id, key), parse(id, item), r.user);
  }
  @Roles('ADMIN', 'TECHNICIAN') @Post(':id/budget') budget(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    const data = parse(
      z.object({
        status: z.enum(['PENDING', 'APPROVED', 'REFUSED']),
        discountCents: cents.default(0),
      }),
      b,
    );
    return this.service.budget(parse(id, key), data.status, data.discountCents, r.user);
  }
  @Roles('ADMIN', 'TECHNICIAN') @Post(':id/finalize') finalize(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    const data = parse(z.object({ warrantyDays: z.number().int().min(0).max(3650) }), b);
    return this.service.finalize(parse(id, key), data.warrantyDays, r.user);
  }
  @Roles('ADMIN', 'ATTENDANT') @Post(':id/payments') payment(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    const data = parse(
      z.object({
        amountCents: cents.min(1),
        method: z.enum(['PIX', 'CASH', 'DEBIT', 'CREDIT', 'OTHER']),
        idempotencyKey: id,
      }),
      b,
    );
    return this.service.payment(
      parse(id, key),
      data.amountCents,
      data.method,
      data.idempotencyKey,
      r.user,
    );
  }
  @Roles('ADMIN', 'ATTENDANT') @Post(':id/deliver') deliver(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.service.deliver(
      parse(id, key),
      parse(z.object({ customerId: id }), b).customerId,
      r.user,
    );
  }
  @Roles('ADMIN', 'TECHNICIAN', 'ATTENDANT') @Post(':id/warranty') warranty(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.service.warranty(
      parse(id, key),
      parse(z.object({ problem: note.min(1) }), b).problem,
      r.user,
    );
  }
  @Roles('ADMIN') @Post(':id/cancel') cancel(
    @Param('id') key: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.service.cancel(
      parse(id, key),
      parse(z.object({ note: note.min(1) }), b).note,
      r.user,
    );
  }
}
