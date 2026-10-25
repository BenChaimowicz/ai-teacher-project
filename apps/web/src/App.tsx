import { Navigate, Route, Routes } from "react-router-dom";
import { CompanionProvider } from "@/components/companion/companion-provider.tsx";
import { AppShell } from "@/components/shell/app-shell.tsx";
import { TeachingProfileProvider } from "@/components/teaching-profile-provider.tsx";
import { ToastProvider } from "@/components/ui/toast.tsx";
import { ComponentsPage } from "@/pages/dev-components.tsx";
import { CourseCompletePage } from "@/pages/course-complete.tsx";
import { HomePage } from "@/pages/home.tsx";
import { CourseRequestPage } from "@/pages/course-request.tsx";
import { NewCourseRequestPage } from "@/pages/new-course-request.tsx";
import { StudyIndexPage, StudyPage } from "@/pages/study.tsx";
import { TeachingProfilePage } from "@/pages/teaching-profile.tsx";

/**
 * Every screen sits in the app shell. Study uses the study variant (outline in the sidebar).
 */
export function App() {
  return (
    <TeachingProfileProvider>
      <CompanionProvider>
        <ToastProvider>
          <Routes>
            <Route element={<AppShell variant="workspace" />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/teaching-profile" element={<TeachingProfilePage />} />
              <Route path="/new-course-request" element={<NewCourseRequestPage />} />
              <Route path="/course-requests/:requestId" element={<CourseRequestPage />} />
              <Route path="/study/:courseId/complete" element={<CourseCompletePage />} />
              <Route path="/dev/components" element={<ComponentsPage />} />
            </Route>
            <Route element={<AppShell variant="study" />}>
              <Route path="/study/:courseId/lessons/:lessonId" element={<StudyPage />} />
              <Route path="/study/:courseId" element={<StudyIndexPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </CompanionProvider>
    </TeachingProfileProvider>
  );
}
