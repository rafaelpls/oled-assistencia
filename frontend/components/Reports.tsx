'use client';

import { Download, Printer } from 'lucide-react';
import { money, date, statuses } from '../lib/api';
import { Field, ErrorBox, Empty, Badge, PageSkeleton, Button } from './ui';
import {useQuery,useViewState} from '../lib/use-query';
export default function Reports() {
  const [filters,setFilters]=useViewState<any>('report-filters',{}),[applied,setApplied]=useViewState<any>('report-applied',{});
  const q:any={...applied};if(q.from)q.from=new Date(q.from+'T00:00:00').toISOString();if(q.to)q.to=new Date(q.to+'T23:59:59.999').toISOString();
  const query=useQuery<any>('/reports?'+new URLSearchParams(q));const data=query.data;
  const techniciansQuery=useQuery<any[]>('/technicians'),productsQuery=useQuery<any>('/products?limit=100');const technicians=techniciansQuery.data||[],products=productsQuery.data?.items||[];
  const load=()=>{if(JSON.stringify(filters)===JSON.stringify(applied))void query.reload();else setApplied({...filters})};
  const exportCsv = () => {
    if (!data) return;
    const cell = (s: any) =>
      '"' +
      String(s ?? '')
        .replace(/^[=+\-@]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const rows = [
      ['OS', 'Cliente', 'Modelo', 'Status', 'Técnico', 'Abertura', 'Valor'],
      ...data.orders.map((o: any) => [
        o.number,
        o.customer.name,
        o.device.model,
        statuses[o.status],
        o.technician?.name || '',
        date(o.createdAt),
        (o.finalCents / 100).toFixed(2),
      ]),
    ];
    const blob = new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob),
      link = document.createElement('a');
    link.href = url;
    link.download = 'relatorio-oled.csv';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="overline">RESULTADOS</span>
          <h1 tabIndex={-1}>Relatórios</h1>
          <p>Consulte o período, a equipe e o resultado dos serviços.</p>
        </div>
        <div className="button-group">
          <button disabled={!data||query.pending} onClick={exportCsv}>
            <Download size={17} /> Exportar CSV
          </button>
          <button disabled={!data||query.pending} onClick={() => window.print()}>
            <Printer size={17} /> PDF / impressão
          </button>
        </div>
      </div>
      <section className="panel">
        <div className="filter-grid">
          <Field label="De">
            <input
              type="date"
              value={filters.from || ''}
              onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            />
          </Field>
          <Field label="Até">
            <input
              type="date"
              value={filters.to || ''}
              onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            />
          </Field>
          <Field label="Status">
            <select
              value={filters.status || ''}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            >
              <option value="">Todos</option>
              {Object.entries(statuses).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Técnico">
            <select
              value={filters.technicianId || ''}
              onChange={(e) => setFilters({ ...filters, technicianId: e.target.value })}
            >
              <option value="">Todos</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Serviço">
            <input
              value={filters.service || ''}
              onChange={(e) => setFilters({ ...filters, service: e.target.value })}
            />
          </Field>
          <Field label="Produto">
            <select
              value={filters.productId || ''}
              onChange={(e) => setFilters({ ...filters, productId: e.target.value })}
            >
              <option value="">Todos</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button className="primary" disabled={query.pending||!!(filters.from&&filters.to&&filters.from>filters.to)} onClick={load}>
          {query.pending?'Carregando…':'Aplicar filtros'}
        </button>
        <Button onClick={()=>{setFilters({});setApplied({})}}>Limpar filtros</Button>
        {filters.from&&filters.to&&filters.from>filters.to&&<ErrorBox error="A data final deve ser igual ou posterior à inicial."/>}
        <ErrorBox error={query.error} retry={query.reload}/>
        <ErrorBox error={techniciansQuery.error||productsQuery.error} retry={()=>{void techniciansQuery.reload();void productsQuery.reload()}}/>
      </section>
      {query.pending&&<PageSkeleton/>}
      {!query.pending&&data && (
        <>
          <div className="report-metrics">
            <div className="panel">
              <small>Ordens no período</small>
              <h2>{data.total}</h2>
            </div>
            <div className="panel">
              <small>Recebimentos no período</small>
              <h2>{money(data.revenueCents)}</h2>
            </div>
            <div className="panel">
              <small>Peças utilizadas</small>
              <h2>
                {data.orders
                  .flatMap((o: any) => o.items)
                  .filter((i: any) => i.stockDeducted)
                  .reduce((s: number, i: any) => s + i.quantity, 0)}
              </h2>
            </div>
          </div>
          <section className="panel report-print">
            <h2>Ordens e serviços</h2>
            {data.truncated && (
              <p className="warning">
                Exibindo as primeiras 5.000 OS. Reduza o período para exportar todos os resultados.
              </p>
            )}
            {data.orders.length ? (
              <div className="table-wrap">
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>OS / Cliente</th>
                      <th>Aparelho / Serviços</th>
                      <th>Status</th>
                      <th>Técnico</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o: any) => (
                      <tr key={o.number}>
                        <td data-label="OS / Cliente">
                          #{o.number} · {o.customer.name}
                          <small>{date(o.createdAt)}</small>
                        </td>
                        <td data-label="Aparelho / Serviços">
                          {o.device.model}
                          <small>{o.items.map((i: any) => i.description).join(', ')}</small>
                        </td>
                        <td data-label="Status">
                          <Badge status={o.status} />
                        </td>
                        <td data-label="Técnico">{o.technician?.name || '—'}</td>
                        <td data-label="Valor">{money(o.finalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty />
            )}
            <h2>Estoque atual</h2>
            {data.stock.map((p: any) => (
              <div key={p.sku} className="summary-row">
                <span>
                  {p.name} · {p.sku}
                </span>
                <strong>{p.stock} unidades</strong>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );
}
