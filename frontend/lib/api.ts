let refreshing: Promise<Response> | null = null;
export async function api(path: string, options: RequestInit = {}): Promise<any> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  let res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  if (res.status === 401 && !path.startsWith('/auth/')) {
    refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' }).finally(
      () => {
        refreshing = null;
      },
    );
    const refresh = await refreshing;
    if (refresh.ok)
      res = await fetch(`/api${path}`, {
        ...options,
        headers,
        credentials: 'include',
        cache: 'no-store',
      });
    else window.dispatchEvent(new Event('oled:logout'));
  }
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      Array.isArray(data?.message)
        ? data.message.join(', ')
        : data?.message || 'Não foi possível conectar ao servidor.',
    );
  return data;
}
export const post = (path: string, data: any = {}) =>
  api(path, { method: 'POST', body: JSON.stringify(data) });
export const patch = (path: string, data: any) =>
  api(path, { method: 'PATCH', body: JSON.stringify(data) });
export const money = (n: number = 0) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
export const date = (v: string) =>
  v ? new Date(v).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export const statuses: Record<string, string> = {
  OPEN: 'Aberta',
  AWAITING_DIAGNOSIS: 'Aguardando diagnóstico',
  ANALYSIS: 'Em análise',
  AWAITING_APPROVAL: 'Aguardando aprovação',
  AWAITING_PART: 'Aguardando peça',
  REPAIR: 'Em reparo',
  FINALIZED: 'Finalizada',
  AWAITING_PICKUP: 'Aguardando retirada',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelada',
  WARRANTY: 'Garantia',
};
export const roleNames: Record<string, string> = {
  ADMIN: 'Administrador',
  TECHNICIAN: 'Técnico',
  ATTENDANT: 'Atendente',
};
export const methods: Record<string, string> = {
  PIX: 'PIX',
  CASH: 'Dinheiro',
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  OTHER: 'Outros',
};
