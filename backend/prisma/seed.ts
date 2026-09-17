import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const db = new PrismaClient();
async function seed() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase(),
    password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 10)
    throw new Error('Configure ADMIN_EMAIL e ADMIN_PASSWORD com pelo menos 10 caracteres.');
  const existing = await db.user.findUnique({ where: { email } });
  if (!existing) {
    await db.user.create({
      data: {
        email,
        name: process.env.ADMIN_NAME || 'Administrador',
        passwordHash: await bcrypt.hash(password, 12),
        role: 'ADMIN',
        mustChangePassword: true,
      },
    });
  }
  await db.systemSettings.upsert({ where: { id: 'main' }, create: {}, update: {} });
  console.log('Seed concluído. Nenhum dado demonstrativo foi criado.');
}
seed()
  .finally(() => db.$disconnect())
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
