const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
test('Fluxo real com PostgreSQL, autenticação, permissões, fotos, estoque, pagamento e garantia', async (t) => {
  if (!process.env.DATABASE_URL?.includes('oled_test'))
    throw new Error('Use um banco descartável chamado oled_test.');
  process.env.JWT_SECRET = crypto.randomBytes(40).toString('hex');
  process.env.PIN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  process.env.PORT = '4101';
  process.env.FRONTEND_ORIGIN = 'http://localhost:3101';
  process.env.UPLOAD_DIR = process.env.TEST_UPLOAD_DIR || 'uploads/test';
  const { PrismaClient } = require('@prisma/client');
  const bcrypt = require('bcryptjs');
  const sharp = require('sharp');
  const db = new PrismaClient();
  const suffix = crypto.randomUUID().slice(0, 8),
    email = `admin-${suffix}@test.local`,
    password = 'TemporaryTestPassword2026!';
  const admin = await db.user.create({
    data: {
      name: 'Administrador de teste',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'ADMIN',
      mustChangePassword: false,
    },
  });
  await db.systemSettings.upsert({
    where: { id: 'main' },
    create: { terms: 'Termos de teste' },
    update: {},
  });
  const { bootstrap } = require('../../dist/backend/src/main');
  const app = await bootstrap();
  t.after(async () => {
    await app.close();
    await db.$disconnect();
  });
  async function request(path, method = 'GET', body, token) {
    const headers = {
      Origin: process.env.FRONTEND_ORIGIN,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(`http://127.0.0.1:4101${path}`, {
      method,
      headers,
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
    });
    const data = await response.json().catch(() => null);
    return { response, status: response.status, data };
  }
  const login = await request('/auth/login', 'POST', { email, password });
  assert.equal(login.status, 201);
  assert.equal(login.data.passwordHash, undefined);
  const cookies = login.response.headers.getSetCookie();
  const token = cookies
    .find((x) => x.startsWith('oled_access='))
    .split(';')[0]
    .split('=')[1];
  await t.test('Login inválido e API sem autenticação são bloqueados', async () => {
    assert.equal((await request('/auth/login', 'POST', { email, password: 'wrong' })).status, 401);
    assert.equal((await request('/service-orders')).status, 401);
  });
  let customer, device, order, product;
  await t.test('Cliente exige apenas nome e telefone e evita duplicidade', async () => {
    let r = await request(
      '/customers',
      'POST',
      { name: 'Cliente Teste', phone: '119' + String(Date.now()).slice(-8) },
      token,
    );
    assert.equal(r.status, 201);
    customer = r.data.customer;
    assert.equal(r.data.existing, false);
    customer = await request(
      `/customers/${customer.id}`,
      'PATCH',
      {
        cpf: '12345678901',
        email: `cliente-${suffix}@test.local`,
        address: 'Rua de Teste, 123',
        notes: 'Observação privada',
      },
      token,
    ).then((x) => x.data);
    r = await request('/customers', 'POST', { name: 'Duplicado', phone: customer.phone }, token);
    assert.equal(r.data.existing, true);
    assert.equal(r.data.customer.id, customer.id);
    const search = await request(`/customers?search=${customer.phone}`, 'GET', null, token);
    assert.equal(search.data.items[0].id, customer.id);
  });
  await t.test('Aparelho e OS são persistidos e PIN não vaza', async () => {
    let r = await request(
      '/devices',
      'POST',
      { customerId: customer.id, brand: 'Samsung', model: 'A15', imei: '123456789012345', pin: '1234' },
      token,
    );
    assert.equal(r.status, 201);
    device = r.data;
    assert.equal(device.pinEncrypted, undefined);
    r = await request(
      '/service-orders',
      'POST',
      {
        customerId: customer.id,
        deviceId: device.id,
        problem: 'Tela quebrada',
        physicalState: 'Trinca no vidro',
        accessories: ['Aparelho', 'Capinha'],
        checklist: { Tela: 'DANIFICADO' },
      },
      token,
    );
    assert.equal(r.status, 201);
    order = r.data;
    assert.equal(order.status, 'OPEN');
    assert.ok(
      (await request(`/service-orders?search=${customer.phone}`, 'GET', null, token)).data.items.some(
        (x) => x.id === order.id,
      ),
    );
    assert.ok(
      (await request('/service-orders?search=123456789012345', 'GET', null, token)).data.items.some(
        (x) => x.id === order.id,
      ),
    );
    assert.ok((await request(`/search?q=${customer.cpf}`, 'GET', null, token)).data.orders.length > 0);
    assert.ok((await request('/search?q=123456789012345', 'GET', null, token)).data.devices.length > 0);
  });
  await t.test('Upload inválido não gera foto', async () => {
    const form = new FormData();
    form.set('file', new Blob(['not an image']), 'invalid.jpg');
    assert.equal(
      (await request(`/service-orders/${order.id}/photos?type=ENTRY`, 'POST', form, token)).status,
      400,
    );
    assert.equal(await db.serviceOrderPhoto.count({ where: { orderId: order.id } }), 0);
  });
  const upload = async (type) => {
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    form.set('file', new Blob([bytes], { type: 'image/png' }), 'device.png');
    return request(`/service-orders/${order.id}/photos?type=${type}`, 'POST', form, token);
  };
  await t.test('Foto de entrada e diagnóstico', async () => {
    assert.equal((await upload('ENTRY')).status, 201);
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/status`,
          'POST',
          { status: 'ANALYSIS', note: 'Análise iniciada' },
          token,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}`,
          'PATCH',
          { diagnosis: 'Trocar módulo de tela' },
          token,
        )
      ).status,
      200,
    );
  });
  await t.test('Estoque, orçamento e baixa de peça', async () => {
    let r = await request(
      '/products',
      'POST',
      { name: 'Tela A15', sku: `TEST-${suffix}`, category: 'Telas', saleCents: 30000, minStock: 1 },
      token,
    );
    assert.equal(r.status, 201);
    product = r.data;
    const inactive = await request(
      '/products',
      'POST',
      { name: 'Produto inativo', sku: `INACTIVE-${suffix}`, category: 'Peças', saleCents: 1000, active: false },
      token,
    );
    assert.equal(inactive.status, 201);
    const inactiveList = await request('/products?includeInactive=true', 'GET', null, token);
    assert.ok(inactiveList.data.items.find((x) => x.id === inactive.data.id));
    assert.equal(
      (
        await request(
          '/stock/movement',
          'POST',
          { productId: product.id, kind: 'ADJUSTMENT', quantity: 1, note: 'Ajuste sem direção' },
          token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          '/stock/movement',
          'POST',
          { productId: product.id, kind: 'ENTRY', quantity: 2, note: 'Entrada teste' },
          token,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/items/${crypto.randomUUID()}`,
          'DELETE',
          null,
          token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/items`,
          'POST',
          {
            type: 'PART',
            description: 'Tela A15',
            productId: product.id,
            quantity: 1,
            unitCents: 30000,
          },
          token,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/items`,
          'POST',
          { type: 'LABOR', description: 'Instalação', quantity: 1, unitCents: 10000 },
          token,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/budget`,
          'POST',
          { status: 'APPROVED', discountCents: 0 },
          token,
        )
      ).status,
      201,
    );
    assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 1);
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/budget`,
          'POST',
          { status: 'APPROVED', discountCents: 0 },
          token,
        )
      ).status,
      400,
    );
    assert.equal((await db.product.findUnique({ where: { id: product.id } })).stock, 1);
  });
  await t.test(
    'Não finaliza sem foto FINALIZATION, nem por alteração direta de status',
    async () => {
      assert.equal(
        (await request(`/service-orders/${order.id}/status`, 'POST', { status: 'REPAIR' }, token))
          .status,
        201,
      );
      let r = await request(
        `/service-orders/${order.id}/finalize`,
        'POST',
        { warrantyDays: 90 },
        token,
      );
      assert.equal(r.status, 400);
      assert.match(r.data.message, /foto do aparelho/);
      assert.equal(
        (
          await request(
            `/service-orders/${order.id}/status`,
            'POST',
            { status: 'AWAITING_PICKUP' },
            token,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            `/service-orders/${order.id}`,
            'PATCH',
            { status: 'AWAITING_PICKUP' },
            token,
          )
        ).status,
        400,
      );
      assert.equal(
        (await db.serviceOrder.findUnique({ where: { id: order.id } })).status,
        'REPAIR',
      );
    },
  );
  await t.test(
    'Foto final permite finalização e não inicia garantia antes da entrega',
    async () => {
      assert.equal((await upload('FINALIZATION')).status, 201);
      assert.equal(
        (await request(`/service-orders/${order.id}/finalize`, 'POST', { warrantyDays: 90 }, token))
          .status,
        201,
      );
      assert.equal(
        (await db.serviceOrder.findUnique({ where: { id: order.id } })).status,
        'AWAITING_PICKUP',
      );
      assert.equal(await db.warranty.count({ where: { orderId: order.id } }), 0);
    },
  );
  await t.test('Pagamentos parciais, idempotência e entrega', async () => {
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/deliver`,
          'POST',
          { customerId: customer.id },
          token,
        )
      ).status,
      400,
    );
    const key = crypto.randomUUID();
    const body = { amountCents: 10000, method: 'PIX', idempotencyKey: key };
    assert.equal(
      (await request(`/service-orders/${order.id}/payments`, 'POST', body, token)).status,
      201,
    );
    assert.equal(
      (await request(`/service-orders/${order.id}/payments`, 'POST', body, token)).status,
      201,
    );
    assert.equal(await db.payment.count({ where: { orderId: order.id } }), 1);
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/payments`,
          'POST',
          { amountCents: 30001, method: 'PIX', idempotencyKey: crypto.randomUUID() },
          token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/payments`,
          'POST',
          { amountCents: 30000, method: 'PIX', idempotencyKey: crypto.randomUUID() },
          token,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/deliver`,
          'POST',
          { customerId: crypto.randomUUID() },
          token,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/service-orders/${order.id}/deliver`,
          'POST',
          { customerId: customer.id },
          token,
        )
      ).status,
      201,
    );
    const warranty = await db.warranty.findUnique({ where: { orderId: order.id } });
    assert.ok(warranty);
    assert.equal(warranty.endsAt - warranty.startsAt, 90 * 86400000);
    assert.equal((await db.device.findUnique({ where: { id: device.id } })).pinEncrypted, null);
  });
  await t.test('Retorno em garantia é vinculado à OS original', async () => {
    const r = await request(
      `/service-orders/${order.id}/warranty`,
      'POST',
      { problem: 'Retorno em garantia' },
      token,
    );
    assert.equal(r.status, 201);
    assert.equal(r.data.originalOrderId, order.id);
    assert.equal(r.data.status, 'WARRANTY');
  });
  await t.test('RBAC bloqueia técnico no financeiro/admin e atendente na finalização', async () => {
    for (const role of ['TECHNICIAN', 'ATTENDANT']) {
      const e = `${role}-${suffix}@test.local`;
      await db.user.create({
        data: {
          name: role,
          email: e,
          passwordHash: await bcrypt.hash(password, 10),
          role,
          mustChangePassword: false,
        },
      });
      const l = await request('/auth/login', 'POST', { email: e, password });
      const tk = l.response.headers
        .getSetCookie()
        .find((x) => x.startsWith('oled_access='))
        .split(';')[0]
        .split('=')[1];
      assert.equal((await request('/users', 'GET', null, tk)).status, 403);
      assert.equal((await request('/reports', 'GET', null, tk)).status, 403);
      if (role === 'TECHNICIAN') {
        const customers = await request(`/customers?search=${customer.phone}`, 'GET', null, tk);
        assert.equal(customers.status, 200);
        assert.equal(customers.data.items[0].id, customer.id);
        assert.equal(customers.data.items[0].phone, undefined);
        assert.equal(customers.data.items[0].cpf, undefined);
        assert.equal((await request('/customers', 'GET', null, tk)).data.items.length, 0);
        const orders = await request('/service-orders', 'GET', null, tk);
        assert.equal(orders.status, 200);
        const listedOrder = orders.data.items.find((x) => x.id === order.id);
        assert.ok(listedOrder);
        assert.equal(listedOrder.customer.id, customer.id);
        assert.equal(listedOrder.customer.name, customer.name);
        assert.equal(listedOrder.customer.phone, undefined);
        assert.equal(listedOrder.customer.cpf, undefined);
        assert.equal(listedOrder.customer.email, undefined);
        assert.equal(listedOrder.customer.address, undefined);
        assert.equal(listedOrder.customer.notes, undefined);
        assert.equal(listedOrder.device.pinEncrypted, undefined);
        assert.equal(
          (await request(`/service-orders?search=${customer.phone}`, 'GET', null, tk)).data.items.some(
            (x) => x.id === order.id,
          ),
          false,
        );
        assert.equal(
          (await request(`/service-orders?search=${customer.cpf}`, 'GET', null, tk)).data.items.some(
            (x) => x.id === order.id,
          ),
          false,
        );
        assert.equal(
          (await request('/service-orders?search=123456789012345', 'GET', null, tk)).data.items.some(
            (x) => x.id === order.id,
          ),
          false,
        );
        assert.ok(
          (await request(`/service-orders?search=${order.number}`, 'GET', null, tk)).data.items.some(
            (x) => x.id === order.id,
          ),
        );
        assert.ok(
          (await request('/service-orders?search=A15', 'GET', null, tk)).data.items.some(
            (x) => x.id === order.id,
          ),
        );
        assert.ok(
          (await request('/service-orders?search=Cliente%20Teste', 'GET', null, tk)).data.items.some(
            (x) => x.id === order.id,
          ),
        );
        assert.equal((await request(`/search?q=${customer.phone}`, 'GET', null, tk)).data.orders.length, 0);
        assert.equal((await request(`/search?q=${customer.cpf}`, 'GET', null, tk)).data.orders.length, 0);
        const imeiSearch = await request('/search?q=123456789012345', 'GET', null, tk);
        assert.equal(imeiSearch.data.orders.length, 0);
        assert.equal(imeiSearch.data.devices.length, 0);
        const orderDetail = await request(`/service-orders/${order.id}`, 'GET', null, tk);
        assert.equal(orderDetail.status, 200);
        assert.equal(orderDetail.data.customer.id, customer.id);
        assert.equal(orderDetail.data.customer.name, customer.name);
        assert.equal(orderDetail.data.customer.phone, undefined);
        assert.equal(orderDetail.data.customer.cpf, undefined);
        assert.equal(orderDetail.data.customer.email, undefined);
        assert.equal(orderDetail.data.customer.address, undefined);
        assert.equal(orderDetail.data.customer.notes, undefined);
        assert.equal(orderDetail.data.device.imei, undefined);
        assert.equal(orderDetail.data.device.pinEncrypted, undefined);
      }
      if (role === 'ATTENDANT') {
        const orderDetail = await request(`/service-orders/${order.id}`, 'GET', null, tk);
        assert.equal(orderDetail.status, 200);
        assert.equal(orderDetail.data.device.imei, '123456789012345');
        assert.equal(orderDetail.data.device.pinEncrypted, undefined);
        assert.equal(
          (await request(`/service-orders/${order.id}/finalize`, 'POST', { warrantyDays: 90 }, tk))
            .status,
          403,
        );
      } else {
        assert.equal(
          (
            await request(
              `/service-orders/${order.id}/payments`,
              'POST',
              { amountCents: 1, method: 'PIX', idempotencyKey: crypto.randomUUID() },
              tk,
            )
          ).status,
          403,
        );
        const screens = await request('/screens', 'GET', null, tk);
        assert.equal(screens.data.items.find((x) => x.id === product.id).costCents, undefined);
      }
    }
  });
  await t.test('Histórico e auditoria são persistidos', async () => {
    assert.ok((await db.auditLog.count({ where: { entityId: order.id } })) > 5);
    assert.ok((await db.serviceOrderStatusHistory.count({ where: { orderId: order.id } })) > 5);
    const detail = await request(`/service-orders/${order.id}`, 'GET', null, token);
    assert.equal(detail.data.status, 'DELIVERED');
    assert.equal(detail.data.device.imei, '123456789012345');
    assert.equal(detail.data.device.pinEncrypted, undefined);
  });
  await t.test('Logout revoga o token de acesso', async () => {
    assert.equal((await request('/auth/logout', 'POST', {}, token)).status, 201);
    assert.equal((await request('/service-orders', 'GET', null, token)).status, 401);
  });
});
