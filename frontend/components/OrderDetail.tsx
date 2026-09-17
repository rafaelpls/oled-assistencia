'use client';
import { useRef, useState } from 'react';
import { ArrowLeft, Camera, Printer, Check, Plus, Trash2 } from 'lucide-react';
import { api, post, patch, money, date, statuses, methods } from '../lib/api';
import { Badge, Empty, Field, Modal, ErrorBox, Submit, useAction, PageSkeleton, Button, toast } from './ui';
import {useQuery,useDebounced} from '../lib/use-query';
export default function OrderDetail({
  id,
  user,
  back,
  open,
}: {
  id: string;
  user: any;
  back: () => void;
  open: (id: string) => void;
}) {
  const [tab,setTab]=useState('Resumo'),[dialog,setDialog]=useState(''),[partSearch,setPartSearch]=useState(''),[product,setProduct]=useState<any>(null),[photoType,setPhotoType]=useState('ENTRY'),[pin,setPin]=useState(''),[removeItem,setRemoveItem]=useState<any>(null);
  const a=useAction();const file=useRef<HTMLInputElement>(null);
  const query=useQuery<any>('/service-orders/'+id);const o=query.data;const load=query.reload;
  const settingsQuery=useQuery<any>('/settings/public');const settings=settingsQuery.data||{};
  const technicianQuery=useQuery<any[]>('/technicians');const technicians=technicianQuery.data||[];
  const search=useDebounced(partSearch);const parts=useQuery<any>(dialog==='item'?'/products?search='+encodeURIComponent(search):null);const products:any[]=parts.data?.items||[];
  if(!o)return query.error?<ErrorBox error={query.error} retry={load}/>:<PageSkeleton/>;
  const tech = user.role !== 'ATTENDANT',
    finance = user.role !== 'TECHNICIAN',
    mutable = !['DELIVERED', 'CANCELLED', 'AWAITING_PICKUP'].includes(o.status);
  const paid = o.payments.reduce((s: number, p: any) => s + p.amountCents, 0);
  const execute = (fn: () => Promise<any>) =>
    a.run(async () => {
      await fn();
      setDialog('');
      toast('Alteração registrada.');
      await load();
    });
  const upload = async (files: FileList | null, type: string) => {
    if (!files?.length) return;
    if(Array.from(files).some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>10*1024*1024)){a.setError('Selecione fotos JPEG, PNG ou WebP de até 10 MB.');return}
    await a.run(async () => {
      for (const f of Array.from(files)) {
        const data = new FormData();
        data.set('file', f);
        await api(`/service-orders/${id}/photos?type=${type}`, { method: 'POST', body: data });
      }
      await load();
    });
  };
  const finalize = () => {
    if (!o.photos.some((p: any) => p.type === 'FINALIZATION')) {
      setPhotoType('FINALIZATION');
      setTab('Fotos');
      a.setError(
        'Para finalizar esta Ordem de Serviço é necessário registrar uma foto do aparelho.',
      );
      file.current?.click();
      return;
    }
    setDialog('finalize');
  };
  return (
    <>
      <div className="no-print">
        <ErrorBox error={query.error} retry={load}/>
        <button className="link back" onClick={back}>
          <ArrowLeft size={16} /> Ordens de serviço
        </button>
        <div className="page-heading">
          <div>
            <div className="title-row">
              <h1 tabIndex={-1}>
                {settings.orderPrefix || 'OS'} #{String(o.number).padStart(4, '0')}
              </h1>
              <Badge status={o.status} />
            </div>
            <p>
              Aberta em {date(o.createdAt)} · {o.technician?.name || 'Sem técnico atribuído'}
            </p>
          </div>
          <div className="button-group">
            <button onClick={() => window.print()}>
              <Printer size={17} /> Imprimir
            </button>
            {tech && ['REPAIR', 'FINALIZED'].includes(o.status) && (
              <button className="primary" onClick={finalize}>
                <Check size={17} /> Finalizar OS
              </button>
            )}
            {finance && o.status === 'AWAITING_PICKUP' && (
              <button className="primary" onClick={() => setDialog('deliver')}>
                Entregar aparelho
              </button>
            )}
          </div>
        </div>
        <ErrorBox error={a.error} />
        <div className="detail-grid">
          <aside className="panel customer-card">
            <div className="avatar large">{o.customer.name.slice(0, 2).toUpperCase()}</div>
            <h2>{o.customer.name}</h2>
            <p>{o.customer.phone}</p>
            <hr />
            <span className="overline">APARELHO</span>
            <h3>
              {o.device.brand} {o.device.model}
            </h3>
            <p>{o.device.color || 'Cor não informada'}</p>
            <small>IMEI: {o.device.imei || 'Não informado'}</small>
            {tech && (
              <button
                className="link"
                onClick={() =>
                  a.run(async () =>
                    setPin(
                      (await post(`/devices/${o.deviceId}/reveal-pin`)).pin || 'Não cadastrado',
                    ),
                  )
                }
              >
                Consultar PIN
              </button>
            )}
            {pin && (
              <div className="context-strip">
                PIN: {pin}
                <button className="link" onClick={() => setPin('')}>
                  Ocultar
                </button>
              </div>
            )}
            <hr />
            <span className="overline">FINANCEIRO</span>
            <div className="summary-row">
              <span>Valor total</span>
              <strong>{money(o.finalCents)}</strong>
            </div>
            <div className="summary-row">
              <span>Pago</span>
              <strong>{money(paid)}</strong>
            </div>
            <div className="summary-row">
              <span>Pendente</span>
              <strong>{money(o.finalCents - paid)}</strong>
            </div>
            {(finance && mutable) || (finance && o.status === 'AWAITING_PICKUP') ? (
              <button onClick={() => setDialog('payment')} disabled={paid >= o.finalCents}>
                Registrar pagamento
              </button>
            ) : null}
            {o.warranty && (
              <>
                <hr />
                <span className="overline">GARANTIA</span>
                <p>
                  {o.warrantyDays} dias · até {date(o.warranty.endsAt)}
                </p>
                <button onClick={() => setDialog('warranty')}>Nova OS em garantia</button>
              </>
            )}
            {o.originalOrderId && (
              <button className="link" onClick={() => open(o.originalOrderId)}>
                Ver OS original
              </button>
            )}
            {o.warrantyOrders?.map((w: any) => (
              <button className="link" key={w.id} onClick={() => open(w.id)}>
                Garantia · OS #{w.number}
              </button>
            ))}
          </aside>
          <section className="panel detail-main">
            <nav className="tabs" role="tablist" aria-label="Detalhes da ordem" onKeyDown={e=>{const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();const tabs=['Resumo','Orçamento','Fotos','Histórico'];const i=tabs.indexOf(tab);const next=e.key==='Home'?0:e.key==='End'?3:(i+(e.key==='ArrowRight'?1:-1)+4)%4;setTab(tabs[next]);e.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus()}}>
              {['Resumo', 'Orçamento', 'Fotos', 'Histórico'].map((t) => (
                <button role="tab" id={'tab-'+t} aria-selected={tab===t} aria-controls="order-tab-panel" tabIndex={tab===t?0:-1} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} key={t}>
                  {t}
                  {t === 'Fotos' && <span>{o.photos.length}</span>}
                </button>
              ))}
            </nav>
            <div role="tabpanel" id="order-tab-panel" aria-labelledby={'tab-'+tab} tabIndex={0}>
            {tab === 'Resumo' && (
              <>
                <h3>Problema relatado</h3>
                <p className="preserve">{o.problem}</p>
                <div className="two-cols">
                  <div>
                    <h3>Estado físico</h3>
                    <p>{o.physicalState || 'Não informado'}</p>
                  </div>
                  <div>
                    <h3>Acessórios recebidos</h3>
                    <p>{o.accessories.join(', ') || 'Nenhum informado'}</p>
                  </div>
                </div>
                <h3>Observações</h3>
                <p className="preserve">{o.notes || 'Nenhuma observação'}</p>
                <details className="checklist">
                  <summary>Checklist de entrada</summary>
                  {[
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
                  ].map((k) => (
                    <div key={k} className="summary-row">
                      <span>{k}</span>
                      <small>{o.checklist[k] || 'NÃO TESTADO'}</small>
                    </div>
                  ))}
                </details>
                <h3>Diagnóstico técnico</h3>
                <p className="preserve">{o.diagnosis || 'Aguardando análise do técnico.'}</p>
                {mutable && (
                  <div className="button-group">
                    <button onClick={() => setDialog('edit')}>Editar informações</button>
                    {tech && <button onClick={() => setDialog('status')}>Alterar status</button>}
                  </div>
                )}
                {user.role === 'ADMIN' && !['DELIVERED', 'CANCELLED'].includes(o.status) && (
                  <button className="link cancel-link" onClick={() => setDialog('cancel')}>
                    Cancelar OS
                  </button>
                )}
              </>
            )}
            {tab === 'Orçamento' && (
              <>
                <div className="section-heading">
                  <h2>Serviços e peças</h2>
                  {tech && mutable && o.budget?.status !== 'APPROVED' && (
                    <button
                      onClick={() => {
                        setProduct(null);
                        setDialog('item');
                      }}
                    >
                      <Plus size={16} /> Adicionar item
                    </button>
                  )}
                </div>
                {o.items.length ? (
                  <div className="table-wrap">
                    <table className="responsive-table">
                      <thead>
                        <tr>
                          <th>Descrição</th>
                          <th>Qtd.</th>
                          <th>Valor</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {o.items.map((item: any) => (
                          <tr key={item.id}>
                            <td data-label="Descrição">
                              {item.description}
                              <small>
                                {item.type === 'PART'
                                  ? 'Peça'
                                  : item.type === 'LABOR'
                                    ? 'Mão de obra'
                                    : 'Serviço'}
                                {item.stockDeducted ? ' · Estoque baixado' : ''}
                              </small>
                            </td>
                            <td data-label="Quantidade">{item.quantity}</td>
                            <td data-label="Valor">{money(item.unitCents * item.quantity)}</td>
                            <td data-label="Ações">
                              {tech && mutable && o.budget?.status !== 'APPROVED' && (
                                <button
                                  className="icon"
                                  aria-label="Remover item"
                                  onClick={()=>setRemoveItem(item)}
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty title="Orçamento ainda não elaborado" />
                )}
                <div className="budget-summary">
                  <span>Desconto: {money(o.budget?.discountCents)}</span>
                  <strong>Total: {money(o.finalCents)}</strong>
                  <span>
                    {({ PENDING: 'Pendente', APPROVED: 'Aprovado', REFUSED: 'Recusado' } as any)[
                      o.budget?.status
                    ] || 'Sem orçamento'}
                  </span>
                </div>
                {tech && mutable && o.items.length > 0 && o.budget?.status !== 'APPROVED' && (
                  <button className="primary" onClick={() => setDialog('budget')}>
                    Atualizar / aprovar orçamento
                  </button>
                )}
                <hr />
                <h3>Pagamentos registrados</h3>
                {o.payments.length ? (
                  o.payments.map((p: any) => (
                    <div className="summary-row" key={p.id}>
                      <span>
                        {methods[p.method]}
                        <small>{date(p.createdAt)}</small>
                      </span>
                      <strong>{money(p.amountCents)}</strong>
                    </div>
                  ))
                ) : (
                  <p>Nenhum pagamento registrado.</p>
                )}
              </>
            )}
            {tab === 'Fotos' && (
              <>
                <div className="section-heading">
                  <div>
                    <h2>Registro fotográfico</h2>
                    <p>A foto de finalização é obrigatória.</p>
                  </div>
                </div>
                <div className="toolbar">
                  <select
                    aria-label="Categoria da foto"
                    value={photoType}
                    onChange={(e) => setPhotoType(e.target.value)}
                  >
                    <option value="ENTRY">Entrada</option>
                    {tech && (
                      <>
                        <option value="REPAIR">Durante reparo</option>
                        <option value="FINALIZATION">Finalização</option>
                      </>
                    )}
                  </select>
                  <button
                    disabled={a.busy || ['DELIVERED', 'CANCELLED'].includes(o.status)}
                    onClick={() => file.current?.click()}
                  >
                    <Camera size={17} /> Adicionar foto
                  </button>
                  <label className="camera-label">
                    Câmera
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={a.busy || ['DELIVERED', 'CANCELLED'].includes(o.status)}
                      onChange={(e) => upload(e.target.files, photoType)}
                    />
                  </label>
                </div>
                <div className="photo-grid">
                  {o.photos.map((p: any) => (
                    <a key={p.id} href={`/api/photos/${p.id}`} target="_blank" rel="noreferrer">
                      <img loading="lazy" decoding="async" width={240} height={240}
                        src={`/api/photos/${p.id}?thumbnail=true`}
                        alt={`Foto de ${p.type === 'ENTRY' ? 'entrada' : p.type === 'REPAIR' ? 'reparo' : 'finalização'} do aparelho`}
                      />
                      <strong>
                        {
                          (
                            {
                              ENTRY: 'Entrada',
                              REPAIR: 'Durante reparo',
                              FINALIZATION: 'Finalização',
                            } as any
                          )[p.type]
                        }
                      </strong>
                      <small>
                        {p.userName} · {date(p.createdAt)}
                      </small>
                    </a>
                  ))}
                </div>
                {!o.photos.length && <Empty title="Nenhuma foto registrada" />}
              </>
            )}
            {tab === 'Histórico' && (
              <div className="timeline">
                {o.history.map((h: any) => (
                  <div key={h.id}>
                    <i />
                    <strong>{h.note}</strong>
                    <p>
                      {h.userName} · {date(h.createdAt)}
                    </p>
                    {h.previousStatus !== h.newStatus && (
                      <small>
                        {statuses[h.previousStatus]} → {statuses[h.newStatus]}
                      </small>
                    )}
                  </div>
                ))}
              </div>
            )}
            </div>
          </section>
        </div>
        <input
          hidden
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => upload(e.target.files, photoType)}
        />
      </div>
      <section className="receipt">
        <header>
          {settings.logo && <img src={settings.logo} alt="Logo" />}
          <h1>{settings.name}</h1>
          <p>
            {settings.address} · {settings.phone} · {settings.cnpj}
          </p>
        </header>
        <h2>
          {settings.orderPrefix} #{o.number} · {statuses[o.status]}
        </h2>
        <p>
          Abertura: {date(o.createdAt)} · Entrega: {date(o.deliveredAt)}
        </p>
        <h3>Cliente</h3>
        <p>
          {o.customer.name} · {o.customer.phone}
        </p>
        <h3>Aparelho</h3>
        <p>
          {o.device.brand} {o.device.model} · IMEI: {o.device.imei || '—'} · {o.device.color}
        </p>
        <h3>Problema relatado</h3>
        <p>{o.problem}</p>
        <p>Estado físico: {o.physicalState}</p>
        <p>Acessórios: {o.accessories.join(', ')}</p>
        <h3>Serviços e peças</h3>
        {o.items.map((x: any) => (
          <div className="summary-row" key={x.id}>
            <span>
              {x.quantity} × {x.description}
            </span>
            <strong>{money(x.quantity * x.unitCents)}</strong>
          </div>
        ))}
        <p>
          Desconto: {money(o.budget?.discountCents)} · Total: {money(o.finalCents)} · Pago:{' '}
          {money(paid)} · Pendente: {money(o.finalCents - paid)}
        </p>
        <p>
          Pagamentos:{' '}
          {o.payments.map((p: any) => `${methods[p.method]} ${money(p.amountCents)}`).join(', ') ||
            'Não registrados'}
        </p>
        <p>
          Garantia: {o.warrantyDays} dias a partir da entrega.{' '}
          {o.warranty && `Válida de ${date(o.warranty.startsAt)} até ${date(o.warranty.endsAt)}.`}
        </p>
        <h3>Termos da assistência</h3>
        <p className="preserve">
          {o.termsSnapshot || 'Termos não cadastrados na abertura desta OS.'}
        </p>
        <div className="signature">
          Assinatura do cliente: ____________________________________
          <br />
          Data: ____/____/________
        </div>
      </section>
      {dialog && (
        <Modal busy={a.busy}
          title={
            (
              {
                edit: 'Editar OS',
                status: 'Alterar status',
                item: 'Adicionar ao orçamento',
                budget: 'Confirmação do orçamento',
                payment: 'Registrar pagamento',
                finalize: 'Finalizar serviço',
                deliver: 'Entregar aparelho',
                warranty: 'Nova OS em garantia',
                cancel: 'Cancelar ordem',
              } as any
            )[dialog]
          }
          onClose={() => setDialog('')}
        >
          <ErrorBox error={a.error} />
          {dialog === 'edit' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                execute(() =>
                  patch(`/service-orders/${id}`, Object.fromEntries(new FormData(e.currentTarget))),
                );
              }}
            >
              <Field label="Problema relatado">
                <textarea name="problem" defaultValue={o.problem} required />
              </Field>
              <Field label="Estado físico">
                <textarea name="physicalState" defaultValue={o.physicalState} />
              </Field>
              <Field label="Observações">
                <textarea name="notes" defaultValue={o.notes} />
              </Field>
              {tech && (
                <>
                  <Field label="Diagnóstico">
                    <textarea name="diagnosis" defaultValue={o.diagnosis} />
                  </Field>
                  <Field label="Técnico responsável">
                    <select name="technicianId" defaultValue={o.technicianId || technicians[0]?.id}>
                      {technicians.map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
              <Submit busy={a.busy}>Salvar alterações</Submit>
            </form>
          )}
          {dialog === 'status' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                execute(() =>
                  post(
                    `/service-orders/${id}/status`,
                    Object.fromEntries(new FormData(e.currentTarget)),
                  ),
                );
              }}
            >
              <Field label="Novo status">
                <select name="status">
                  {[
                    'AWAITING_DIAGNOSIS',
                    'ANALYSIS',
                    'AWAITING_APPROVAL',
                    'AWAITING_PART',
                    'REPAIR',
                  ].map((s) => (
                    <option value={s} key={s}>
                      {statuses[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Observação">
                <textarea name="note" />
              </Field>
              <Submit busy={a.busy}>Atualizar status</Submit>
            </form>
          )}
          {dialog === 'item' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d: any = Object.fromEntries(new FormData(e.currentTarget));
                execute(() =>
                  post(`/service-orders/${id}/items`, {
                    type: product ? 'PART' : d.type,
                    description: product?.name || d.description,
                    quantity: Number(d.quantity),
                    unitCents: Math.round(Number(d.value) * 100),
                    ...(product ? { productId: product.id } : {}),
                  }),
                );
              }}
            >
              <Field label="Buscar peça no estoque">
                <input
                  value={partSearch}
                  onChange={(e) => setPartSearch(e.target.value)}
                  placeholder="Nome, modelo ou SKU"
                />
              </Field>
              <ErrorBox error={parts.error} retry={parts.reload}/>{parts.pending&&<p role="status">Buscando peças…</p>}
              <Field label="Peça (opcional)">
                <select
                  value={product?.id || ''}
                  onChange={(e) =>
                    setProduct(products.find((p) => p.id === e.target.value) || null)
                  }
                >
                  <option value="">Serviço / mão de obra</option>
                  {products.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name} · {p.stock} un.
                    </option>
                  ))}
                </select>
              </Field>
              {!product && (
                <>
                  <Field label="Tipo">
                    <select name="type">
                      <option value="SERVICE">Serviço</option>
                      <option value="LABOR">Mão de obra</option>
                    </select>
                  </Field>
                  <Field label="Descrição">
                    <input name="description" required />
                  </Field>
                </>
              )}
              <div className="form-grid">
                <Field label="Quantidade">
                  <input
                    name="quantity"
                    type="number"
                    min={1}
                    max={1000}
                    defaultValue={1}
                    required
                  />
                </Field>
                <Field label="Preço unitário (R$)">
                  <input
                    key={product?.id || 'none'}
                    name="value"
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={product ? product.saleCents / 100 : 0}
                    required
                  />
                </Field>
              </div>
              <Submit busy={a.busy}>Adicionar item</Submit>
            </form>
          )}
          {dialog === 'budget' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d: any = Object.fromEntries(new FormData(e.currentTarget));
                execute(() =>
                  post(`/service-orders/${id}/budget`, {
                    status: d.status,
                    discountCents: Math.round(Number(d.discount) * 100),
                  }),
                );
              }}
            >
              <p>
                Ao aprovar, as peças serão baixadas do estoque. Confirme a aprovação com o cliente.
              </p>
              <Field label="Desconto (R$)">
                <input
                  name="discount"
                  type="number"
                  step="0.01"
                  min={0}
                  defaultValue={(o.budget?.discountCents || 0) / 100}
                />
              </Field>
              <Field label="Situação">
                <select name="status">
                  <option value="PENDING">Pendente</option>
                  <option value="APPROVED">Aprovado pelo cliente</option>
                  <option value="REFUSED">Recusado pelo cliente</option>
                </select>
              </Field>
              <Submit busy={a.busy}>Confirmar orçamento</Submit>
            </form>
          )}
          {dialog === 'payment' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const d: any = Object.fromEntries(new FormData(e.currentTarget));
                execute(() =>
                  post(`/service-orders/${id}/payments`, {
                    amountCents: Math.round(Number(d.value) * 100),
                    method: d.method,
                    idempotencyKey: crypto.randomUUID(),
                  }),
                );
              }}
            >
              <p>
                Pendente: <strong>{money(o.finalCents - paid)}</strong>
              </p>
              <Field label="Valor recebido (R$)">
                <input
                  name="value"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(o.finalCents - paid) / 100}
                  required
                />
              </Field>
              <Field label="Forma de pagamento">
                <select name="method">
                  {Object.entries(methods).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Submit busy={a.busy}>Registrar pagamento</Submit>
            </form>
          )}
          {dialog === 'finalize' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                execute(() =>
                  post(`/service-orders/${id}/finalize`, {
                    warrantyDays: Number(new FormData(e.currentTarget).get('days')),
                  }),
                );
              }}
            >
              <p>A foto de finalização está registrada. A OS passará para aguardando retirada.</p>
              <Field label="Garantia (dias)">
                <input
                  name="days"
                  type="number"
                  min={0}
                  max={3650}
                  defaultValue={o.warrantyDays}
                  required
                />
              </Field>
              <Submit busy={a.busy}>Confirmar finalização</Submit>
            </form>
          )}
          {dialog === 'deliver' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                execute(() => post(`/service-orders/${id}/deliver`, { customerId: o.customerId }));
              }}
            >
              <p>
                Cliente: <strong>{o.customer.name}</strong>
              </p>
              <p>
                Pendente: <strong>{money(o.finalCents - paid)}</strong>
              </p>
              <label className="check-row">
                <input type="checkbox" required /> Confirmei o cliente e o aparelho entregue.
              </label>
              <p>A garantia de {o.warrantyDays} dias começa na entrega.</p>
              <Submit busy={a.busy}>Confirmar entrega</Submit>
            </form>
          )}
          {dialog === 'warranty' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                a.run(async () => {
                  const n = await post(
                    `/service-orders/${id}/warranty`,
                    Object.fromEntries(new FormData(e.currentTarget)),
                  );
                  setDialog('');
                  open(n.id);
                });
              }}
            >
              <Field label="Problema relatado no retorno">
                <textarea name="problem" required />
              </Field>
              <Submit busy={a.busy}>Criar OS vinculada</Submit>
            </form>
          )}
          {dialog === 'cancel' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                execute(() =>
                  post(
                    `/service-orders/${id}/cancel`,
                    Object.fromEntries(new FormData(e.currentTarget)),
                  ),
                );
              }}
            >
              <p>
                Peças baixadas serão devolvidas ao estoque. OS com pagamentos não pode ser
                cancelada.
              </p>
              <Field label="Motivo do cancelamento">
                <textarea name="note" required />
              </Field>
              <Submit busy={a.busy} danger>Confirmar cancelamento</Submit>
            </form>
          )}
        </Modal>
      )}
      {removeItem&&<Modal title="Remover item do orçamento" busy={a.busy} protectChanges={false} onClose={()=>setRemoveItem(null)}><p>Remover <strong>{removeItem.description}</strong> deste orçamento?</p><ErrorBox error={a.error}/><Button variant="danger" busy={a.busy} onClick={()=>a.run(async()=>{await api('/service-orders/'+id+'/items/'+removeItem.id,{method:'DELETE'});setRemoveItem(null);toast('Item removido.');await load()})}>Remover item</Button></Modal>}
    </>
  );
}
