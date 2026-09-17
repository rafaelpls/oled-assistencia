import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { Database } from '../common/database';
import { audit } from '../common/events';
import { Actor } from '../common/security';
export const hash = (s: string) => createHash('sha256').update(s).digest('hex');
@Injectable()
export class AuthService {
  constructor(private db: Database) {}
  async login(email: string, password: string) {
    const user = await this.db.user.findUnique({ where: { email: email.toLowerCase() } });
    const valid = await bcrypt.compare(
      password,
      user?.passwordHash || '$2b$12$C6UzMDM.H6dfI/f/IKcEe.1vGp9fHdXbdAbHNxqrRoLmOjMJbCu1S',
    );
    if (!valid || !user?.active) throw new UnauthorizedException('E-mail ou senha incorretos.');
    return this.issue(user, 'Login');
  }
  async issue(user: any, event: string) {
    const refresh = randomBytes(48).toString('hex');
    await this.db.$transaction(async (tx) => {
      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: hash(refresh),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      await audit(tx, user, event, 'User', user.id);
    });
    return {
      access: jwt.sign({ version: user.tokenVersion }, process.env.JWT_SECRET!, {
        subject: user.id,
        expiresIn: '15m',
        issuer: 'oled',
        audience: 'oled-api',
        algorithm: 'HS256',
      }),
      refresh,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
  async refresh(token: string) {
    if (!token) throw new UnauthorizedException();
    const user = await this.db.serial(async (tx) => {
      const session = await tx.session.findUnique({
        where: { tokenHash: hash(token) },
        include: { user: true },
      });
      if (!session || session.expiresAt < new Date() || !session.user.active)
        throw new UnauthorizedException();
      await tx.session.delete({ where: { id: session.id } });
      return session.user;
    });
    return this.issue(user, 'Renovação de sessão');
  }
  async logout(user: Actor, token: string) {
    await this.db.$transaction(async (tx) => {
      await tx.session.deleteMany({
        where: { userId: user.id, ...(token ? { tokenHash: hash(token) } : {}) },
      });
      await tx.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
      await audit(tx, user, 'Logout', 'User', user.id);
    });
  }
  async changePassword(user: Actor, current: string, next: string) {
    const record = await this.db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(current, record.passwordHash)))
      throw new BadRequestException('Senha atual incorreta.');
    if (current === next) throw new BadRequestException('Escolha uma senha diferente.');
    const passwordHash = await bcrypt.hash(next, 12);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, mustChangePassword: false, tokenVersion: { increment: 1 } },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await audit(tx, user, 'Alteração de senha', 'User', user.id);
    });
  }
}
