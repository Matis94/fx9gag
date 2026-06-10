import { HTMLRewriterElementContentHandlers } from '@cloudflare/workers-types';
import SocialMediaPosting = Gag.SocialMediaPosting;
import GagPost = Gag.Post;

interface FxGagPost {
	type: 'image' | 'video';
	imageUrl: string;
	videoUrl: string | undefined;
	width: number;
	height: number;
}

// ld+json does not have video information on gifs, but it'll be used if we have issues parsing config
function parseJsonLd(message: string): SocialMediaPosting | undefined {
	const regex = /<script type="application\/ld\+json">(.*?)<\/script>/gs;
	const matches = message.matchAll(regex);
	const scripts = Array.from(matches, match => match[1]);
	if (scripts.length === 0) {
		return undefined;
	}
	return JSON.parse(scripts[0]) as SocialMediaPosting;
}

function parseConfigJson(message: string): GagPost | undefined {
	const regex = /<script type="text\/javascript">window._config = JSON.parse\((.+?)\);<\/script>/gs;
	const matches = message.matchAll(regex);
	const scripts = Array.from(matches, match => match[1]);
	if (scripts.length === 0) {
		return undefined;
	}
	const gagConfig = JSON.parse(JSON.parse(scripts[0])) as Gag.GagConfig;
	return gagConfig.data.post;
}

function extractPostData(message: string): FxGagPost | null {
	const gagPost = parseConfigJson(message);
	if (gagPost) {
		return {
			type: gagPost.type === 'Animated' ? 'video' : 'image',
			imageUrl: gagPost.images.image700.url,
			videoUrl: gagPost.images.image460sv?.url,
			width: gagPost.images.image700.width,
			height: gagPost.images.image700.height
		};
	}

	const metaAttributes = parseJsonLd(message);
	if (metaAttributes) {
		return {
			type: metaAttributes.video ? 'video' : 'image',
			imageUrl: metaAttributes.image,
			videoUrl: metaAttributes.video?.contentUrl,
			width: 0,
			height: 0
		};
	}

	return null;
}

const removeElement: HTMLRewriterElementContentHandlers = {
	element(element: Element): void {
		element.remove();
	}
};

export async function generate9gagResponse(url: URL): Promise<Response> {
	console.log('Fetching 9gag:', url.toString());

	const response = await fetch(url, {
		cf: {
			cacheEverything: true,
			cacheTtl: 2_592_000 // 30 days
		},
		headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' }
	});

	if (!response.ok) {
		console.error('Error fetching 9gag: ', url.toString(), response.status);
		return new Response('Error fetching ' + url.toString(), { status: 500 });
	}

	const rewriter = new HTMLRewriter();
	const message = await response.clone().text();

	const fxPost = extractPostData(message);
	if (fxPost === null) {
		console.error('No data found in 9gag response');
		return new Response('No data found in 9gag response', { status: 500 });
	}

	rewriter
		.on('script', removeElement)
		.on('style', removeElement)
		.on('link[rel=preload]', removeElement)
		.on('div', removeElement)
		.on('meta[property="og:site_name"]', {
			element(element: Element): void {
				element.setAttribute('content', 'FX9GAG');
			}
		});

	if (fxPost.type === 'video') {
		const videoMetaAttributes = [
			`<meta property="theme-color" content="#00a8fc" />`,
			// twitter
			`<meta property="twitter:player:width" content="${fxPost.width}" />`,
			`<meta property="twitter:player:height" content="${fxPost.height}" />`,
			`<meta property="twitter:player:stream" content="${fxPost.videoUrl}" />`,
			`<meta property="twitter:player:stream:content_type" content="video/mp4" />`,
			// og
			`<meta property="og:video:width" content="${fxPost.width}" />`,
			`<meta property="og:video:height" content="${fxPost.height}" />`,
			`<meta property="og:video" content="${fxPost.videoUrl}" />`,
			`<meta property="og:video:secure_url" content="${fxPost.videoUrl}" />`,
			`<meta property="og:video:type" content="video/mp4" />`
		];
		rewriter.on('meta[property="og:image"]', {
			element(element: Element): void | Promise<void> {
				videoMetaAttributes.forEach((meta) => {
					element.after(meta, { html: true });
				});
			}
		});
	}

	return rewriter.transform(response);
}
