import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Database } from './database';
export type Actor = { id: string; name: string; role: Role; mustChangePassword: boolean };
export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    private db: Database,
    private reflector: Reflector,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride('public', [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    let claims: any;
    try {
      claims = jwt.verify(
        req.cookies?.oled_access || req.headers.authorization?.replace(/^Bearer /, ''),
        process.env.JWT_SECRET!,
        { algorithms: ['HS256'], issuer: 'oled', audience: 'oled-api' },
      );
    } catch {
      throw new UnauthorizedException('Faça login para continuar.');
    }
    const user = await this.db.user.findUnique({ where: { id: claims.sub } });
    if (!user?.active || user.tokenVersion !== claims.version) throw new UnauthorizedException();
    if (
      user.mustChangePassword &&
      !['/auth/me', '/auth/password', '/auth/logout'].includes(req.path)
    )
      throw new ForbiddenException('Altere sua senha inicial antes de continuar.');
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (roles && !roles.includes(user.role))
      throw new ForbiddenException('Seu perfil não tem permissão para esta ação.');
    req.user = {
      id: user.id,
      name: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    };
    return true;
  }
}
export function encryptPin(pin?: string) {
  if (!pin) return undefined;
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    Buffer.from(process.env.PIN_ENCRYPTION_KEY!, 'hex'),
    iv,
  );
  const data = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
}
export function decryptPin(value: string) {
  const [iv, tag, data] = value.split(':');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(process.env.PIN_ENCRYPTION_KEY!, 'hex'),
    Buffer.from(iv, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString(
    'utf8',
  );
}
