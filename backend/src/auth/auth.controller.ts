import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { z } from 'zod';
import { Public } from '../common/security';
import { parse } from '../common/validation';
import { AuthService } from './auth.service';
const options = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
});
@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private service: AuthService) {}
  private cookies(res: Response, data: any) {
    res.cookie('oled_access', data.access, { ...options(), maxAge: 15 * 60000 });
    res.cookie('oled_refresh', data.refresh, { ...options(), maxAge: 7 * 86400000 });
    return data.user;
  }
  @Public() @Post('login') async login(
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const b = parse(
      z.object({ email: z.email().max(250), password: z.string().min(1).max(200) }),
      body,
    );
    return this.cookies(res, await this.service.login(b.email, b.password));
  }
  @Public() @Post('refresh') async refresh(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cookies(res, await this.service.refresh(req.cookies?.oled_refresh));
  }
  @Get('me') me(@Req() req: any) {
    return req.user;
  }
  @Post('logout') async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.service.logout(req.user, req.cookies?.oled_refresh);
    res.clearCookie('oled_access', options());
    res.clearCookie('oled_refresh', options());
    return { ok: true };
  }
  @Post('password') async password(
    @Req() req: any,
    @Body() body: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const b = parse(
      z.object({ current: z.string().max(200), password: z.string().min(12).max(200) }),
      body,
    );
    await this.service.changePassword(req.user, b.current, b.password);
    res.clearCookie('oled_access', options());
    res.clearCookie('oled_refresh', options());
    return { ok: true };
  }
}
