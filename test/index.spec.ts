import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("blog landing page", () => {
	it("serves the newsletter-first landing page", async () => {
		const response = await SELF.fetch("https://example.com/");

		expect(response.status).toBe(200);
		expect(await response.text()).toContain("Never miss a post");
	});

	it("redirects to /blog/ when skip_landing cookie is present", async () => {
		const response = await SELF.fetch("https://example.com/", {
			headers: { cookie: "skip_landing=true" },
			redirect: "manual",
		});

		expect(response.status).toBe(302);
		expect(response.headers.get("location")).toBe("https://example.com/blog/");
	});
});
