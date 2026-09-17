import type { NextConfig } from 'next';
const config: NextConfig = {
  async headers() {
    // CSP ficou fora deste incremento para não arriscar uploads, imagens e proxy de API sem inventário completo de origens.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000'}/:path*`,
      },
    ];
  },
  poweredByHeader: false,
};
export default config;
