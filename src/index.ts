import { replaceUrl } from './replaceUrl';
import { generate9gagResponse } from './9gag';

export default {
	async fetch(request, env, ctx): Promise<Response> {
		console.log('Request URL:', request.url);

		const url = new URL(request.url);

		// Strona główna workera
		if (url.pathname === '/') {
			return new Response('fx9gag worker is running', {
				status: 200,
				headers: {
					'Content-Type': 'text/plain; charset=UTF-8',
				},
			});
		}

		// Obsługujemy tylko linki /gag/...
		if (!url.pathname.startsWith('/gag/')) {
			return new Response('Invalid URL', {
				status: 404,
				headers: {
					'Content-Type': 'text/plain; charset=UTF-8',
				},
			});
		}

		const url9gag = replaceUrl(url);

		const userAgent = request.headers.get('User-Agent') || '';

		console.log('User-Agent:', userAgent);
		console.log('9GAG URL:', url9gag.toString());

		const isDiscord =
			userAgent.toLowerCase().includes('discordbot');

		const isTelegram =
			userAgent.toLowerCase().includes('telegram');

		const isTwitter =
			userAgent.toLowerCase().includes('twitterbot');

		const isFacebook =
			userAgent.toLowerCase().includes('facebookexternalhit');

		const isSlack =
			userAgent.toLowerCase().includes('slackbot');

		// Boty odpowiedzialne za generowanie embedów dostają
		// specjalny HTML z metatagami OpenGraph/video.
		if (
			isDiscord ||
			isTelegram ||
			isTwitter ||
			isFacebook ||
			isSlack
		) {
			try {
				return await generate9gagResponse(url9gag);
			} catch (error) {
				console.error('generate9gagResponse failed:', error);

				return Response.redirect(url9gag.toString(), 302);
			}
		}

		// Zwykły użytkownik po kliknięciu linku trafia na 9GAG.
		return Response.redirect(url9gag.toString(), 302);
	},
} satisfies ExportedHandler<Env>;
