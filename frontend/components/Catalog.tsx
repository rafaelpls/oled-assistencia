'use client';
import { useEffect, useState } from 'react';
import { Search, Plus, Pencil, ArrowRight } from 'lucide-react';
import { api, post, patch, money, date, roleNames } from '../lib/api';
import { Modal, Field, Submit, ErrorBox, Empty, useAction, Badge, TableSkeleton, Pagination, SearchInput, Button, ActionMenu, toast } from './ui';
import {useQuery,useDebounced,useViewState} from '../lib/use-query';
type FieldSpec = {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  options?: string[];
  money?: boolean;
};
const customerFields: FieldSpec[] = [
  { name: 'name', label: 'Nome', required: true },
  { name: 'phone', label: 'Telefone / WhatsApp', required: true },
  { name: 'cpf', label: 'CPF (somente números)' },
  { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'address', label: 'Endereço' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];
const productFields: FieldSpec[] = [
  { name: 'name', label: 'Nome', required: true },
  { name: 'sku', label: 'SKU / código', required: true },
  {
    name: 'category',
    label: 'Categoria',
    options: [
      'Telas',
      'Baterias',
      'Conectores',
      'Câmeras',
      'Flex',
      'Alto-falantes',
      'Microfones',
      'Componentes',
      'Acessórios',
      'Outros',
    ],
  },
  { name: 'brand', label: 'Marca' },
  { name: 'model', label: 'Modelo' },
  {
    name: 'screenType',
    label: 'Tipo de tela',
    options: ['', 'LCD', 'Incell', 'OLED', 'AMOLED', 'Original', 'Outro'],
  },
  { name: 'quality', label: 'Qualidade' },
  { name: 'costCents', label: 'Custo (R$)', money: true },
  { name: 'saleCents', label: 'Venda (R$)', money: true, required: true },
  { name: 'installationCents', label: 'Instalação (R$)', money: true },
  { name: 'minStock', label: 'Estoque mínimo', type: 'number' },
  { name: 'location', label: 'Localização' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];
const supplierFields: FieldSpec[] = [
  { name: 'name', label: 'Nome', required: true },
  { name: 'company', label: 'Empresa' },
  { name: 'phone', label: 'Telefone' },
  { name: 'whatsapp', label: 'WhatsApp' },
  { name: 'email', label: 'E-mail', type: 'email' },
  { name: 'notes', label: 'Observações', type: 'textarea' },
];
export default function Catalog({
  view,
  user,
  openOrder, initialId='', initialSearch='',
}: {
  initialId?: string; initialSearch?: string;
  view: string;
  user: any;
  openOrder: (id: string) => void;
}) {
  const [state,setState]=useViewState<any>('catalog-'+view,{page:1,search:initialSearch,filters:{}});
  const {page,search,filters}=state;
  const setPage=(page:number)=>setState((old:any)=>({...old,page}));
  const setSearch=(search:string)=>setState((old:any)=>({...old,search,page:1}));
  const setFilters=(filters:any)=>setState((old:any)=>({...old,filters,page:1}));
  const [editing,setEditing]=useState<any>(null),[history,setHistory]=useState<any>(null),[movement,setMovement]=useState<any>(null),[confirmUser,setConfirmUser]=useState<any>(null);
  const a=useAction();
  const product=['products','screens'].includes(view);
  const path='/'+view;
  const localSearch=['suppliers','users','stock','payments','audit','notifications'].includes(view);
  const allRows=['suppliers','users'].includes(view);
  const debounced=useDebounced(search);const debouncedFilters=useDebounced(JSON.stringify(filters));
  const query=useQuery<any>(path+'?search='+encodeURIComponent(localSearch?'':debounced)+'&page='+(allRows?1:page)+'&'+new URLSearchParams(JSON.parse(debouncedFilters)));
  const supplierQuery=useQuery<any[]>(user.role==='ADMIN'&&product?'/suppliers':null);const suppliers=supplierQuery.data||[];
  const raw=Array.isArray(query.data)?query.data:(query.data?.items||[]);
  const filtered=localSearch?raw.filter((x:any)=>JSON.stringify(x).toLowerCase().includes(search.toLowerCase())):raw;
  const items=allRows?filtered.slice((page-1)*25,page*25):filtered;
  const total=allRows?filtered.length:query.data?.total;
  const load=query.reload;
  useEffect(()=>{if(initialSearch)setState((old:any)=>({...old,search:initialSearch,page:1}))},[initialSearch,setState]);
  useEffect(()=>{if(!initialId||!['customers','devices'].includes(view))return;const controller=new AbortController();api('/'+view+'/'+initialId,{signal:controller.signal}).then(setHistory).catch(e=>{if(!controller.signal.aborted)a.setError(e.message)});return()=>controller.abort()},[initialId,view]);
  const clear=()=>setState({search:'',page:1,filters:{}});
  const fields: FieldSpec[] =
    view === 'customers'
      ? customerFields
      : view === 'suppliers'
        ? supplierFields
        : product
          ? productFields
          : [
              { name: 'name', label: 'Nome', required: true },
              { name: 'email', label: 'E-mail', required: true, type: 'email' },
              { name: 'role', label: 'Perfil', options: ['ADMIN', 'TECHNICIAN', 'ATTENDANT'] },
              ...(!editing?.id
                ? [
                    {
                      name: 'password',
                      label: 'Senha inicial (mínimo 12 caracteres)',
                      required: true,
                      type: 'password',
                    },
                  ]
                : []),
            ];
  const title = (
    {
      customers: 'Clientes',
      devices: 'Aparelhos',
      products: 'Estoque e produtos',
      screens: 'Preços de telas',
      suppliers: 'Fornecedores',
      users: 'Equipe e permissões',
      stock: 'Movimentações de estoque',
      payments: 'Pagamentos',
      audit: 'Auditoria',
      notifications: 'Notificações',
    } as any
  )[view];
  const canCreate =
    view === 'customers'
      ? user.role !== 'TECHNICIAN'
      : user.role === 'ADMIN' && ['products', 'screens', 'suppliers', 'users'].includes(view);
  const historyLoad = (item: any) =>
    a.run(async () => setHistory(await api(`/${view}/${item.id}`)));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="overline">
            {product ? 'PEÇAS E DISPONIBILIDADE' : 'GESTÃO DA ASSISTÊNCIA'}
          </span>
          <h1 tabIndex={-1}>{title}</h1>
          <p>
            {view === 'screens'
              ? 'Consulte o modelo e encontre o preço durante o atendimento.'
              : view === 'customers'
                ? 'Cadastros simples, histórico completo.'
                : 'Informações organizadas para o dia a dia.'}
          </p>
        </div>
        {canCreate && (
          <button className="primary" onClick={() => setEditing({})}>
            <Plus size={18} />{' '}
            {view === 'customers'
              ? 'Novo cliente'
              : view === 'users'
                ? 'Novo usuário'
                : view === 'suppliers'
                  ? 'Novo fornecedor'
                  : 'Novo produto'}
          </button>
        )}
      </div>
      <section className="panel">
        <div className="toolbar">
          <SearchInput label="Buscar registros" value={search} onChange={setSearch} placeholder={product?'Buscar nome, modelo ou SKU…':localSearch&&!allRows?'Buscar nesta página…':'Buscar…'}/>
          {(search||Object.values(filters).some(Boolean))&&<Button onClick={clear}>Limpar filtros</Button>}
          {view === 'products' && (
            <button
              onClick={() =>
                window.dispatchEvent(new CustomEvent('oled:navigate', { detail: 'stock' }))
              }
            >
              Movimentações
            </button>
          )}
        </div>
        {view === 'screens' && (
          <div className="filter-grid">
            {['brand', 'screenType', 'quality'].map((f, i) => (
              <input
                key={f}
                aria-label={['Marca', 'Tipo', 'Qualidade'][i]}
                placeholder={['Marca', 'Tipo de tela', 'Qualidade'][i]}
                value={filters[f] || ''}
                onChange={(e) => {
                  setFilters({ ...filters, [f]: e.target.value });
                  setPage(1);
                }}
              />
            ))}
            <select
              aria-label="Disponibilidade"
              value={filters.available || ''}
              onChange={(e) => setFilters({ ...filters, available: e.target.value })}
            >
              <option value="">Toda disponibilidade</option>
              <option value="true">Em estoque</option>
            </select>
            {user.role === 'ADMIN' && (
              <select
                aria-label="Fornecedor"
                value={filters.supplierId || ''}
                onChange={(e) => setFilters({ ...filters, supplierId: e.target.value })}
              >
                <option value="">Todos os fornecedores</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        <ErrorBox error={a.error} />
        <ErrorBox error={query.error} retry={load}/>
        {localSearch&&!allRows&&<p className="list-info">Busca nos registros desta página.</p>}
        {query.pending?<TableSkeleton/>:items.length ? (
          <div className="table-wrap">
            <table className="responsive-table">
              <thead>
                <tr>
                  {(product
                    ? ['Produto / Modelo', 'Tipo / Qualidade', 'Venda', 'Instalação', 'Estoque', '']
                    : view === 'customers'
                      ? ['Cliente', 'Telefone', 'CPF', '']
                      : view === 'devices'
                        ? ['Aparelho', 'IMEI', 'Cliente', '']
                        : view === 'users'
                          ? ['Usuário', 'Perfil', 'Situação', '']
                          : view === 'suppliers'
                            ? ['Fornecedor', 'Telefone', 'E-mail', '']
                            : view === 'stock'
                              ? ['Produto', 'Movimento', 'Quantidade', 'Saldo', 'Data']
                              : view === 'payments'
                                ? ['OS / Cliente', 'Valor', 'Forma', 'Data']
                                : view === 'audit'
                                  ? ['Ação', 'Usuário', 'Registro', 'Data']
                                  : ['Notificação', 'Data']
                  ).map((h, i) => (
                    <th key={i}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items
                  .map((x:any) => (
                    <tr key={x.id}>
                      {product ? (
                        <>
                          <td data-label="Produto / Modelo">
                            <strong>{x.name}</strong>
                            <small>
                              {x.sku} · {x.brand} {x.model}
                            </small>
                            <small>
                              {x.supplier?.name || 'Sem fornecedor'}
                              {user.role === 'ADMIN' ? ` · Custo ${money(x.costCents)}` : ''}
                            </small>
                          </td>
                          <td data-label="Tipo / Qualidade">
                            {x.screenType || x.category}
                            <small>{x.quality}</small>
                          </td>
                          <td data-label="Venda">{money(x.saleCents)}</td>
                          <td data-label="Instalação">{money(x.installationCents)}</td>
                          <td data-label="Estoque">
                            <span className={x.stock <= x.minStock ? 'warning' : ''}>
                              {x.stock} un.
                            </span>
                            <small>Mín. {x.minStock}</small>
                          </td>
                          <td data-label="Ações">
                            {user.role === 'ADMIN' && (
                              <ActionMenu label={`Ações de ${x.name}`}>
                                <button
                                  className="icon"
                                  aria-label="Editar produto"
                                  onClick={() => setEditing(x)}
                                >
                                  <Pencil size={16} /> Editar
                                </button>
                                <button onClick={() => setMovement(x)}>Movimentar estoque</button>
                              </ActionMenu>
                            )}
                          </td>
                        </>
                      ) : view === 'customers' ? (
                        <>
                          <td data-label="Cliente">
                            <strong>{x.name}</strong>
                            <small>{x.email}</small>
                          </td>
                          <td data-label="Telefone">{x.phone}</td>
                          <td data-label="CPF">{x.cpf || '—'}</td>
                          <td data-label="Ações">
                            <button onClick={() => historyLoad(x)}>Histórico</button>
                            {canCreate && (
                              <button
                                className="icon"
                                aria-label="Editar cliente"
                                onClick={() => setEditing(x)}
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                          </td>
                        </>
                      ) : view === 'devices' ? (
                        <>
                          <td data-label="Aparelho">
                            {x.brand} {x.model}
                          </td>
                          <td data-label="IMEI">{x.imei || '—'}</td>
                          <td data-label="Cliente">{x.customer?.name}</td>
                          <td data-label="Ações">
                            <button onClick={() => historyLoad(x)}>Histórico</button>
                          </td>
                        </>
                      ) : view === 'users' ? (
                        <>
                          <td data-label="Usuário">
                            <strong>{x.name}</strong>
                            <small>{x.email}</small>
                          </td>
                          <td data-label="Perfil">{roleNames[x.role]}</td>
                          <td data-label="Situação">{x.active ? 'Ativo' : 'Desativado'}</td>
                          <td data-label="Ações">
                            <button
                              className="icon"
                              aria-label="Editar usuário"
                              onClick={() => setEditing(x)}
                            >
                              <Pencil size={16} />
                            </button>
                            {x.id !== user.id && (
                              <button
                                onClick={()=>setConfirmUser(x)}
                              >
                                {x.active ? 'Desativar' : 'Ativar'}
                              </button>
                            )}
                          </td>
                        </>
                      ) : view === 'suppliers' ? (
                        <>
                          <td data-label="Fornecedor">
                            <strong>{x.name}</strong>
                            <small>{x.company}</small>
                          </td>
                          <td data-label="Telefone">{x.phone}</td>
                          <td data-label="E-mail">{x.email}</td>
                          <td data-label="Ações">
                            <button
                              className="icon"
                              aria-label="Editar fornecedor"
                              onClick={() => setEditing(x)}
                            >
                              <Pencil size={16} />
                            </button>
                          </td>
                        </>
                      ) : view === 'stock' ? (
                        <>
                          <td data-label="Produto">{x.product.name}</td>
                          <td data-label="Movimento">
                            {
                              (
                                {
                                  ENTRY: 'Entrada',
                                  EXIT: 'Saída',
                                  ADJUSTMENT: 'Ajuste',
                                  ORDER: 'Uso em OS',
                                  RETURN: 'Devolução',
                                } as any
                              )[x.kind]
                            }
                            <small>{x.note}</small>
                          </td>
                          <td data-label="Quantidade">{x.quantity}</td>
                          <td data-label="Saldo">{x.balance}</td>
                          <td data-label="Data">{date(x.createdAt)}</td>
                        </>
                      ) : view === 'payments' ? (
                        <>
                          <td data-label="OS / Cliente">
                            <button className="link" onClick={() => openOrder(x.orderId)}>
                              #{x.order.number} · {x.order.customer.name}
                            </button>
                          </td>
                          <td data-label="Valor">{money(x.amountCents)}</td>
                          <td data-label="Forma">{x.method}</td>
                          <td data-label="Data">{date(x.createdAt)}</td>
                        </>
                      ) : view === 'audit' ? (
                        <>
                          <td data-label="Ação">{x.action}</td>
                          <td data-label="Usuário">{x.userName}</td>
                          <td data-label="Registro">
                            {x.entity}
                            <small>{x.entityId}</small>
                          </td>
                          <td data-label="Data">{date(x.createdAt)}</td>
                        </>
                      ) : (
                        <>
                          <td data-label="Notificação">
                            {x.orderId ? (
                              <button className="link" onClick={() => openOrder(x.orderId)}>
                                {x.message}
                              </button>
                            ) : (
                              x.message
                            )}
                          </td>
                          <td data-label="Data">{date(x.createdAt)}</td>
                        </>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : !query.error&&(
          <Empty detail={search?'Tente outro termo ou limpe os filtros.':'Os registros aparecerão aqui após o cadastro.'} action={search?<Button onClick={clear}>Limpar filtros</Button>:canCreate?<Button onClick={()=>setEditing({})}>Cadastrar primeiro registro</Button>:undefined}/>
        )}
        {query.data&&<Pagination page={page} total={total} hasNext={raw.length===25} onChange={setPage} busy={query.pending}/>}
      </section>
      {editing && (
        <Modal
          busy={a.busy}
          wide
          title={`${editing.id ? 'Editar' : 'Cadastrar'} ${view === 'customers' ? 'cliente' : view === 'users' ? 'usuário' : view === 'suppliers' ? 'fornecedor' : 'produto'}`}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d: any = Object.fromEntries(new FormData(e.currentTarget));
              for (const f of fields) {
                if (f.money) d[f.name] = Math.round(Number(d[f.name] || 0) * 100);
                else if (f.type === 'number') d[f.name] = Number(d[f.name] || 0);
              }
              if (product && !d.supplierId) delete d.supplierId;
              const target = product ? '/products' : path;
              a.run(async () => {
                if (editing.id) await patch(`${target}/${editing.id}`, d);
                else {
                  const result = await post(target, d);
                  if (result.existing) {
                    a.setError('Este telefone já pertence a um cliente cadastrado.');
                    return;
                  }
                }
                toast('Cadastro salvo com sucesso.');
                setEditing(null);
                await load();
              });
            }}
          >
            <div className="form-grid">
              {fields.map((f) => (
                <Field key={f.name} label={`${f.label}${f.required ? ' *' : ''}`}>
                  {f.options ? (
                    <select
                      name={f.name}
                      defaultValue={
                        editing[f.name] ??
                        (view === 'screens' && f.name === 'category' ? 'Telas' : f.options[0])
                      }
                    >
                      {f.options.map((v) => (
                        <option key={v} value={v}>
                          {roleNames[v] || v || 'Não se aplica'}
                        </option>
                      ))}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea name={f.name} defaultValue={editing[f.name] || ''} />
                  ) : (
                    <input
                      name={f.name}
                      defaultValue={f.money ? (editing[f.name] || 0) / 100 : editing[f.name] || ''}
                      required={f.required}
                      type={f.money ? 'number' : f.type || 'text'}
                      step={f.money ? '.01' : undefined}
                      min={f.money || f.type === 'number' ? 0 : undefined}
                      pattern={f.name==='cpf'?'[0-9]{11}':undefined}
                      inputMode={['cpf','phone','whatsapp'].includes(f.name)?'tel':undefined}
                      data-format-hint="Informe os 11 números do CPF."
                      minLength={f.type === 'password' ? 12 : undefined}
                    />
                  )}
                </Field>
              ))}
              {product && (
                <Field label="Fornecedor">
                  <select name="supplierId" defaultValue={editing.supplierId || ''}>
                    <option value="">Não informado</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <ErrorBox error={a.error} />
            <Submit busy={a.busy}>Salvar cadastro</Submit>
          </form>
        </Modal>
      )}
      {movement && (
        <Modal busy={a.busy} title={`Movimentar · ${movement.name}`} onClose={() => setMovement(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d: any = Object.fromEntries(new FormData(e.currentTarget));
              a.run(async () => {
                await post('/stock/movement', {
                  ...d,
                  quantity: Number(d.quantity),
                  productId: movement.id,
                });
                toast('Movimentação registrada.');
                setMovement(null);
                await load();
              });
            }}
          >
            <p>Saldo atual: {movement.stock} unidades</p>
            <Field label="Tipo">
              <select name="kind">
                <option value="ENTRY">Entrada</option>
                <option value="EXIT">Saída</option>
                <option value="ADJUSTMENT">Ajuste</option>
              </select>
            </Field>
            <Field label="Direção do ajuste">
              <select name="direction">
                <option value="IN">Adicionar</option>
                <option value="OUT">Retirar</option>
              </select>
            </Field>
            <Field label="Quantidade">
              <input name="quantity" type="number" required min={1} />
            </Field>
            <Field label="Motivo">
              <textarea name="note" required />
            </Field>
            <ErrorBox error={a.error} />
            <Submit busy={a.busy}>Confirmar movimento</Submit>
          </form>
        </Modal>
      )}
      {history && (
        <Modal
          wide
          title={view === 'customers' ? history.name : `${history.brand} ${history.model}`}
          onClose={() => setHistory(null)}
        >
          <h3>Histórico de ordens</h3>
          {history.orders.length ? (
            history.orders.map((o: any) => (
              <div className="summary-row" key={o.id}>
                <span>
                  <strong>
                    OS #{o.number} · {o.device?.model || history.model}
                  </strong>
                  <small>
                    {date(o.createdAt)} · {money(o.finalCents)}
                    {o.warranty ? ` · Garantia até ${date(o.warranty.endsAt)}` : ''}
                  </small>
                  <Badge status={o.status} />
                </span>
                <button
                  onClick={() => {
                    setHistory(null);
                    openOrder(o.id);
                  }}
                >
                  <ArrowRight size={18} />
                </button>
              </div>
            ))
          ) : (
            <Empty />
          )}
        </Modal>
      )}
      {confirmUser&&<Modal title={confirmUser.active?'Desativar usuário':'Ativar usuário'} busy={a.busy} onClose={()=>setConfirmUser(null)} protectChanges={false}><p>{confirmUser.active?'O usuário perderá o acesso ao sistema.':'O acesso ao sistema será restabelecido.'} Confirme a alteração para <strong>{confirmUser.name}</strong>.</p><ErrorBox error={a.error}/><Button variant={confirmUser.active?'danger':'primary'} busy={a.busy} onClick={()=>a.run(async()=>{await patch('/users/'+confirmUser.id,{active:!confirmUser.active});setConfirmUser(null);toast('Acesso atualizado.');await load()})}>Confirmar {confirmUser.active?'desativação':'ativação'}</Button></Modal>}
    </>
  );
}
