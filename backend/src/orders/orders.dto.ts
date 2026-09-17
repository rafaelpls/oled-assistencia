import { z } from 'zod';
import { text, note, cents, id } from '../common/validation';
export const checklistKeys = [
  'Tela',
  'Carcaça',
  'Tampa traseira',
  'Câmeras',
  'Botões',
  'Conector de carga',
  'Alto-falante',
  'Microfone',
  'Biometria',
  'Face ID',
  'Wi-Fi',
  'Bluetooth',
  'Outros',
];
export const createOrder = z.object({
  customerId: id,
  deviceId: id,
  problem: note.min(1),
  physicalState: note.optional(),
  accessories: z
    .array(
      z.enum([
        'Aparelho',
        'Carregador',
        'Cabo',
        'Capinha',
        'Cartão de memória',
        'Chip',
        'Fone',
        'Outros',
      ]),
    )
    .max(8)
    .optional(),
  checklist: z
    .record(
      z.enum(checklistKeys as [string, ...string[]]),
      z.enum(['OK', 'DANIFICADO', 'NÃO TESTADO', 'NÃO POSSUI']),
    )
    .optional(),
  notes: note.optional(),
  estimatedCents: cents.optional(),
  technicianId: id.nullable().optional(),
});
export const updateOrder = z
  .object({
    problem: note.min(1).optional(),
    physicalState: note.optional(),
    notes: note.optional(),
    diagnosis: note.optional(),
    estimatedCents: cents.optional(),
    technicianId: id.nullable().optional(),
  })
  .strict();
export const addItem = z.object({
  type: z.enum(['SERVICE', 'PART', 'LABOR']),
  description: text,
  productId: id.optional(),
  quantity: z.number().int().min(1).max(1000),
  unitCents: cents,
});
