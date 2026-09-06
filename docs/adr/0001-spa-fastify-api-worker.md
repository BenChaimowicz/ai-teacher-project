# SPA frontend, Fastify API, separate worker

The spec wants two Railway processes (web + worker), not Vercel. The web side is a Vite + React + shadcn SPA plus a Fastify API: in production Fastify serves the built UI, JSON, and `/media/…`; a second Node process is the worker (idle until generation exists). Next.js was rejected so frontend and backend stay separate and we do not follow Vercel’s default path. Hono was rejected so the API can grow with Fastify plugins (Learner, Library, later auth) rather than a minimal router we would have to structure by hand.
