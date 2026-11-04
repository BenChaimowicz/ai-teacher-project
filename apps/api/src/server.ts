import Fastify from "fastify";
import cookie from "@fastify/cookie";
import { createDb, loadRootEnv } from "@senoy/db";
import { createBatchedLogSink, createLogger, drizzleLogWriter } from "@senoy/logging";
import { supabaseAuthService } from "./lib/supabase-auth.ts";
import sameOriginPlugin from "./plugins/same-origin.ts";
import { authRoutes } from "./routes/auth.ts";
import { balanceProbeFromEnv, createResearchMeter } from "./lib/research-measurement.ts";
import { currentLogCorrelation, installUsageTracking } from "./lib/usage-tracking.ts";
import apiRequestsPlugin, { recordedUrl } from "./plugins/api-requests.ts";
import corsPlugin from "./plugins/cors.ts";
import currentLearnerPlugin, { supabaseTokenVerifier } from "./plugins/current-learner.ts";
import dbPlugin from "./plugins/db.ts";
import requestContextPlugin, { REQUEST_ID_OPTIONS } from "./plugins/request-context.ts";
import spaPlugin from "./plugins/spa.ts";
import { healthRoutes } from "./routes/health.ts";
import { clientLogRoutes } from "./routes/client-logs.ts";
import { courseRequestRoutes } from "./routes/course-requests.ts";
import { goalFocusRoutes } from "./routes/goal-focus.ts";
import { startingLevelRoutes } from "./routes/starting-level.ts";
import { createFixtureDiagnosticBuilder } from "./lib/diagnostic-fixture.ts";
import { createFixtureValidityGate } from "./lib/validity-fixture.ts";
import { createFixtureSubjectChecker } from "./lib/subject-check-fixture.ts";
import { createFixtureGoalFocuser } from "./lib/goal-focus-fixture.ts";
import { blueprintRoutes } from "./routes/blueprint.ts";
import { libraryRoutes } from "./routes/library.ts";
import { meRoutes } from "./routes/me.ts";
import { mediaRoutes } from "./routes/media.ts";
import { studyRoutes } from "./routes/study.ts";
import { teachingProfileRoutes } from "./routes/teaching-profile.ts";

/** How long a stop waits for `app.close()` before it exits anyway. */
const STOP_GRACE_MS = 10_000;

/**
 * On SIGINT or SIGTERM (a deploy, or `tsx watch` restarting), closes the server, which runs `logSink.close()` and so
 * writes the last Log Entries (ADR 0029), then exits. A close that has not finished after `STOP_GRACE_MS` exits anyway.
 * @param app - The listening server
 * @param logSink - The process's Log Entry sink, flushed by `app.close()`
 */
function stopOnSignal(app: ReturnType<typeof Fastify>, logSink: { close(): Promise<void> }) {
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    app.log.info("api stopping");
    setTimeout(() => process.exit(1), STOP_GRACE_MS).unref();
    app
      .close()
      .catch(async (error: unknown) => {
        process.stderr.write(`[server.ts: stopOnSignal] Closing the API failed || ${error instanceof Error ? error.message : String(error)}\n`);
        await logSink.close();
      })
      .finally(() => process.exit(0));
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

/**
 * Starts the Fastify API (JSON, `/media/…`, and the built SPA when present).
 */
async function start() {
  const root = loadRootEnv(import.meta.url, 3);
  // The API's one Log Entry sink (ADR 0029): its logger and the client-log route both push to it.
  const logSink = createBatchedLogSink();
  const app = Fastify({
    // Every request gets a fresh uuid, logged as `requestId` and sent back as `x-request-id`.
    ...REQUEST_ID_OPTIONS,
    loggerInstance: createLogger({
      component: "api",
      sink: logSink,
      // The request id, Learner and current Pipeline Event of the code logging, from the tracking context.
      context: currentLogCorrelation,
      // Email-link landings carry a single-use sign-in token in their query; the log never shows it.
      serializers: {
        req: (req) => ({ method: req.method, url: recordedUrl(req.url ?? ""), host: req.host, remoteAddress: req.ip }),
      },
    }),
  });

  try {
    // First, so every later hook and every handler run inside the request's tracking context.
    await app.register(requestContextPlugin);
    await app.register(dbPlugin);
    // Log Entries go out on a connection of their own, so a log write never takes a slot from a request's queries.
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) logSink.start(drizzleLogWriter(createDb(databaseUrl, { max: 1 })));
    app.addHook("onClose", () => logSink.close());
    installUsageTracking({
      db: app.db,
      log: app.log,
      // Research calls are measured against the vendor balance; this process only reads the Parallel token file.
      meter: createResearchMeter({ probe: balanceProbeFromEnv({ env: process.env, repoRoot: root }) }),
    });
    await app.register(apiRequestsPlugin);
    // Fails fast without SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY: the API owns the session (ADR 0027).
    const auth = supabaseAuthService(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY);
    await app.register(cookie);
    // Before the sign-in check, so a cross-site request is refused before it can refresh a session.
    await app.register(sameOriginPlugin, { appUrl: process.env.APP_URL });
    await app.register(currentLearnerPlugin, {
      verifyToken: supabaseTokenVerifier(process.env.SUPABASE_URL),
      refreshSession: (refreshToken) => auth.refresh(refreshToken),
    });
    await app.register(corsPlugin);
    await app.register(healthRoutes);
    await app.register(clientLogRoutes, { sink: logSink });
    await app.register(authRoutes, { auth });
    await app.register(meRoutes);
    await app.register(libraryRoutes);
    // Browser tests run without provider calls; never set DIAGNOSTIC_FIXTURE in a deployed service.
    const fixtures = process.env.DIAGNOSTIC_FIXTURE === "1";
    await app.register(courseRequestRoutes, {
      validityGate: fixtures ? createFixtureValidityGate() : undefined,
      subjectChecker: fixtures ? createFixtureSubjectChecker() : undefined,
    });
    await app.register(goalFocusRoutes, { goalFocuser: fixtures ? createFixtureGoalFocuser() : undefined });
    await app.register(startingLevelRoutes, {
      diagnosticBuilder: fixtures ? createFixtureDiagnosticBuilder() : undefined,
    });
    await app.register(blueprintRoutes);
    await app.register(studyRoutes);
    await app.register(teachingProfileRoutes);
    await app.register(mediaRoutes);
    await app.register(spaPlugin, { root });

    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST ?? "127.0.0.1";
    await app.listen({ port, host });
    stopOnSignal(app, logSink);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    app.log.error(`[server.ts: start] Failed to start API || ${message}`);
    await logSink.close();
    process.exit(1);
  }
}

await start();
