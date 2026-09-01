import { HTMLRewriterElementContentHandlers } from '@cloudflare/workers-types';
import SocialMediaPosting = Gag.SocialMediaPosting;
import GagPost = Gag.Post;

interface FxGagPost {
	type: 'image' | 'video';
	imageUrl: string;
	videoUrl?: string;
	width: number;
	height: number;
	points?: number;
	comments?: number;
}

function parseJsonLd(message: string): SocialMediaPosting | undefined {
	const regex = /<script type="application\/ld\+json">(.*?)<\/script>/gs;
	const matches = message.matchAll(regex);
	const scripts = Array.from(matches, match => match[1]);

	if (scripts.length === 0) {
		return undefined;
	}

	try {
		return JSON.parse(scripts[0]) as SocialMediaPosting;
	} catch (error) {
		console.error('Failed to parse ld+json:', error);
		return undefined;
	}
}

function parseConfigJson(message: string): GagPost | undefined {
	const regex =
		/<script type="text\/javascript">window\._config = JSON\.parse\((.+?)\);<\/script>/gs;

	const matches = message.matchAll(regex);
	const scripts = Array.from(matches, match => match[1]);

	if (scripts.length === 0) {
		return undefined;
	}

	try {
		const gagConfig = JSON.parse(
			JSON.parse(scripts[0])
		) as Gag.GagConfig;

		return gagConfig.data.post;
	} catch (error) {
		console.error('Failed to parse window._config:', error);
		return undefined;
	}
}

function toNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === 'string') {
		const parsed = Number(
			value
				.replace(/,/g, '')
				.replace(/\s/g, '')
				.trim()
		);

		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return undefined;
}

