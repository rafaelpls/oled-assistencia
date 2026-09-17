import { Prisma, OrderStatus } from '@prisma/client';
import { Actor } from './security';
export async function audit(
  tx: Prisma.TransactionClient,
  user: Actor,
  action: string,
  entity: string,
  entityId: string,
) {
  await tx.auditLog.create({
    data: { userId: user.id, userName: user.name, action, entity, entityId },
  });
}
export async function orderEvent(
  tx: Prisma.TransactionClient,
  user: Actor,
  order: { id: string; number: number; status: OrderStatus },
  next: OrderStatus,
  note: string,
) {
  await tx.serviceOrderStatusHistory.create({
    data: {
      orderId: order.id,
      userId: user.id,
      userName: user.name,
      previousStatus: order.status,
      newStatus: next,
      note,
    },
  });
  await audit(tx, user, note, 'ServiceOrder', order.id);
  await tx.notification.create({
    data: { message: `OS #${order.number}: ${note}`, orderId: order.id },
  });
  await tx.outboxEvent.create({
    data: {
      event: 'order.updated',
      orderId: order.id,
      payload: { number: order.number, status: next },
    },
  });
}
