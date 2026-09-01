import { HTMLRewriterElementContentHandlers } from '@cloudflare/workers-types';
import SocialMediaPosting = Gag.SocialMediaPosting;
import GagPost = Gag.Post;

interface FxGagPost {
	type: 'image' | 'video';
	imageUrl: string;
	videoUrl: string | undefined;
	width: number;
	height: number;
	points?: number;
	comments?: number;
}

// ld+json does not have video information on gifs,
// but it'll be used if we have issues parsing config
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
		const gagConfig = JSON.parse(JSON.parse(scripts[0])) as Gag.GagConfig;
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
		const normalized = value
			.replace(/,/g, '')
			.replace(/\s/g, '')
			.trim();

		const parsed = Number(normalized);

		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return undefined;
}

function extractPostData(message: string): FxGagPost | null {
	const gagPost = parseConfigJson(message);

	if (gagPost) {
		const postAny = gagPost as any;
		const imagesAny = gagPost.images as any;

		const points = toNumber(
			postAny.upVoteCount ??
			postAny.upvoteCount ??
			postAny.upVotes ??
			postAny.score ??
			postAny.points
		);

		const comments = toNumber(
			postAny.commentsCount ??
			postAny.commentCount ??
			postAny.comments ??
			postAny.comment
		);

		const image700 = imagesAny.image700;
		const image460 = imagesAny.image460;
		const image460sv = imagesAny.image460sv;
		const image460svwm = imagesAny.image460svwm;

		const imageUrl =
			image700?.url ??
			image460?.url ??
			image460sv?.url ??
			'';

		const videoUrl =
			image460sv?.url ??
			image460svwm?.url ??
			undefined;

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
			height: 0,
			points: undefined,
			comments: undefined
		};
	}

	return null;
}

function createStatsDescription(post: FxGagPost): string | null {
	if (post.points !== undefined && post.comments !== undefined) {
		return `${post.points.toLocaleString('en-US')} points • ${post.comments.toLocaleString('en-US')} comments`;
	}

	if (post.points !== undefined) {
		return `${post.points.toLocaleString('en-US')} points`;
	}

	if (post.comments !== undefined) {
		return `${post.comments.toLocaleString('en-US')} comments`;
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

	const rewriter = new HTMLRewriter();
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

	const statsDescription = createStatsDescription(fxPost);

	rewriter
		.on('script', removeElement)
		.on('style', removeElement)
		.on('link[rel=preload]', removeElement)
		.on('div', removeElement)

		.on('meta[property="og:site_name"]', {
			element(element: Element): void {
				element.setAttribute('content', 'FX9GAG');
			}
		})

		.on('meta[property="og:description"]', {
			element(element: Element): void {
				if (statsDescription) {
					element.setAttribute(
						'content',
						statsDescription
					);
				}
			}
		})

		.on('meta[name="twitter:description"]', {
			element(element: Element): void {
				if (statsDescription) {
					element.setAttribute(
						'content',
						statsDescription
					);
				}
			}
		});

	if (fxPost.type === 'video' && fxPost.videoUrl) {
		const videoMetaAttributes = [
			`<meta name="theme-color" content="#00a8fc" />`,

			`<meta name="twitter:card" content="player" />`,
			`<meta name="twitter:player:width" content="${fxPost.width}" />`,
			`<meta name="twitter:player:height" content="${fxPost.height}" />`,
			`<meta name="twitter:player:stream" content="${fxPost.videoUrl}" />`,
			`<meta name="twitter:player:stream:content_type" content="video/mp4" />`,

			`<meta property="og:type" content="video.other" />`,
			`<meta property="og:video:width" content="${fxPost.width}" />`,
			`<meta property="og:video:height" content="${fxPost.height}" />`,
			`<meta property="og:video" content="${fxPost.videoUrl}" />`,
			`<meta property="og:video:url" content="${fxPost.videoUrl}" />`,
			`<meta property="og:video:secure_url" content="${fxPost.videoUrl}" />`,
			`<meta property="og:video:type" content="video/mp4" />`
		];

		rewriter.on('meta[property="og:image"]', {
			element(element: Element): void {
				videoMetaAttributes.forEach((meta) => {
					element.after(meta, { html: true });
				});
			}
		});
	}

	return rewriter.transform(response);
}
