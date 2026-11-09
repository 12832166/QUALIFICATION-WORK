import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  supabase,
  getAllWorks,
  getStudentWorks,
  getTeacherCommissionWorks,
  getTeacherWorks,
} from '../lib/supabase';
import { getWorkStatusLabel } from '../lib/workStatus';
import { QualificationWork, Notification } from '../types';
import { 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Bell,
  Loader,
} from 'lucide-react';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [works, setWorks] = useState<QualificationWork[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user]);

  const loadDashboard = async () => {
    if (!user) return;

    try {
      // Load works based on role
      if (user.role === 'student') {
        setWorks(await getStudentWorks(user.id));
      } else if (user.role === 'teacher') {
        const [assignedWorks, commissionWorks] = await Promise.all([
          getTeacherWorks(user.id),
          getTeacherCommissionWorks(user.id),
        ]);

        const uniqueWorks = new Map<string, QualificationWork>();
        [...assignedWorks, ...commissionWorks].forEach((work) => {
          uniqueWorks.set(work.id, work);
        });

        setWorks(Array.from(uniqueWorks.values()).sort((left, right) => {
          return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
        }));
      } else if (user.role === 'dean') {
        setWorks(await getAllWorks());
      }

      // Load notifications
      const { data: notificationsData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(5);

      setNotifications(notificationsData || []);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
      case 'awaiting_advisor':
        return <Clock className="h-5 w-5 text-slate-500" />;
      case 'advisor_assigned':
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'ready_for_review':
      case 'under_review':
        return <Clock className="h-5 w-5 text-yellow-500" />;
      case 'revision_required':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'approved_for_defense':
      case 'defense_scheduled':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'defense_completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      default:
        return <FileText className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      case 'awaiting_advisor':
        return 'bg-slate-100 text-slate-800';
      case 'advisor_assigned':
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'ready_for_review':
      case 'under_review':
        return 'bg-yellow-100 text-yellow-800';
      case 'revision_required':
        return 'bg-orange-100 text-orange-800';
      case 'approved_for_defense':
      case 'defense_scheduled':
        return 'bg-green-100 text-green-800';
      case 'defense_completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    return getWorkStatusLabel(status);
  };

  const getAdvisorName = (work: QualificationWork) => {
    return work.advisor?.full_name || work.teacher?.full_name || 'Не призначено';
  };

  const getReviewerName = (work: QualificationWork) => {
    return work.reviewer?.full_name || 'Не призначено';
  };

  const recentWorks = useMemo(() => {
    const sortedWorks = [...works].sort((left, right) => {
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });

    if (user?.role === 'teacher') {
      return sortedWorks.slice(0, 5);
    }

    return sortedWorks;
  }, [works, user?.role]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Панель керування</h1>
        <p className="text-gray-600 mt-2">Вітаємо, {user?.full_name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Усього заявок</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{works.length}</p>
            </div>
            <FileText className="h-12 w-12 text-indigo-600 opacity-10" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">На рецензії</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {works.filter(w => w.status === 'under_review' || w.status === 'ready_for_review').length}
              </p>
            </div>
            <Clock className="h-12 w-12 text-blue-600 opacity-10" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 text-sm font-medium">Допущено / захищено</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {works.filter(w => w.status === 'approved_for_defense' || w.status === 'defense_completed').length}
              </p>
            </div>
            <CheckCircle className="h-12 w-12 text-green-600 opacity-10" />
          </div>
        </div>
      </div>

      {/* Recent Notifications */}
      {notifications.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center space-x-2">
              <Bell className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-gray-900">Останні сповіщення</h2>
            </div>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div key={notification.id} className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="font-medium text-gray-900">{notification.title}</p>
                  {notification.message && (
                    <p className="text-sm text-gray-700 mt-1">{notification.message}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    {new Date(notification.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent Works */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Останні роботи</h2>
        </div>
        <div className="p-4">
          {recentWorks.length > 0 ? (
            <div className="space-y-3">
              {recentWorks.map((work) => (
                <div key={work.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{work.title}</h3>
                      <p className="text-sm text-gray-600 mt-1">{work.description}</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-sm text-gray-600">
                        <span>Тип: {work.work_type === 'coursework' ? 'курсова' : 'дипломна'}</span>
                        <span>Керівник: {getAdvisorName(work)}</span>
                        <span>Рецензент: {getReviewerName(work)}</span>
                        <span>Створено: {new Date(work.created_at).toLocaleDateString('uk-UA')}</span>
                      </div>
                    </div>
                    <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(work.status)}`}>
                      {getStatusIcon(work.status)}
                      <span>{getStatusLabel(work.status)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Немає робіт</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
