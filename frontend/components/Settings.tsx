'use client';
import { useEffect, useState } from 'react';
import { api, patch, post } from '../lib/api';
import { Field, ErrorBox, Submit, useAction, PageSkeleton, toast } from './ui';
export default function Settings({ user }: { user: any }) {
  const [settings, setSettings] = useState<any>(null),
    [saved, setSaved] = useState(false),[loading,setLoading]=useState(user.role==='ADMIN');
  const a = useAction();
  useEffect(() => {
    if (user.role === 'ADMIN') a.run(async () => {try{setSettings(await api('/settings'))}finally{setLoading(false)}});
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="overline">PREFERÊNCIAS</span>
          <h1 tabIndex={-1}>Configurações</h1>
          <p>Identidade, atendimento e segurança.</p>
        </div>
      </div>
      {loading&&<PageSkeleton/>}
      {!settings&&<ErrorBox error={a.error} retry={()=>a.run(async()=>{setSettings(await api('/settings'))})}/>}
      {settings && (
        <form
          className="panel"
          onInput={()=>setSaved(false)}
          onSubmit={(e) => {
            e.preventDefault();
            const d: any = Object.fromEntries(new FormData(e.currentTarget));
            d.warrantyDays = Number(d.warrantyDays);
            d.printCopies = Number(d.printCopies);
            a.run(async () => {
              setSettings(await patch('/settings', d));
              setSaved(true);toast('Configurações salvas.');
            });
          }}
        >
          <h2>Sua assistência</h2>
          <div className="form-grid">
            {[
              ['name', 'Nome da assistência'],
              ['logo', 'URL HTTPS do logo'],
              ['cnpj', 'CNPJ'],
              ['phone', 'Telefone'],
              ['whatsapp', 'WhatsApp'],
              ['address', 'Endereço'],
              ['hours', 'Horário de atendimento'],
              ['orderPrefix', 'Prefixo da OS'],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                <input name={k} defaultValue={settings[k]} required={k === 'name'} />
              </Field>
            ))}
            <Field label="Garantia padrão (dias)">
              <input
                type="number"
                name="warrantyDays"
                min={0}
                max={3650}
                defaultValue={settings.warrantyDays}
              />
            </Field>
            <Field label="Vias de impressão">
              <input
                type="number"
                name="printCopies"
                min={1}
                max={3}
                defaultValue={settings.printCopies}
              />
            </Field>
          </div>
          <Field
            label="Termos da assistência"
            hint="As novas OS guardarão uma cópia destes termos."
          >
            <textarea
              name="terms"
              rows={9}
              defaultValue={settings.terms}
              placeholder="Condições de garantia, retirada, dados pessoais, danos preexistentes…"
            />
          </Field>
          <ErrorBox error={a.error} />
          {saved && <p className="success">Configurações salvas.</p>}
          <Submit busy={a.busy}>Salvar configurações</Submit>
        </form>
      )}
      <form
        className="panel password-settings"
        onSubmit={(e) => {
          e.preventDefault();
          a.run(async () => {
            await post('/auth/password', Object.fromEntries(new FormData(e.currentTarget)));
            window.dispatchEvent(new Event('oled:logout'));
          });
        }}
      >
        <h2>Alterar senha</h2>
        <div className="form-grid">
          <Field label="Senha atual">
            <input name="current" type="password" required autoComplete="current-password" />
          </Field>
          <Field label="Nova senha (mínimo 12 caracteres)">
            <input
              name="password"
              type="password"
              minLength={12}
              required
              autoComplete="new-password"
            />
          </Field>
        </div>
        <ErrorBox error={a.error} />
        <Submit busy={a.busy}>Atualizar senha</Submit>
      </form>
    </>
  );
}
