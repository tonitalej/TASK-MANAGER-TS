import { Route, Routes } from 'react-router-dom';
import { GuestRoute, ProtectedRoute } from './components/RouteGuards';
import DashboardPage from './pages/DashboardPage';
import EditTaskPage from './pages/EditTaskPage';
import LoginPage from './pages/LoginPage';
import NewTaskPage from './pages/NewTaskPage';
import NotFoundPage from './pages/NotFoundPage';
import RegisterPage from './pages/RegisterPage';
import TaskDetailsPage from './pages/TaskDetailsPage';

export default function App() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/tasks/new" element={<NewTaskPage />} />
        <Route path="/tasks/:id" element={<TaskDetailsPage />} />
        <Route path="/tasks/:id/edit" element={<EditTaskPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
