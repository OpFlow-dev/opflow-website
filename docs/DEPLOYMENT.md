# Deployment

## Strategy

Use a two-step deployment for `opflow.cc`:

1. Validate build on a random high port.
2. Cut over to port `80` only after validation passes.

## Procedure

1. Upload updated repository snapshot to server.
2. Start static server on a random free port (example command):
   ```bash
   python3 -m http.server 58050
   ```
   or any other available high port.
3. Validate pages and run QA checks from the deployment directory:
   ```bash
   npm run qa
   ```
4. Confirm canonical behavior and route traversal manually.
5. Move traffic to port `80` via process manager / reverse proxy update.
6. Run post-cutover smoke test (`/`, `/list/`, `/categories/`, `/tags/`, `/about/`, sample post URL).

## Rollback

- Keep previous deploy artifact and previous port mapping.
- If smoke tests fail after cutover, restore previous mapping immediately.
