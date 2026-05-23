# Security Policy

## Secret Handling

- Never commit production credentials, admin passwords, private API keys, or service-role keys.
- Keep `ANTHROPIC_API_KEY` in Vercel environment variables only.
- Supabase anon keys are public by design, but every table exposed to browser clients must rely on Row Level Security and narrow RPC permissions.
- Stripe publishable keys can be public; Stripe secret keys and webhook secrets must never be committed.
- Demo credentials must be shared privately and rotated when no longer needed.

## Authentication

### Guests

- Self-service flow in `login.html`: room number + last name + email → 6-digit PIN generated and stored in `users` with `UNIQUE (room_number, stay_start_date)` constraint.
- Returning login: same coordinates + PIN. Rate limiting: 3 failed attempts → 10 minutes lockout.
- Session stored client-side in `localStorage`; natural expiry at `stay_end_date`.

### Admin

- Login via Supabase RPC `admin_login(p_email, p_password)`.
- Passwords hashed in DB with `pgcrypto.crypt()` — never in source.
- 24h admin session timestamp validated on every admin page.

## Row Level Security (Supabase)

Tables exposed to the browser must follow these defaults:

| Table | anon SELECT | anon INSERT | anon UPDATE | Notes |
|---|---|---|---|---|
| `users` | own row only | only via registration flow | own row, narrow fields | last_login update allowed |
| `user_points` | own row | trigger only (no direct INSERT) | own row | INSERT blocked by RLS, auto-created via trigger on signup |
| `restaurant_bookings`, `tour_bookings`, `spa_bookings` | own bookings | yes | service_role only | FK on `users.email` |
| `admin_users`, `payments` | service_role only | service_role only | service_role only | Never reach the browser |
| `rewards` (catalog) | active rows only | service_role only | service_role only | Read-only for guests |
| `user_rewards` | own row | yes (redeem) | admin (mark claimed) | FK on `users.email` |

## Data Protection (GDPR)

- Personal data collected: surname, email, room number, PIN, booking history, gamification points.
- Payments handled via Stripe (tokens only, no card numbers stored).
- Guest rights: access via `account.html`, deletion via admin (`active = false`), rectification via account page or front desk.
- Retention recommendation: schedule automatic deletion of guest rows 12 months after `stay_end_date`.
- A privacy policy must be linked from the registration screen before personal data is collected.

## Application Hardening

Already in place:

- HTTPS enforced by Vercel, HSTS header active.
- Service worker with cache-busting and offline fallback.
- Login rate limiting (3 attempts, 10 minutes lockout).
- Demo credentials hidden behind `?demo=1` query string.

Roadmap:

- [ ] Switch PIN generation from `Math.random` to `crypto.getRandomValues`.
- [ ] Enable RLS on every table listed above and audit policies.
- [ ] CSP header via `vercel.json` to mitigate script injection.
- [ ] HTML-escape all dynamic content rendered via `innerHTML`.
- [ ] CSRF tokens on sensitive admin operations.
- [ ] Wire admin actions to the existing `admin_audit_log` table.
- [ ] Enable Supabase PITR backups.
- [ ] Error tracking (Sentry or Vercel Observability).

## Pre-release Checklist (per hotel)

Before delivering an instance to a customer:

- [ ] Replace logo, palette, hotel name across HTML files.
- [ ] Restrict `OPENWEATHER_API_KEY` to the customer domain.
- [ ] Configure `ANTHROPIC_API_KEY` in the new Vercel project.
- [ ] Swap Stripe `pk_test_*` for `pk_live_*`; configure secret key in Vercel env vars only.
- [ ] Run `db-setup.sql` on the customer's Supabase project.
- [ ] Verify RLS is enabled on every table.
- [ ] Configure custom domain with HTTPS.
- [ ] Generate a random admin PIN and share it via secure channel.
- [ ] Enable automatic Supabase backups (PITR).
- [ ] Link privacy and cookie policies in the footer.
- [ ] Purge demo data (test users and bookings).
- [ ] Full end-to-end smoke test: registration → booking → points → admin.

## Reporting

Report suspected vulnerabilities or leaked credentials privately to the maintainer before opening a public issue.
