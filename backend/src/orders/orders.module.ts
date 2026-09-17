import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { PhotosController } from '../photos/photos.controller';
import { LocalPhotoStorage } from '../photos/storage.service';
import { SupabasePhotoStorage } from '../photos/supabase-storage.service';
@Module({
  controllers: [OrdersController, PhotosController],
  providers: [
    OrdersService,
    {
      provide: 'PHOTO_STORAGE',
      useFactory: () =>
        process.env.PHOTO_STORAGE === 'supabase'
          ? new SupabasePhotoStorage()
          : new LocalPhotoStorage(),
    },
  ],
})
export class OrdersModule {}
