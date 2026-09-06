import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** One person taking Courses. The prototype seeds a single row. */
export const learners = pgTable("learners", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Unpublished Course Request owned by a Learner. Home lists these in the Library. */
export const courseRequests = pgTable("course_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  subject: text("subject").notNull(),
  learningGoal: text("learning_goal").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Published Course snapshot owned by a Learner. */
export const publishedCourses = pgTable("published_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  courseRequestId: uuid("course_request_id").references(() => courseRequests.id),
  title: text("title").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});
