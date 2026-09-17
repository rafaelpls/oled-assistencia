import type { Metadata } from 'next';
import './globals.css';
import './workspace.css';
export const metadata: Metadata = {
  title: 'OLED · Assistência técnica',
  description: 'Gestão de ordens de serviço, clientes e peças.',
  icons: { icon: '/favicon.svg' },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
