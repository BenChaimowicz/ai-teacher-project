import { Navigate, Route, Routes } from "react-router-dom";
import { TeachingProfileProvider } from "@/components/teaching-profile-provider.tsx";
import { WorkspaceLayout } from "@/components/workspace-layout.tsx";
import { HomePage } from "@/pages/home.tsx";
import { CourseRequestPage } from "@/pages/course-request.tsx";
import { NewCourseRequestPage } from "@/pages/new-course-request.tsx";
import { StudyIndexPage, StudyPage } from "@/pages/study.tsx";
import { TeachingProfilePage } from "@/pages/teaching-profile.tsx";

/**
 * Workspace routes plus Study (no Workspace sidebar).
 */
export function App() {
  return (
    <TeachingProfileProvider>
      <Routes>
        <Route element={<WorkspaceLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/teaching-profile" element={<TeachingProfilePage />} />
          <Route path="/new-course-request" element={<NewCourseRequestPage />} />
          <Route path="/course-requests/:requestId" element={<CourseRequestPage />} />
        </Route>
        <Route path="/study/:courseId/lessons/:lessonId" element={<StudyPage />} />
        <Route path="/study/:courseId" element={<StudyIndexPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TeachingProfileProvider>
  );
}
