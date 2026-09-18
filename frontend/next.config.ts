import type { NextConfig } from 'next';
const staticExport = process.env.CLOUDFLARE_STATIC_EXPORT === 'true';
const config: NextConfig = {
  ...(staticExport
    ? { output: 'export' as const }
    : {
        async headers() {
          return [
            {
              source: '/:path*',
              headers: [
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
                {
                  key: 'Permissions-Policy',
                  value:
                    'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
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
      }),
  poweredByHeader: false,
};
export default config;
