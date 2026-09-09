import { Navigate, Route, Routes } from "react-router-dom";
import { TeachingProfileProvider } from "@/components/teaching-profile-provider.tsx";
import { WorkspaceLayout } from "@/components/workspace-layout.tsx";
import { HomePage } from "@/pages/home.tsx";
import { NewCourseRequestPage } from "@/pages/new-course-request.tsx";
import { TeachingProfilePage } from "@/pages/teaching-profile.tsx";

/**
 * Workspace routes: Home, Teaching Profile, New Course Request.
 */
export function App() {
  return (
    <TeachingProfileProvider>
      <Routes>
        <Route element={<WorkspaceLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/teaching-profile" element={<TeachingProfilePage />} />
          <Route path="/new-course-request" element={<NewCourseRequestPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TeachingProfileProvider>
  );
}
