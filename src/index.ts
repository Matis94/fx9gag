import { replaceUrl } from './replaceUrl';
import { generate9gagResponse } from './9gag';

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.toml`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx): Promise<Response> {
		console.log('Request URL:', request.url);
		const url = new URL(request.url);

		if (url.pathname === '/') {
			return Response.redirect('https://github.com/kxalex/fx9gag', 301);
		} else if (!url.pathname.startsWith('/gag/')) {
			return new Response('Invalid URL', { status: 404 });
		}

		const url9gag = replaceUrl(url);

		const userAgent = request.headers.get('User-Agent') || '';
		console.log('User-Agent:', userAgent);
		if (userAgent.includes('Telegram')) { // TelegramBot (like TwitterBot)
			return generate9gagResponse(url9gag);
		}

		return Response.redirect(url9gag.toString(), 301);
	}
} satisfies ExportedHandler<Env>;
