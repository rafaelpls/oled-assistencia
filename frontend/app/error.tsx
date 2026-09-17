'use client';

import { useEffect } from 'react';
import { Button } from '../components/ui';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="content" id="main-content">
      <div className="page-heading">
        <div>
          <span className="overline">ERRO</span>
          <h1>Não foi possível carregar esta tela</h1>
          <p>Tente novamente. Se o problema persistir, informe o suporte.</p>
        </div>
      </div>
      <div className="error" role="alert">
        <span>Ocorreu uma falha inesperada.</span>
        <Button onClick={() => reset()}>Tentar novamente</Button>
      </div>
    </main>
  );
}
