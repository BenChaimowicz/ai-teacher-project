import { courseRequests } from "@senoy/db";

/** Learner-facing Course Request fields every route sends; ownership is never accepted from or exposed to the browser. */
export const requestFields = {
  id: courseRequests.id,
  subject: courseRequests.subject,
  learningGoal: courseRequests.learningGoal,
  status: courseRequests.status,
  createdAt: courseRequests.createdAt,
  validity: courseRequests.validity,
  clarification: courseRequests.clarification,
  subjectCheck: courseRequests.subjectCheck,
  focus: courseRequests.focus,
  revisedFromId: courseRequests.revisedFromId,
  failureReason: courseRequests.failureReason,
};
