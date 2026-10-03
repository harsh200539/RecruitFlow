# RecruitFlow API

Base: `/api`. Login via cookie jar or send `Authorization: Bearer <JWT>` for CLI/test clients. Send `X-App-Request: 1` on writes except Stripe webhooks. All authorizations are enforced server-side.

| Method | Path |
| --- | --- |
| POST | `/auth/register` |
| POST | `/auth/login` |
| POST | `/auth/logout` |
| GET | `/auth/me` |
| GET | `/health` |
| GET | `/users` |
| POST | `/users` |
| PATCH | `/users/:id` |
| GET | `/candidates` |
| POST | `/candidates` |
| GET | `/candidates/:id` |
| PATCH | `/candidates/:id` |
| DELETE | `/candidates/:id` |
| POST | `/candidates/:id/resume` |
| GET | `/candidates/:id/resume` |
| GET | `/jobs` |
| POST | `/jobs` |
| GET | `/jobs/:id` |
| PATCH | `/jobs/:id` |
| DELETE | `/jobs/:id` |
| GET | `/submissions` |
| POST | `/submissions` |
| PATCH | `/submissions/:id/status` |
| GET | `/interviews` |
| POST | `/interviews` |
| PATCH | `/interviews/:id` |
| GET | `/dashboard/summary` |

## Query parameters

Pagination: `page=1&limit=20`, maximum 100.

Candidates: `search`, `location`, exact `skill`, `experienceMin`, `status`. Jobs: `search`, `status`. Submissions: `jobId`.

See strict Zod schemas in the source and the Postman collection for request bodies. For resume upload, use multipart field `resume` containing a PDF.
