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

The landing page is in `public/index.html`. Blog content is migrated from the Blogger WXR
export via `scripts/migrate-blogger.mjs` (see below), which generates the archive, RSS feed,
sitemap, and permanent redirects automatically.

### Migrating Blogger content

```sh
node scripts/migrate-blogger.mjs
```

Reads `migration/blogger-export.xml` and (re)generates `public/blog/<slug>/index.html` for
every post, `public/blog/index.html` (archive), `public/rss.xml`, `public/sitemap.xml`,
`src/redirects.ts` (old Blogger URL → new slug 301 redirects), and the homepage's latest
posts section.

### Migrating images to R2

Post content currently hotlinks images from `blogger.googleusercontent.com`. To move them to
your own Cloudflare R2 storage instead:

1. Enable R2 once in the Cloudflare dashboard: **dashboard → your account → R2 → Enable R2**
   (free tier: 10 GB storage, plenty for the ~106 images in this blog).
2. Create the bucket:

   ```sh
   npx wrangler r2 bucket create gehariharan-blog-media
   ```

3. Add the binding to `wrangler.jsonc`:

   ```jsonc
   "r2_buckets": [
     { "binding": "MEDIA", "bucket_name": "gehariharan-blog-media" }
   ]
   ```

4. Run the migration pipeline (extract + download already done; re-run `extract`/`download`
   only if new posts are added later):

   ```sh
   node scripts/migrate-images-to-r2.mjs extract    # scan public/blog/** for image URLs
   node scripts/migrate-images-to-r2.mjs download    # download into migration/images/files/
   node scripts/migrate-images-to-r2.mjs upload      # upload to the R2 bucket
   node scripts/migrate-images-to-r2.mjs rewrite     # rewrite post HTML to use /media/<file>
   ```

5. Deploy: `npm run deploy`. The Worker already serves `/media/*` from the `MEDIA` R2
   binding (`src/index.ts`) — it 404s gracefully today since the binding doesn't exist yet.

## Telegram

Set the `href` and remove `aria-disabled="true"` on `#telegram-link` in
`public/index.html` once the Telegram channel has been created.
