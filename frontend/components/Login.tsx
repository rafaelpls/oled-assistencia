'use client';
import { Smartphone, ArrowRight, ShieldCheck, Wrench } from 'lucide-react';
import { Field, ErrorBox, Submit, useAction } from './ui';
import { post } from '../lib/api';
export default function Login({ onLogin }: { onLogin: (u: any) => void }) {
  const a = useAction();
  return (
    <main className="login">
      <section className="login-brand">
        <div className="wordmark">
          <Smartphone /> OLED<span>GESTÃO</span>
        </div>
        <div>
          <span className="eyebrow">ASSISTÊNCIA TÉCNICA</span>
          <h1>
            Mais cuidado com
            <br />
            cada reparo.
          </h1>
          <p>
            Do primeiro atendimento à entrega.
            <br />
            Tudo organizado, em um só lugar.
          </p>
          <div className="login-line">
            <Wrench size={22} />
            <span>Seu trabalho, com mais clareza.</span>
          </div>
        </div>
        <small>OLED · Sistema de gestão</small>
      </section>
      <section className="login-form">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.currentTarget);
            a.run(async () => onLogin(await post('/auth/login', Object.fromEntries(d))));
          }}
        >
          <div className="login-symbol">
            <Smartphone size={26} />
          </div>
          <h2>Bem-vindo de volta</h2>
          <p>Acesse sua assistência para continuar.</p>
          <Field label="E-mail">
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              placeholder="seu@email.com"
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              placeholder="Digite sua senha"
            />
          </Field>
          <ErrorBox error={a.error} />
          <Submit busy={a.busy}>
            Entrar <ArrowRight size={18} />
          </Submit>
          <small className="secure">
            <ShieldCheck size={15} /> Acesso restrito à equipe autorizada
          </small>
        </form>
      </section>
    </main>
  );
}
export function ChangePassword({ onDone }: { onDone: () => void }) {
  const a = useAction();
  return (
    <main className="password-page">
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          const d = Object.fromEntries(new FormData(e.currentTarget));
          a.run(async () => {
            await post('/auth/password', d);
            onDone();
          });
        }}
      >
        <h1>Defina sua nova senha</h1>
        <p>Troque a senha inicial para começar a usar o sistema.</p>
        <Field label="Senha atual">
          <input name="current" type="password" required autoComplete="current-password" />
        </Field>
        <Field label="Nova senha" hint="Use pelo menos 12 caracteres.">
          <input
            name="password"
            type="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </Field>
        <ErrorBox error={a.error} />
        <Submit busy={a.busy}>Salvar e acessar novamente</Submit>
      </form>
    </main>
  );
}
