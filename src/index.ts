import { blogRedirects } from "./redirects";

interface SubscriberRecord {
	status: "confirmed" | "pending" | "unsubscribed";
}

interface EmailMessage {
	to: string;
	from: string;
	subject: string;
	html: string;
	text: string;
}

interface EmailSender {
	send(message: EmailMessage): Promise<void>;
}

interface Env {
	ASSETS: Fetcher;
	DB: D1Database;
	EMAIL: EmailSender;
	MAIL_FROM: string;
	SITE_URL: string;
	// Bound once the R2 bucket is created (see README "Migrating images to R2").
	// Optional so the Worker keeps working before that binding exists.
	MEDIA?: R2Bucket;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function htmlResponse(title: string, message: string): Response {
	return new Response(
		`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p><p><a href="/">Return to gehariharan.com</a></p></main></body></html>`,
		{ headers: { "content-type": "text/html; charset=UTF-8" } },
	);
}

function jsonResponse(body: Record<string, string>, status = 200): Response {
	return Response.json(body, { status });
}

function getSiteUrl(env: Env, request: Request): string {
	return env.SITE_URL || new URL(request.url).origin;
}

async function subscribe(request: Request, env: Env): Promise<Response> {
	const body: unknown = await request.json().catch(() => null);
	if (
		!body ||
		typeof body !== "object" ||
		!("email" in body) ||
		typeof body.email !== "string"
	) {
		return jsonResponse({ error: "Enter a valid email address." }, 400);
	}

	const email = body.email.trim().toLowerCase();
	if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
		return jsonResponse({ error: "Enter a valid email address." }, 400);
	}

	const existing = await env.DB.prepare(
		"SELECT status FROM subscribers WHERE email = ?",
	)
		.bind(email)
		.first<SubscriberRecord>();

	if (existing?.status === "confirmed") {
		return jsonResponse({
			message: "You are already subscribed. Thank you for reading.",
		});
	}

	const token = crypto.randomUUID();
	await env.DB.prepare(
		`INSERT INTO subscribers (email, confirmation_token, status)
		 VALUES (?, ?, 'pending')
		 ON CONFLICT(email) DO UPDATE SET
		   confirmation_token = excluded.confirmation_token,
		   status = 'pending',
		   updated_at = unixepoch()`,
	)
		.bind(email, token)
		.run();

	const siteUrl = getSiteUrl(env, request);
	const confirmUrl = `${siteUrl}/api/confirm?token=${encodeURIComponent(token)}`;
	await env.EMAIL.send({
		to: email,
		from: env.MAIL_FROM,
		subject: "Confirm your gehariharan.com subscription",
		text: `Confirm your subscription: ${confirmUrl}`,
		html: `<p>Thanks for subscribing to gehariharan.com.</p><p><a href="${confirmUrl}">Confirm your subscription</a></p>`,
	});

	return jsonResponse({
		message: "Check your inbox to confirm your subscription.",
	});
}

async function confirmSubscription(request: Request, env: Env): Promise<Response> {
	const token = new URL(request.url).searchParams.get("token");
	if (!token) {
		return htmlResponse("Invalid link", "This confirmation link is incomplete.");
	}

	const result = await env.DB.prepare(
		"UPDATE subscribers SET status = 'confirmed', updated_at = unixepoch() WHERE confirmation_token = ? AND status = 'pending'",
	)
		.bind(token)
		.run();

	return result.meta.changes
		? htmlResponse("You are subscribed", "The next post will arrive in your inbox.")
		: htmlResponse(
				"Link already used",
				"This confirmation link is no longer active. You may already be subscribed.",
			);
}

async function unsubscribe(request: Request, env: Env): Promise<Response> {
	const token = new URL(request.url).searchParams.get("token");
	if (!token) {
		return htmlResponse("Invalid link", "This unsubscribe link is incomplete.");
	}

	const result = await env.DB.prepare(
		"UPDATE subscribers SET status = 'unsubscribed', updated_at = unixepoch() WHERE confirmation_token = ? AND status = 'confirmed'",
	)
		.bind(token)
		.run();

	return result.meta.changes
		? htmlResponse("You are unsubscribed", "You will not receive further emails.")
		: htmlResponse(
				"Link already used",
				"This unsubscribe link is no longer active.",
			);
}

async function serveMedia(request: Request, env: Env, key: string): Promise<Response> {
	if (!env.MEDIA) {
		return new Response("Not found", { status: 404 });
	}

	const object = await env.MEDIA.get(key);
	if (!object) {
		return new Response("Not found", { status: 404 });
	}

	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", "public, max-age=31536000, immutable");
	// R2Bucket.get() has no body for HEAD requests; avoid passing a null body
	// with a non-null Content-Length, which some clients reject.
	return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "POST" && url.pathname === "/api/subscribe") {
			return subscribe(request, env);
		}
		if (request.method === "GET" && url.pathname === "/api/confirm") {
			return confirmSubscription(request, env);
		}
		if (request.method === "GET" && url.pathname === "/api/unsubscribe") {
			return unsubscribe(request, env);
		}
		if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/media/")) {
			return serveMedia(request, env, url.pathname.slice("/media/".length));
		}

		const redirectTarget = blogRedirects[url.pathname];
		if (redirectTarget) {
			return Response.redirect(new URL(redirectTarget, url).toString(), 301);
		}

		return env.ASSETS.fetch(request);
	},
} satisfies ExportedHandler<Env>;
