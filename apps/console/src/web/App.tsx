import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { EmptyState } from "@/components/States";
import { RefreshProvider } from "@/lib/refresh";
import { ApiTraffic } from "@/views/ApiTraffic";
import { Billing } from "@/views/Billing";
import { Calls } from "@/views/Calls";
import { CourseRequestDetail } from "@/views/CourseRequestDetail";
import { CourseRequests } from "@/views/CourseRequests";
import { Failures } from "@/views/Failures";
import { LearnerActivity } from "@/views/LearnerActivity";
import { Overview } from "@/views/Overview";
import { PipelineSteps } from "@/views/PipelineSteps";

/** The Usage Console: routes for every view inside the shared shell. */
export function App() {
  return (
    <BrowserRouter>
      <RefreshProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Overview />} />
            <Route path="calls" element={<Calls />} />
            <Route path="course-requests" element={<CourseRequests />} />
            <Route path="course-requests/:id" element={<CourseRequestDetail />} />
            <Route path="steps" element={<PipelineSteps />} />
            <Route path="billing" element={<Billing />} />
            <Route path="failures" element={<Failures />} />
            <Route path="activity" element={<LearnerActivity />} />
            <Route path="api" element={<ApiTraffic />} />
            <Route path="*" element={<EmptyState title="No such view" hint="Pick one from the left." />} />
          </Route>
        </Routes>
      </RefreshProvider>
    </BrowserRouter>
  );
}
