# Security Policy

## Secret Handling

- Never commit production credentials, admin passwords, private API keys, or service-role keys.
- Keep `ANTHROPIC_API_KEY` in Vercel environment variables only.
- Supabase anon keys are public by design, but every table exposed to browser clients must rely on Row Level Security and narrow RPC permissions.
- Stripe publishable keys can be public; Stripe secret keys and webhook secrets must never be committed.
- Demo credentials must be shared privately and rotated when no longer needed.

## Reporting

Report suspected vulnerabilities or leaked credentials privately to the maintainer before opening a public issue.
