import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("blog landing page", () => {
	it("serves the newsletter-first landing page", async () => {
		const response = await SELF.fetch("https://example.com/");

		expect(response.status).toBe(200);
		expect(await response.text()).toContain("Get the next post first.");
	});
});
