import { Navigate, Route, Routes } from "react-router-dom";
import { WorkspaceLayout } from "@/components/workspace-layout.tsx";
import { HomePage } from "@/pages/home.tsx";
import { NewCourseRequestPage } from "@/pages/new-course-request.tsx";
import { TeachingProfilePage } from "@/pages/teaching-profile.tsx";

/**
 * Workspace routes: Home, Teaching Profile placeholder, New Course Request placeholder.
 */
export function App() {
  return (
    <Routes>
      <Route element={<WorkspaceLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/teaching-profile" element={<TeachingProfilePage />} />
        <Route path="/new-course-request" element={<NewCourseRequestPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
