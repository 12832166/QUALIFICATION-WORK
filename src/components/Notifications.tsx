import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  deleteNotification,
  getNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../lib/supabase';
import { Bell, Loader, CheckCheck, Trash2 } from 'lucide-react';
import { Notification } from '../types';

export const Notifications: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    if (user) {
      loadNotifications();
    }
  }, [user]);

  const loadNotifications = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const data = await getNotifications(user.id);
      setNotifications(data);
    } catch (error) {
      console.error('Error loading notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    if (!user) return;

    setActionLoadingId(id);
    try {
      await markNotificationAsRead(id, user.id);
      setNotifications((current) => current.map((item) => (item.id === id ? { ...item, is_read: true } : item)));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    } finally {
      setActionLoadingId(null);
    }
  };

  const markAllAsRead = async () => {
    if (!user) return;

    setBulkLoading(true);
    try {
      await markAllNotificationsAsRead(user.id);
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    } finally {
      setBulkLoading(false);
    }
  };

  const removeNotification = async (id: string) => {
    if (!user) return;

    setActionLoadingId(id);
    try {
      await deleteNotification(id, user.id);
      setNotifications((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Error deleting notification:', error);
    } finally {
      setActionLoadingId(null);
    }
  };

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="h-8 w-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Сповіщення</h1>
        <p className="text-gray-600 mt-2">Усі системні повідомлення щодо вашої роботи.</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Bell className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Історія сповіщень</h2>
            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
              Непрочитаних: {unreadCount}
            </span>
          </div>

          <button
            onClick={markAllAsRead}
            disabled={bulkLoading || unreadCount === 0}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bulkLoading ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
            <span>Позначити всі як прочитані</span>
          </button>
        </div>

        <div className="p-4">
          {notifications.length > 0 ? (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-lg border p-4 ${
                    notification.is_read
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{notification.title}</p>
                      {notification.message && (
                        <p className="text-sm text-gray-700 mt-1">{notification.message}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(notification.created_at).toLocaleString('uk-UA')}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {!notification.is_read && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          disabled={actionLoadingId === notification.id}
                          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap disabled:opacity-50"
                        >
                          {actionLoadingId === notification.id ? 'Збереження...' : 'Позначити як прочитане'}
                        </button>
                      )}
                      <button
                        onClick={() => removeNotification(notification.id)}
                        disabled={actionLoadingId === notification.id}
                        className="inline-flex items-center gap-1 text-sm text-rose-600 hover:text-rose-700 font-medium whitespace-nowrap disabled:opacity-50"
                      >
                        {actionLoadingId === notification.id ? (
                          <Loader className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span>Видалити</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-gray-600">
              Наразі сповіщень немає.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
