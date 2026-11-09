import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { Auth } from './components/Auth';
import { Guest } from './components/Guest';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Notifications } from './components/Notifications';
import { StudentWorkManager } from './components/StudentWorkManager.tsx';
import { TeacherWorkManager } from './components/TeacherWorkManager.tsx';
import { DeanWorkManager } from './components/DeanWorkManager.tsx';
import { ProfileSettings } from './components/ProfileSettings';

type TeacherSection = 'assigned' | 'reviews' | 'grading';
type DeanSection = 'works' | 'advisors' | 'workflow' | 'users' | 'theme-approval';

const getTeacherSection = (tab: string): TeacherSection => {
  switch (tab) {
    case 'my-reviews':
      return 'reviews';
    case 'supervised-students':
      return 'grading';
    case 'review-works':
    default:
      return 'assigned';
  }
};

const getTeacherTab = (section: TeacherSection): string => {
  switch (section) {
    case 'reviews':
      return 'my-reviews';
    case 'grading':
      return 'supervised-students';
    case 'assigned':
    default:
      return 'review-works';
  }
};

const getDeanSection = (tab: string): DeanSection => {
  switch (tab) {
    case 'theme-approval':
      return 'theme-approval';
    case 'assign-teachers':
      return 'advisors';
    case 'system-settings':
      return 'workflow';
    case 'manage-users':
      return 'users';
    case 'all-works':
    default:
      return 'works';
  }
};

const getDeanTab = (section: DeanSection): string => {
  switch (section) {
    case 'theme-approval':
      return 'theme-approval';
    case 'advisors':
      return 'assign-teachers';
    case 'workflow':
      return 'system-settings';
    case 'users':
      return 'manage-users';
    case 'works':
    default:
      return 'all-works';
  }
};

function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [authMode, setAuthMode] = useState<'auth' | 'guest'>('auth');

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) {
    return authMode === 'guest'
      ? <Guest onBackToAuth={() => setAuthMode('auth')} />
      : <Auth onGuestAccess={() => setAuthMode('guest')} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'my-work':
        return <StudentWorkManager />;
      case 'notifications':
        return <Notifications />;
      case 'profile':
        return <ProfileSettings />;
      case 'review-works':
      case 'my-reviews':
      case 'supervised-students':
        return (
          <TeacherWorkManager
            initialSection={getTeacherSection(activeTab)}
            onSectionChange={(section) => setActiveTab(getTeacherTab(section))}
          />
        );
      case 'theme-approval':
      case 'all-works':
      case 'manage-users':
      case 'assign-teachers':
      case 'system-settings':
        return (
          <DeanWorkManager
            initialSection={getDeanSection(activeTab)}
            onSectionChange={(section) => setActiveTab(getDeanTab(section))}
          />
        );
      default:
        return <Dashboard />;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Layout>
  );
}

export default App;
