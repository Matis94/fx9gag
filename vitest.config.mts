import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		cloudflareTest({
			wrangler: { configPath: './wrangler.toml' },
		}),
	],
	test: {
		onConsoleLog: (log: string, type: 'stdout' | 'stderr'): boolean | void => {
			return type === 'stderr' || log.startsWith('DBG: ');
		},
		globals: true,
	},
});
