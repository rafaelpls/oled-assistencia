import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import { Database } from '../common/database';
import { parse, id } from '../common/validation';
import { orderEvent } from '../common/events';
import { PHOTO_STORAGE, PhotoStorage } from './storage.service';
@ApiTags('Fotos')
@Controller()
export class PhotosController {
  constructor(
    private db: Database,
    @Inject(PHOTO_STORAGE) private storage: PhotoStorage,
  ) {}
  @ApiConsumes('multipart/form-data')
  @Post('service-orders/:id/photos')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1 } }),
  )
  async upload(
    @Param('id') key: string,
    @Query('type') category: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    const orderId = parse(id, key);
    const type = parse(z.enum(['ENTRY', 'REPAIR', 'FINALIZATION']), category);
    if (req.user.role === 'ATTENDANT' && type !== 'ENTRY')
      throw new BadRequestException('Atendentes podem registrar fotos de entrada.');
    if (!file) throw new BadRequestException('Selecione uma imagem.');
    const order = await this.db.serviceOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!order) throw new NotFoundException('OS não encontrada.');
    if (['DELIVERED', 'CANCELLED'].includes(order.status))
      throw new BadRequestException('A OS está encerrada.');
    let full: Buffer, thumb: Buffer;
    try {
      const image = sharp(file.buffer, { limitInputPixels: 40000000 }).rotate();
      const metadata = await image.metadata();
      if (!['jpeg', 'png', 'webp', 'heif'].includes(metadata.format || '')) throw new Error();
      full = await image
        .clone()
        .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      thumb = await image
        .clone()
        .resize(360, 360, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75 })
        .toBuffer();
    } catch {
      throw new BadRequestException('Imagem inválida. Use JPEG, PNG ou WebP de até 10 MB.');
    }
    const storageKey = `${randomUUID()}.webp`,
      thumbnailKey = storageKey.replace('.webp', '-thumb.webp');
    try {
      await this.storage.put(storageKey, full);
      await this.storage.put(thumbnailKey, thumb);
      return await this.db.serial(async (tx) => {
        const o = await tx.serviceOrder.findUnique({ where: { id: orderId } });
        if (!o) throw new NotFoundException();
        if (['DELIVERED', 'CANCELLED'].includes(o.status))
          throw new BadRequestException('A OS está encerrada.');
        const p = await tx.serviceOrderPhoto.create({
          data: {
            orderId,
            type,
            storageKey,
            thumbnailKey,
            userId: req.user.id,
            userName: req.user.name,
          },
          select: { id: true, type: true, userName: true, createdAt: true },
        });
        await orderEvent(tx, req.user, o, o.status, `Foto registrada: ${type}`);
        return p;
      });
    } catch (e) {
      await this.storage.remove(storageKey);
      await this.storage.remove(thumbnailKey);
      throw e;
    }
  }
  @Get('photos/:id') async photo(
    @Param('id') key: string,
    @Query('thumbnail') thumbnail: string,
    @Res() res: Response,
  ) {
    const p = await this.db.serviceOrderPhoto.findUnique({ where: { id: parse(id, key) } });
    if (!p) throw new NotFoundException();
    const buffer = await this.storage.get(thumbnail === 'true' ? p.thumbnailKey : p.storageKey);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.type('image/webp').send(buffer);
  }
}
