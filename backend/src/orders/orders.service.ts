import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { Database } from '../common/database';
import { Actor } from '../common/security';
import { orderEvent } from '../common/events';
const userSelect = { id: true, name: true, role: true };
const technicianCustomerSelect = { id: true, name: true };
const detailDeviceSelect = {
  id: true,
  brand: true,
  model: true,
  imei: true,
  color: true,
  notes: true,
  customerId: true,
};
const technicianDetailDeviceSelect = {
  id: true,
  brand: true,
  model: true,
  color: true,
  notes: true,
  customerId: true,
};
export const detailInclude = {
  customer: true,
  device: { select: detailDeviceSelect },
  technician: { select: userSelect },
  photos: { select: { id: true, type: true, userName: true, createdAt: true } },
  history: { orderBy: { createdAt: 'asc' as const } },
  items: true,
  budget: true,
  payments: true,
  warranty: true,
  warrantyOrders: { select: { id: true, number: true, status: true } },
};
export const technicianDetailInclude = {
  ...detailInclude,
  customer: { select: technicianCustomerSelect },
  device: { select: technicianDetailDeviceSelect },
};
export const orderDetailInclude = (user: Actor) =>
  user.role === 'TECHNICIAN' ? technicianDetailInclude : detailInclude;
export const settled = (o: { finalCents: number; payments: { amountCents: number }[] }) =>
  o.payments.reduce((s, p) => s + p.amountCents, 0) >= o.finalCents;
