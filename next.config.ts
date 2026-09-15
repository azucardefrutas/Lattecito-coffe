import type { NextConfig } from 'next';
const config: NextConfig = {
  // Vercel's Next.js builder expects its manifests in `.next`.
  // Separate directories are only needed while running the three local surfaces together.
  distDir: process.env.VERCEL
    ? '.next'
    : process.env.APP_SURFACE === 'admin'
      ? '.next-admin'
      : process.env.APP_SURFACE === 'catalog-admin'
        ? '.next-catalog-admin'
        : '.next',
  env: { APP_SURFACE: process.env.APP_SURFACE ?? 'public' },
  poweredByHeader: false,
  serverExternalPackages: ['node:sqlite'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};
export default config;
