# Authentication

The MVP accepts the fixed credentials `user` and `password` only.

Successful login creates a signed, HTTP-only `pm_session` cookie. It uses the
`SameSite=Lax` policy, applies to the entire local application, and expires
after eight hours. `SESSION_SECRET` may be set in the project-root `.env` to
sign cookies; the development fallback is suitable only for this local MVP.

The frontend restores the session through `GET /api/auth/session` before
rendering the board. `POST /api/auth/logout` removes the cookie. API routes are
protected by default, with the health and authentication endpoints left public.