function findNumberByKeys(
	obj: unknown,
	keys: string[],
	depth = 0
): number | undefined {
	if (depth > 8 || obj === null || typeof obj !== 'object') {
		return undefined;
	}

	if (Array.isArray(obj)) {
		for (const item of obj) {
			const result = findNumberByKeys(item, keys, depth + 1);

			if (result !== undefined) {
				return result;
			}
		}

		return undefined;
	}

	const record = obj as Record<string, unknown>;

	for (const key of keys) {
		if (key in record) {
			const result = toNumber(record[key]);

			if (result !== undefined) {
				return result;
			}
		}
	}

	for (const value of Object.values(record)) {
		const result = findNumberByKeys(value, keys, depth + 1);

		if (result !== undefined) {
			return result;
		}
	}

	return undefined;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function extractPostData(message: string): FxGagPost | null {
	const gagPost = parseConfigJson(message);

	if (gagPost) {
		const postAny = gagPost as any;
		const imagesAny = gagPost.images as any;

		const points =
			toNumber(postAny.upVoteCount) ??
			toNumber(postAny.upvoteCount) ??
			findNumberByKeys(postAny, [
				'upVoteCount',
				'upvoteCount',
				'upVotes',
				'points'
			]);

		const comments =
			toNumber(postAny.commentsCount) ??
			toNumber(postAny.commentCount) ??
			findNumberByKeys(postAny, [
				'commentsCount',
				'commentCount'
			]);

		const image700 = imagesAny.image700;
		const image460 = imagesAny.image460;
		const image460sv = imagesAny.image460sv;
		const image460svwm = imagesAny.image460svwm;

		const imageUrl =
			image700?.url ??
			image460?.url ??
			'';

		const videoUrl =
			image460sv?.url ??
			image460svwm?.url ??
			undefined;

		/*
		 * Dla video bierzemy rzeczywiste proporcje MP4.
		 * W Twoim przykładzie jest to 460x817, czyli pionowe video.
		 */
		const width =
			image460sv?.width ??
			image700?.width ??
			image460?.width ??
			0;

		const height =
			image460sv?.height ??
			image700?.height ??
			image460?.height ??
			0;

		return {
			type:
				gagPost.type === 'Animated' || videoUrl
					? 'video'
					: 'image',
			imageUrl,
			videoUrl,
			width,
			height,
			points,
			comments
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

function createStatsDescription(post: FxGagPost): string {
	if (
		post.points !== undefined &&
		post.comments !== undefined
	) {
		return `${post.points.toLocaleString('en-US')} points • ${post.comments.toLocaleString('en-US')} comments`;
	}

	if (post.points !== undefined) {
		return `${post.points.toLocaleString('en-US')} points`;
	}

	if (post.comments !== undefined) {
		return `${post.comments.toLocaleString('en-US')} comments`;
	}

	return '9GAG';
}

const removeElement: HTMLRewriterElementContentHandlers = {
	element(element: Element): void {
		element.remove();
	}
};

export async function generate9gagResponse(
	url: URL
): Promise<Response> {
	console.log('Fetching 9gag:', url.toString());

	const response = await fetch(url, {
		cf: {
			cacheEverything: true,
			cacheTtl: 2_592_000
		},
		headers: {
			'User-Agent': 'TelegramBot (like TwitterBot)'
		}
	});

	if (!response.ok) {
		console.error(
			'Error fetching 9gag:',
			url.toString(),
			response.status
		);

		return new Response(
			'Error fetching ' + url.toString(),
			{ status: 500 }
		);
	}

	const message = await response.clone().text();

	const fxPost = extractPostData(message);

	if (fxPost === null) {
		console.error('No data found in 9gag response');

		return new Response(
			'No data found in 9gag response',
			{ status: 500 }
		);
	}

	console.log('Parsed post:', {
		type: fxPost.type,
		videoUrl: fxPost.videoUrl,
		width: fxPost.width,
		height: fxPost.height,
		points: fxPost.points,
		comments: fxPost.comments
	});

	const description = createStatsDescription(fxPost);
	const escapedDescription = escapeHtml(description);

	const rewriter = new HTMLRewriter();

	/*
	 * Usuwamy elementy, których boty Discorda nie potrzebują.
	 */
	rewriter
		.on('script', removeElement)
		.on('style', removeElement)
		.on('link[rel=preload]', removeElement)
		.on('div', removeElement)

		/*
		 * Usuwamy stare opisy 9GAG.
		 * Dzięki temu Discord nie wybierze:
		 * "Watch the video and join the fun..."
		 */
		.on('meta[property="og:description"]', removeElement)
		.on('meta[name="twitter:description"]', removeElement)
		.on('meta[property="twitter:description"]', removeElement)

		/*
		 * Usuwamy stare video meta, żeby Discord
		 * nie miał kilku sprzecznych wersji.
		 */
		.on('meta[property="og:video"]', removeElement)
		.on('meta[property="og:video:url"]', removeElement)
		.on('meta[property="og:video:secure_url"]', removeElement)
		.on('meta[property="og:video:type"]', removeElement)
		.on('meta[property="og:video:width"]', removeElement)
		.on('meta[property="og:video:height"]', removeElement)

		.on('meta[name="twitter:player"]', removeElement)
		.on('meta[name="twitter:player:width"]', removeElement)
		.on('meta[name="twitter:player:height"]', removeElement)
		.on('meta[name="twitter:player:stream"]', removeElement)
		.on(
			'meta[name="twitter:player:stream:content_type"]',
			removeElement
		)

		.on('meta[property="og:site_name"]', {
			element(element: Element): void {
				element.setAttribute('content', 'FX9GAG');
			}
		});

	/*
	 * Najważniejsza zmiana:
	 * dokładamy własne meta BEZPOŚREDNIO do HEAD.
	 */
	rewriter.on('head', {
		element(element: Element): void {
			let meta = `
<meta name="theme-color" content="#00a8fc">

<meta property="og:description" content="${escapedDescription}">
<meta name="twitter:description" content="${escapedDescription}">
`;

			if (
				fxPost.type === 'video' &&
				fxPost.videoUrl
			) {
				const videoUrl = escapeHtml(fxPost.videoUrl);

				meta += `
<meta property="og:type" content="video.other">

<meta property="og:video" content="${videoUrl}">
<meta property="og:video:url" content="${videoUrl}">
<meta property="og:video:secure_url" content="${videoUrl}">
<meta property="og:video:type" content="video/mp4">
<meta property="og:video:width" content="${fxPost.width}">
<meta property="og:video:height" content="${fxPost.height}">

<meta name="twitter:card" content="player">
<meta name="twitter:player:width" content="${fxPost.width}">
<meta name="twitter:player:height" content="${fxPost.height}">
<meta name="twitter:player:stream" content="${videoUrl}">
<meta name="twitter:player:stream:content_type" content="video/mp4">
`;
			}

			element.append(meta, {
				html: true
			});
		}
	});

	return rewriter.transform(response);
}
