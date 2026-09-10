import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ForumPage } from './pages/ForumPage';
import { TopicDetailPage } from './pages/TopicDetailPage';
import { NewTopicPage } from './pages/NewTopicPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AdminEventsPage } from './pages/AdminEventsPage';
import { OraclePage } from './pages/OraclePage';
import { HowToUsePage } from './pages/HowToUsePage';
import { BasicsPage } from './pages/BasicsPage';
import { NetworkChecklistPage } from './pages/NetworkChecklistPage';
import { CoreControlPlanePage } from './pages/CoreControlPlanePage';
import { CloudStorePage } from './pages/CloudStorePage';
import { VcfPage } from './pages/VcfPage';
import { NetworkFluxPage } from './pages/NetworkFluxPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { SecurityPage } from './pages/SecurityPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/*"
          element={
            <Layout>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route
                  path="/forum"
                  element={
                    <ProtectedRoute>
                      <ForumPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/forum/new"
                  element={
                    <ProtectedRoute>
                      <NewTopicPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/forum/topics/:topicId"
                  element={
                    <ProtectedRoute>
                      <TopicDetailPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/users"
                  element={
                    <ProtectedRoute>
                      <AdminUsersPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin/events"
                  element={
                    <ProtectedRoute>
                      <AdminEventsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/oracle"
                  element={
                    <ProtectedRoute>
                      <OraclePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/prerequisites/how-to-use"
                  element={
                    <ProtectedRoute>
                      <HowToUsePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/prerequisites/basics"
                  element={
                    <ProtectedRoute>
                      <BasicsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/prerequisites/network-checklist"
                  element={
                    <ProtectedRoute>
                      <NetworkChecklistPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/prerequisites/core-control-plane"
                  element={
                    <ProtectedRoute>
                      <CoreControlPlanePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/prerequisites/cloudstore"
                  element={
                    <ProtectedRoute>
                      <CloudStorePage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/prerequisites/vcf"
                  element={
                    <ProtectedRoute>
                      <VcfPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/prerequisites/network-flux"
                  element={
                    <ProtectedRoute>
                      <NetworkFluxPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/documents"
                  element={
                    <ProtectedRoute>
                      <DocumentsPage />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/account/security"
                  element={
                    <ProtectedRoute>
                      <SecurityPage />
                    </ProtectedRoute>
                  }
                />
                {/* Additional routes will be added in future tasks */}
              </Routes>
            </Layout>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
