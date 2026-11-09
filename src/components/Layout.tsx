import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { 
  BookOpen, 
  Bell, 
  User, 
  LogOut, 
  FileText, 
  Users, 
  Settings,
  GraduationCap
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Layout: React.FC<LayoutProps> = ({ children, activeTab, onTabChange }) => {
  const { user, signOut } = useAuth();

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'student':
        return 'Студент';
      case 'teacher':
        return 'Викладач';
      case 'dean':
        return 'Адміністрація';
      default:
        return role;
    }
  };

  const getNavigationItems = () => {
    if (!user) return [];

    const baseItems = [
      { id: 'dashboard', label: 'Панель керування', icon: BookOpen },
    ];

    switch (user.role) {
      case 'student':
        return [
          ...baseItems,
          { id: 'my-work', label: 'Моя робота', icon: FileText },
          { id: 'notifications', label: 'Сповіщення', icon: Bell },
          { id: 'profile', label: 'Особистий кабінет', icon: User },
        ];
      case 'teacher':
        return [
          ...baseItems,
          { id: 'notifications', label: 'Сповіщення', icon: Bell },
          { id: 'review-works', label: 'Роботи на перевірку', icon: FileText },
          { id: 'my-reviews', label: 'Мої рецензії', icon: Users },
          { id: 'supervised-students', label: 'Комісія', icon: GraduationCap },
          { id: 'profile', label: 'Особистий кабінет', icon: User },
        ];
      case 'dean':
        return [
          ...baseItems,
          { id: 'assign-teachers', label: 'Керівники', icon: GraduationCap },
          { id: 'theme-approval', label: 'Погодження тем', icon: GraduationCap },
          { id: 'system-settings', label: 'Рецензування і захист', icon: Settings },
          { id: 'all-works', label: 'Усі роботи', icon: FileText },
          { id: 'manage-users', label: 'Користувачі', icon: Users },
        ];
      default:
        return baseItems;
    }
  };

  const navigationItems = getNavigationItems();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <GraduationCap className="h-8 w-8 text-indigo-600" />
              <h1 className="ml-3 text-xl font-semibold text-gray-900">
                Репозиторій кваліфікаційних робіт
              </h1>
            </div>
            
            {user && (
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <User className="h-5 w-5 text-gray-400" />
                  <span className="text-sm text-gray-700">{user.full_name}</span>
                  <span className="text-xs bg-indigo-100 text-indigo-800 px-2 py-1 rounded-full">
                    {getRoleLabel(user.role)}
                  </span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="flex items-center space-x-1 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="text-sm">Вийти</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar Navigation */}
          {user && (
            <nav className="w-64 flex-shrink-0">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <ul className="space-y-2">
                  {navigationItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => onTabChange(item.id)}
                          className={`w-full flex items-start space-x-3 px-3 py-2 rounded-md text-sm font-medium text-left transition-colors ${
                            activeTab === item.id
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                          }`}
                        >
                          <Icon className="h-5 w-5" />
                          <span className="leading-snug">{item.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </nav>
          )}

          {/* Main Content */}
          <main className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};