import { spawn } from 'node:child_process';
const [requestedSurface = 'public', command = 'dev'] = process.argv.slice(2);
const surface = process.env.VERCEL
  ? (process.env.APP_SURFACE ?? requestedSurface)
  : requestedSurface;
if (
  !['public', 'admin', 'catalog-admin'].includes(surface) ||
  !['dev', 'build', 'start'].includes(command)
)
  process.exit(1);
const args = [
  'node_modules/next/dist/bin/next',
  command,
  ...(command === 'build'
    ? []
    : [
        '--hostname',
        '127.0.0.1',
        '--port',
        surface === 'admin' ? '3001' : surface === 'catalog-admin' ? '3002' : '3000',
      ]),
];
const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    APP_SURFACE: surface,
    NEXT_TELEMETRY_DISABLED: '1',
    ...(surface === 'catalog-admin' ? { CATALOG_ADMIN_ENABLED: 'true' } : {}),
  },
});
child.on('exit', (code) => process.exit(code ?? 1));
