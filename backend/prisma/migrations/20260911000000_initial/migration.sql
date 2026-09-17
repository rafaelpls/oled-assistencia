-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'TECHNICIAN', 'ATTENDANT');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'AWAITING_DIAGNOSIS', 'ANALYSIS', 'AWAITING_APPROVAL', 'AWAITING_PART', 'REPAIR', 'FINALIZED', 'AWAITING_PICKUP', 'DELIVERED', 'CANCELLED', 'WARRANTY');

-- CreateEnum
CREATE TYPE "PhotoType" AS ENUM ('ENTRY', 'REPAIR', 'FINALIZATION');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ATTENDANT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "imei" TEXT,
    "color" TEXT,
    "pinEncrypted" TEXT,
    "notes" TEXT,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrder" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "technicianId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "problem" TEXT NOT NULL,
    "physicalState" TEXT NOT NULL DEFAULT '',
    "accessories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checklist" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT NOT NULL DEFAULT '',
    "diagnosis" TEXT NOT NULL DEFAULT '',
    "estimatedCents" INTEGER NOT NULL DEFAULT 0,
    "finalCents" INTEGER NOT NULL DEFAULT 0,
    "warrantyDays" INTEGER NOT NULL DEFAULT 90,
    "termsSnapshot" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "originalOrderId" TEXT,

    CONSTRAINT "ServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderStatusHistory" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "previousStatus" "OrderStatus",
    "newStatus" "OrderStatus" NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderPhoto" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "PhotoType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "thumbnailKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceOrderPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitCents" INTEGER NOT NULL,
    "stockDeducted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ServiceOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "screenType" TEXT NOT NULL DEFAULT '',
    "quality" TEXT NOT NULL DEFAULT '',
    "supplierId" TEXT,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "saleCents" INTEGER NOT NULL DEFAULT 0,
    "installationCents" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warranty" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warranty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "name" TEXT NOT NULL DEFAULT 'OLED Assistência Técnica',
    "logo" TEXT NOT NULL DEFAULT '',
    "cnpj" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "hours" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "warrantyDays" INTEGER NOT NULL DEFAULT 90,
    "orderPrefix" TEXT NOT NULL DEFAULT 'OS',
    "printCopies" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_cpf_idx" ON "Customer"("cpf");

-- CreateIndex
CREATE INDEX "Device_imei_idx" ON "Device"("imei");

-- CreateIndex
CREATE INDEX "Device_model_idx" ON "Device"("model");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrder_number_key" ON "ServiceOrder"("number");

-- CreateIndex
CREATE INDEX "ServiceOrder_status_createdAt_idx" ON "ServiceOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ServiceOrder_customerId_idx" ON "ServiceOrder"("customerId");

-- CreateIndex
CREATE INDEX "ServiceOrder_deviceId_idx" ON "ServiceOrder"("deviceId");

-- CreateIndex
CREATE INDEX "ServiceOrder_technicianId_idx" ON "ServiceOrder"("technicianId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceOrderPhoto_storageKey_key" ON "ServiceOrderPhoto"("storageKey");

-- CreateIndex
CREATE INDEX "ServiceOrderPhoto_orderId_type_idx" ON "ServiceOrderPhoto"("orderId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_model_idx" ON "Product"("model");

-- CreateIndex
CREATE INDEX "Product_category_brand_idx" ON "Product"("category", "brand");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "StockMovement"("productId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_orderId_key" ON "Budget"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Warranty_orderId_key" ON "Warranty"("orderId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_originalOrderId_fkey" FOREIGN KEY ("originalOrderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderStatusHistory" ADD CONSTRAINT "ServiceOrderStatusHistory_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderPhoto" ADD CONSTRAINT "ServiceOrderPhoto_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderItem" ADD CONSTRAINT "ServiceOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOrderItem" ADD CONSTRAINT "ServiceOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Warranty" ADD CONSTRAINT "Warranty_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

