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