export function assertFinalizable(o: {
  status: OrderStatus;
  photos: { type: string }[];
  budget: { status: string } | null;
}) {
  if (!['REPAIR', 'FINALIZED'].includes(o.status))
    throw new BadRequestException('Inicie o reparo antes de finalizar.');
  if (o.budget?.status !== 'APPROVED')
    throw new BadRequestException('O orçamento precisa estar aprovado.');
  if (!o.photos.some((p) => p.type === 'FINALIZATION'))
    throw new BadRequestException(
      'Para finalizar esta Ordem de Serviço é necessário registrar uma foto do aparelho.',
    );
}
export function assertDeliverable(
  o: {
    status: OrderStatus;
    finalCents: number;
    payments: { amountCents: number }[];
    customerId: string;
  },
  customerId: string,
) {
  if (o.status !== 'AWAITING_PICKUP')
    throw new BadRequestException('A OS precisa estar aguardando retirada.');
  if (o.customerId !== customerId) throw new BadRequestException('Confirme o cliente da OS.');
  if (!settled(o))
    throw new BadRequestException('Existe valor pendente. Registre o pagamento antes de entregar.');
}
@Injectable()
export class OrdersService {
  constructor(private db: Database) {}
  async detail(id: string, user: Actor) {
    const o = await this.db.serviceOrder.findUnique({ where: { id }, include: orderDetailInclude(user) });
    if (!o) throw new NotFoundException('OS não encontrada.');
    return o;
  }
  async lock(tx: Prisma.TransactionClient, id: string) {
    const o = await tx.serviceOrder.findUnique({
      where: { id },
      include: { photos: true, items: true, budget: true, payments: true },
    });
    if (!o) throw new NotFoundException('OS não encontrada.');
    return o;
  }
  editable(status: OrderStatus) {
    if (['DELIVERED', 'CANCELLED', 'AWAITING_PICKUP', 'FINALIZED'].includes(status))
      throw new BadRequestException('Esta OS não aceita alterações operacionais.');
  }
  async create(b: any, user: Actor) {
    return this.db.serial(async (tx) => {
      const device = await tx.device.findUnique({ where: { id: b.deviceId } });
      if (!device || device.customerId !== b.customerId)
        throw new BadRequestException('O aparelho deve pertencer ao cliente selecionado.');
      if (b.technicianId) {
        const t = await tx.user.findUnique({ where: { id: b.technicianId } });
        if (!t?.active || t.role === 'ATTENDANT')
          throw new BadRequestException('Técnico inválido.');
      }
      const settings = await tx.systemSettings.findUnique({ where: { id: 'main' } });
      const o = await tx.serviceOrder.create({
        data: {
          ...b,
          warrantyDays: settings?.warrantyDays ?? 90,
          termsSnapshot: settings?.terms ?? '',
        },
      });
      await orderEvent(tx, user, o, 'OPEN', 'Ordem de serviço aberta');
      return o;
    });
  }
  async update(id: string, b: any, user: Actor) {
    return this.db.serial(async (tx) => {
      const o = await this.lock(tx, id);
      this.editable(o.status);
      if (user.role === 'ATTENDANT' && ('diagnosis' in b || 'technicianId' in b))
        throw new ForbiddenException();
      if (b.technicianId) {
        const t = await tx.user.findUnique({ where: { id: b.technicianId } });
        if (!t?.active || t.role === 'ATTENDANT')
          throw new BadRequestException('Técnico inválido.');
      }
      const r = await tx.serviceOrder.update({ where: { id }, data: b });
      await orderEvent(tx, user, o, o.status, 'Dados da OS atualizados');
      return r;
    });
  }
  async status(id: string, next: OrderStatus, note: string, user: Actor) {
    return this.db.serial(async (tx) => {
      const o = await this.lock(tx, id);
      this.editable(o.status);
      if (
        ![
          'AWAITING_DIAGNOSIS',
          'ANALYSIS',
          'AWAITING_APPROVAL',
          'AWAITING_PART',
          'REPAIR',
        ].includes(next)
      )
        throw new BadRequestException(
          'Use a ação específica de finalização, entrega ou cancelamento.',
        );
      if (user.role === 'ATTENDANT') throw new ForbiddenException();
      if (next === 'REPAIR' && o.budget?.status !== 'APPROVED')
        throw new BadRequestException('Aprove o orçamento antes de iniciar o reparo.');
      const r = await tx.serviceOrder.update({ where: { id }, data: { status: next } });
      await orderEvent(tx, user, o, next, note || 'Status atualizado');
      return r;
    });
  }
  async item(id: string, b: any, user: Actor) {
    return this.db.serial(async (tx) => {
      const o = await this.lock(tx, id);
      this.editable(o.status);
      if (o.budget?.status === 'APPROVED')
        throw new BadRequestException('O orçamento aprovado não pode ser alterado.');
      if (b.productId) {
        const p = await tx.product.findUnique({ where: { id: b.productId } });
        if (!p?.active) throw new BadRequestException('Produto inválido.');
        if (b.type !== 'PART') throw new BadRequestException('Vincule produtos como peças.');
      }
      await tx.serviceOrderItem.create({ data: { ...b, orderId: id } });
      await this.recalculate(tx, id, user);
      await orderEvent(tx, user, o, o.status, 'Item adicionado ao orçamento');
      return { ok: true };
    });
  }
  async removeItem(id: string, itemId: string, user: Actor) {
    return this.db.serial(async (tx) => {
      const o = await this.lock(tx, id);
      this.editable(o.status);
      if (o.budget?.status === 'APPROVED') throw new BadRequestException('Orçamento aprovado.');
      const deleted = await tx.serviceOrderItem.deleteMany({
        where: { id: itemId, orderId: id, stockDeducted: false },
      });
      if (!deleted.count)
        throw new BadRequestException('Item não encontrado, pertence a outra OS ou já teve estoque baixado.');
      await this.recalculate(tx, id, user);
      await orderEvent(tx, user, o, o.status, 'Item removido do orçamento');
      return { ok: true };
    });
  }
  async recalculate(tx: Prisma.TransactionClient, id: string, user: Actor, discount?: number) {
    const items = await tx.serviceOrderItem.findMany({ where: { orderId: id } });
    const budget = await tx.budget.findUnique({ where: { orderId: id } });
    const subtotal = items.reduce((s, x) => s + x.unitCents * x.quantity, 0);
    const d = discount ?? budget?.discountCents ?? 0;
    if (d > subtotal) throw new BadRequestException('Desconto maior que o subtotal.');
    const totalCents = subtotal - d;
    await tx.budget.upsert({
      where: { orderId: id },
      create: { orderId: id, totalCents, discountCents: d, userId: user.id },
      update: { totalCents, discountCents: d, status: 'PENDING', userId: user.id },
    });
    await tx.serviceOrder.update({ where: { id }, data: { finalCents: totalCents } });
  }
  async budget(id: string, status: string, discount: number, user: Actor) {
    return this.db.serial(async (tx) => {
      const o = await this.lock(tx, id);
      this.editable(o.status);
      if (o.budget?.status === 'APPROVED')
        throw new BadRequestException('Orçamento já confirmado.');
      if (!o.items.length) throw new BadRequestException('Adicione pelo menos um serviço ou peça.');
      await this.recalculate(tx, id, user, discount);
      if (status === 'APPROVED') {
        for (const item of o.items) {
          if (item.productId && !item.stockDeducted) {
            const changed = await tx.product.updateMany({
              where: { id: item.productId, active: true, stock: { gte: item.quantity } },
              data: { stock: { decrement: item.quantity } },
            });
            if (!changed.count)
              throw new BadRequestException(`Estoque insuficiente: ${item.description}`);
            const p = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
            await tx.stockMovement.create({
              data: {
                productId: p.id,
                orderId: id,
                kind: 'ORDER',
                quantity: -item.quantity,
                balance: p.stock,
                note: `Uso na OS #${o.number}`,
                userId: user.id,
              },
            });
            await tx.serviceOrderItem.update({
              where: { id: item.id },
              data: { stockDeducted: true },
            });
            if (p.stock <= p.minStock)
              await tx.notification.create({
                data: { message: `Estoque baixo: ${p.name} (${p.stock})` },
              });
          }
        }
      }
      await tx.budget.update({ where: { orderId: id }, data: { status, userId: user.id } });
      await orderEvent(
        tx,
        user,
        o,
        o.status,
        `Orçamento ${status === 'APPROVED' ? 'aprovado' : status === 'REFUSED' ? 'recusado' : 'atualizado'}`,
      );
      return { ok: true };
    });
  }
  async finalize(id: string, warrantyDays: number, user: Actor) {
    return this.db.serial(async (tx) => {
      const o = await this.lock(tx, id);
      assertFinalizable(o);
      const r = await tx.serviceOrder.update({
        where: { id },
        data: { status: 'AWAITING_PICKUP', completedAt: new Date(), warrantyDays },
      });
      await orderEvent(tx, user, o, 'AWAITING_PICKUP', 'Serviço finalizado. Aguardando retirada');
      return r;
    });
  }
  async payment(id: string, amountCents: number, method: string, key: string, user: Actor) {
    return this.db.serial(async (tx) => {
      const previous = await tx.payment.findUnique({ where: { idempotencyKey: key } });
      if (previous) {
        if (
          previous.orderId !== id ||
          previous.amountCents !== amountCents ||
          previous.method !== method
        )
          throw new BadRequestException('Identificador de pagamento já utilizado.');
        return previous;
      }
      const o = await this.lock(tx, id);
      if (['CANCELLED', 'DELIVERED'].includes(o.status) || o.budget?.status !== 'APPROVED')
        throw new BadRequestException('A OS não aceita pagamento.');
      const paid = o.payments.reduce((s, p) => s + p.amountCents, 0);
      if (amountCents > o.finalCents - paid)
        throw new BadRequestException('Pagamento maior que o saldo pendente.');
      const p = await tx.payment.create({
        data: { orderId: id, amountCents, method, idempotencyKey: key, userId: user.id },
      });
      await orderEvent(tx, user, o, o.status, 'Pagamento registrado');
      return p;
    });
  }
  async deliver(id: string, customerId: string, user: Actor) {
    return this.db.serial(async (tx) => {
      const o = await this.lock(tx, id);
      assertDeliverable(o, customerId);
      const now = new Date();
      const r = await tx.serviceOrder.update({
        where: { id },
        data: { status: 'DELIVERED', deliveredAt: now },
      });
      await tx.warranty.create({
        data: {
          orderId: id,
          startsAt: now,
          endsAt: new Date(now.getTime() + o.warrantyDays * 86400000),
        },
      });
      await tx.device.update({ where: { id: o.deviceId }, data: { pinEncrypted: null } });
      await orderEvent(tx, user, o, 'DELIVERED', 'Aparelho entregue; garantia iniciada');
      return r;
    });
  }
  async warranty(id: string, problem: string, user: Actor) {
    return this.db.serial(async (tx) => {
      const o = await tx.serviceOrder.findUnique({ where: { id }, include: { warranty: true } });
      if (!o || o.status !== 'DELIVERED' || !o.warranty || o.warranty.endsAt < new Date())
        throw new BadRequestException('A garantia desta OS não está vigente.');
      const r = await tx.serviceOrder.create({
        data: {
          customerId: o.customerId,
          deviceId: o.deviceId,
          problem,
          originalOrderId: id,
          status: 'WARRANTY',
          warrantyDays: o.warrantyDays,
          termsSnapshot: o.termsSnapshot,
        },
      });
      await orderEvent(tx, user, r, 'WARRANTY', `OS em garantia vinculada à #${o.number}`);
      return r;
    });
  }
  async cancel(id: string, note: string, user: Actor) {
    return this.db.serial(async (tx) => {
      const o = await this.lock(tx, id);
      if (['CANCELLED', 'DELIVERED'].includes(o.status))
        throw new BadRequestException('Esta OS não pode ser cancelada.');
      if (o.payments.length)
        throw new BadRequestException('OS com pagamentos não pode ser cancelada.');
      for (const item of o.items) {
        if (item.stockDeducted && item.productId) {
          const p = await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
          await tx.stockMovement.create({
            data: {
              productId: p.id,
              orderId: id,
              kind: 'RETURN',
              quantity: item.quantity,
              balance: p.stock,
              note: 'Cancelamento da OS',
              userId: user.id,
            },
          });
          await tx.serviceOrderItem.update({
            where: { id: item.id },
            data: { stockDeducted: false },
          });
        }
      }
      const r = await tx.serviceOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
      await orderEvent(tx, user, o, 'CANCELLED', `OS cancelada: ${note}`);
      return r;
    });
  }
}
