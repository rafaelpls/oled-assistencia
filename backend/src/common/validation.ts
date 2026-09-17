import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
export const text = z.string().trim().min(1).max(250);
export const note = z.string().trim().max(5000);
export const cents = z.number().int().min(0).max(100000000);
export const id = z.string().uuid();
export const phone = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().min(10).max(15));
export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  return r.data;
}
export function page(q: any) {
  return {
    take: Math.min(100, Math.max(1, Number(q.limit) || 25)),
    skip:
      Math.max(0, (Number(q.page) || 1) - 1) * Math.min(100, Math.max(1, Number(q.limit) || 25)),
  };
}
