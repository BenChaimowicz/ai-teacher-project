import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, GuestOnly, RequireAuth } from "@/components/auth/auth-provider.tsx";
import { CompanionProvider } from "@/components/companion/companion-provider.tsx";
import { AppShell } from "@/components/shell/app-shell.tsx";
import { TeachingProfileProvider } from "@/components/teaching-profile-provider.tsx";
import { ToastProvider } from "@/components/ui/toast.tsx";
import { CheckEmailPage } from "@/pages/auth/check-email.tsx";
import { ForgotPasswordPage } from "@/pages/auth/forgot-password.tsx";
import { ResetPasswordPage } from "@/pages/auth/reset-password.tsx";
import { SignInPage } from "@/pages/auth/sign-in.tsx";
import { SignUpPage } from "@/pages/auth/sign-up.tsx";
import { ComponentsPage } from "@/pages/dev-components.tsx";
import { CourseCompletePage } from "@/pages/course-complete.tsx";
import { HomePage } from "@/pages/home.tsx";
import { CourseRequestPage } from "@/pages/course-request.tsx";
import { NewCourseRequestPage } from "@/pages/new-course-request.tsx";
import { SettingsPage } from "@/pages/settings.tsx";
import { StudyIndexPage, StudyPage } from "@/pages/study.tsx";
import { TeachingProfilePage } from "@/pages/teaching-profile.tsx";

/**
 * Signed-out screens stand alone. Everything else needs a signed-in Learner and sits in the app shell; Study uses
 * the study variant (outline in the sidebar). /reset-password is open to both: the reset link signs you in.
 */
export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route element={<GuestOnly />}>
            <Route path="/sign-in" element={<SignInPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />
            <Route path="/check-email" element={<CheckEmailPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          </Route>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            element={
              <RequireAuth>
                <TeachingProfileProvider>
                  <CompanionProvider>
                    <Outlet />
                  </CompanionProvider>
                </TeachingProfileProvider>
              </RequireAuth>
            }
          >
            <Route element={<AppShell variant="workspace" />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/teaching-profile" element={<TeachingProfilePage />} />
              <Route path="/new-course-request" element={<NewCourseRequestPage />} />
              <Route path="/course-requests/:requestId" element={<CourseRequestPage />} />
              <Route path="/study/:courseId/complete" element={<CourseCompletePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/dev/components" element={<ComponentsPage />} />
            </Route>
            <Route element={<AppShell variant="study" />}>
              <Route path="/study/:courseId/lessons/:lessonId" element={<StudyPage />} />
              <Route path="/study/:courseId" element={<StudyIndexPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
