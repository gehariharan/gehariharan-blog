# gehariharan.com

A Cloudflare-native personal blog and newsletter foundation. Static assets are served from
the Worker; subscriptions are stored in D1 and confirmed through Cloudflare Email Service.

## Cloudflare resources

1. Create the D1 database:

   ```sh
   npx wrangler d1 create gehariharan-blog
   ```

2. Copy the returned `database_id` into `wrangler.jsonc`.
3. Apply the subscription schema:

   ```sh
   npx wrangler d1 migrations apply gehariharan-blog --remote
   ```

4. Configure and verify `newsletter@gehariharan.com` in Cloudflare Email Service, then
   deploy:

   ```sh
   npm run deploy
   ```

The `MAIL_FROM` and `SITE_URL` values in `wrangler.jsonc` must match the verified sending
address and production domain before deployment.

## Publishing

The landing page is in `public/index.html`. Add imported Blogger posts as static HTML pages
in `public/` initially; the next iteration can convert the archive to Markdown-based content
and generate the post index, RSS feed, sitemap, and permanent redirects.

## Telegram

Set the `href` and remove `aria-disabled="true"` on `#telegram-link` in
`public/index.html` once the Telegram channel has been created.
