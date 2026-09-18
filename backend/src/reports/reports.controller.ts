import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Database } from '../common/database';
import { Roles } from '../common/security';
import { parse, id, page } from '../common/validation';
const orderSearchOr = (s: string, role: string) => [
  ...(Number.isInteger(Number(s)) && Number(s) > 0 ? [{ number: Number(s) }] : []),
  { customer: { name: { contains: s, mode: 'insensitive' as const } } },
  { device: { model: { contains: s, mode: 'insensitive' as const } } },
  ...(role === 'TECHNICIAN'
    ? []
    : [
        { customer: { phone: { contains: s } } },
        { customer: { cpf: { contains: s } } },
        { device: { imei: { contains: s } } },
      ]),
];
const deviceSearchOr = (s: string, role: string) => [
  { model: { contains: s, mode: 'insensitive' as const } },
  ...(role === 'TECHNICIAN' ? [] : [{ imei: { contains: s } }]),
];
@ApiTags('Consultas e relatórios')
@Controller()
export class ReportsController {
  constructor(private db: Database) {}
  @Get('dashboard') async dashboard(@Req() r: any) {
    const counts = await this.db.serviceOrder.groupBy({ by: ['status'], _count: { _all: true } });
    const recent = await this.db.serviceOrder.findMany({
      take: 8,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        number: true,
        status: true,
        problem: true,
        createdAt: true,
        customer: { select: { name: true } },
        device: { select: { brand: true, model: true } },
        technician: { select: { name: true } },
      },
    });
    const base = {
      counts: Object.fromEntries(counts.map((x) => [x.status, x._count._all])),
      recent,
    };
    if (r.user.role !== 'ADMIN') return base;
    const month = new Date();
    month.setDate(1);
    month.setHours(0, 0, 0, 0);
    const [revenue, lowStock, technicians, services, parts] = await Promise.all([
      this.db.payment.aggregate({
        where: { createdAt: { gte: month } },
        _sum: { amountCents: true },
      }),
      this.db.product.findMany({
        where: { active: true, stock: { lte: this.db.product.fields.minStock } },
        take: 10,
        select: { id: true, name: true, stock: true, minStock: true },
      }),
      this.db.serviceOrder.groupBy({
        by: ['technicianId'],
        where: { technicianId: { not: null } },
        _count: { _all: true },
      }),
      this.db.serviceOrderItem.groupBy({
        by: ['description'],
        where: { type: { in: ['SERVICE', 'LABOR'] } },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 5,
      }),
      this.db.stockMovement.aggregate({
        where: { kind: 'ORDER', createdAt: { gte: month } },
        _sum: { quantity: true },
      }),
    ]);
    const users = await this.db.user.findMany({ select: { id: true, name: true } });
    return {
      ...base,
      revenueCents: revenue._sum.amountCents || 0,
      lowStock,
      partsUsed: -(parts._sum.quantity || 0),
      services,
      technicians: technicians.map((t) => ({
        name: users.find((u) => u.id === t.technicianId)?.name,
        count: t._count._all,
      })),
    };
  }
  @Get('search') async search(@Query('q') raw: string, @Req() r: any) {
    const s = String(raw || '')
      .trim()
      .slice(0, 100);
    if (s.length < 2) return { orders: [], customers: [], devices: [], products: [] };
    const orders = await this.db.serviceOrder.findMany({
      where: {
        OR: orderSearchOr(s, r.user.role),
      },
      take: 8,
      select: {
        id: true,
        number: true,
        status: true,
        customer: { select: { name: true } },
        device: { select: { model: true } },
      },
    });
    return {
      orders,
      customers:
        r.user.role === 'TECHNICIAN'
          ? []
          : await this.db.customer.findMany({
              where: {
                OR: [
                  { name: { contains: s, mode: 'insensitive' } },
                  { phone: { contains: s } },
                  { cpf: { contains: s } },
                ],
              },
              take: 5,
              select: { id: true, name: true, phone: true },
            }),
      devices: await this.db.device.findMany({
        where: { OR: deviceSearchOr(s, r.user.role) },
        take: 5,
        select: { id: true, model: true, brand: true },
      }),
      products: await this.db.product.findMany({
        where: {
          active: true,
          OR: [
            { sku: { contains: s, mode: 'insensitive' } },
            { model: { contains: s, mode: 'insensitive' } },
            { name: { contains: s, mode: 'insensitive' } },
          ],
        },
        take: 5,
        select: { id: true, name: true, sku: true, saleCents: true, stock: true },
      }),
    };
  }
  @Roles('ADMIN') @Get('payments') async payments(@Query() q: any) {
    return {
      items: await this.db.payment.findMany({
        ...page(q),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          orderId: true,
          amountCents: true,
          method: true,
          createdAt: true,
          order: { select: { number: true, customer: { select: { name: true } } } },
        },
      }),
    };
  }
  @Roles('ADMIN') @Get('reports') async reports(@Query() q: any) {
    const createdAt = {
      ...(q.from ? { gte: new Date(parse(z.iso.datetime(), q.from)) } : {}),
      ...(q.to ? { lte: new Date(parse(z.iso.datetime(), q.to)) } : {}),
    };
    const where: any = {
      createdAt,
      ...(q.status
        ? {
            status: parse(
              z.enum([
                'OPEN',
                'AWAITING_DIAGNOSIS',
                'ANALYSIS',
                'AWAITING_APPROVAL',
                'AWAITING_PART',
                'REPAIR',
                'FINALIZED',
                'AWAITING_PICKUP',
                'DELIVERED',
                'CANCELLED',
                'WARRANTY',
              ]),
              q.status,
            ),
          }
        : {}),
      ...(q.technicianId ? { technicianId: parse(id, q.technicianId) } : {}),
      ...(q.productId ? { items: { some: { productId: parse(id, q.productId) } } } : {}),
      ...(q.service
        ? {
            items: {
              some: {
                description: { contains: String(q.service).slice(0, 100), mode: 'insensitive' },
              },
            },
          }
        : {}),
    };
    const orders = await this.db.serviceOrder.findMany({
      where,
      take: 5000,
      orderBy: { createdAt: 'desc' },
      select: {
        number: true,
        status: true,
        createdAt: true,
        finalCents: true,
        customer: { select: { name: true } },
        device: { select: { model: true } },
        technician: { select: { name: true } },
        items: { select: { description: true, quantity: true, type: true, stockDeducted: true } },
        warranty: true,
      },
    });
    const total = await this.db.serviceOrder.count({ where });
    const payments = await this.db.payment.aggregate({
      where: { createdAt, order: { ...where, createdAt: undefined } },
      _sum: { amountCents: true },
    });
    return {
      orders,
      total,
      truncated: total > 5000,
      revenueCents: payments._sum.amountCents || 0,
      stock: await this.db.product.findMany({
        where: { active: true, ...(q.productId ? { id: parse(id, q.productId) } : {}) },
        select: { name: true, sku: true, stock: true, minStock: true },
      }),
    };
  }
}
