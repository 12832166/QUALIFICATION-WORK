import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { updateMyPassword, updateMyProfile } from '../lib/supabase';
import { Loader, Save, ShieldCheck, UserCircle } from 'lucide-react';

export const ProfileSettings: React.FC = () => {
  const { user, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
    }
  }, [user]);

  const handleProfileSave = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = fullName.trim();
    if (!trimmed) {
      setProfileMessage('Імʼя не може бути порожнім.');
      return;
    }

    setSavingProfile(true);
    setProfileMessage(null);

    try {
      await updateMyProfile(trimmed);
      await refreshProfile();
      window.dispatchEvent(new Event('profile-updated'));
      setProfileMessage('Особисті дані оновлено.');
    } catch (error) {
      console.error('Error updating profile:', error);
      setProfileMessage('Не вдалося оновити особисті дані. Спробуйте ще раз.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSave = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      setPasswordMessage('Новий пароль має містити щонайменше 6 символів.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordMessage('Паролі не співпадають.');
      return;
    }

    setSavingPassword(true);
    setPasswordMessage(null);

    try {
      await updateMyPassword(newPassword);
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Пароль успішно змінено.');
    } catch (error) {
      console.error('Error updating password:', error);
      setPasswordMessage('Не вдалося змінити пароль. Спробуйте ще раз.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user || (user.role !== 'student' && user.role !== 'teacher')) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <p className="text-gray-700">Редагування профілю доступне для студентів та викладачів.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Особистий кабінет</h1>
        <p className="text-gray-600 mt-2">Оновлюйте персональні дані та пароль облікового запису.</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <UserCircle className="h-5 w-5 text-indigo-600" />
          <h2 className="text-xl font-semibold text-gray-900">Персональна інформація</h2>
        </div>

        <form onSubmit={handleProfileSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Електронна пошта</label>
            <input
              value={user.email}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Повне імʼя</label>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Введіть повне імʼя"
              required
            />
          </div>

          <div className="text-sm text-gray-600">
            <span className="font-medium">Роль:</span>{' '}
            {user.role === 'student' ? 'Студент' : 'Викладач'}
          </div>

          {profileMessage && (
            <div className="text-sm text-gray-700 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
              {profileMessage}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingProfile}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {savingProfile ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Зберегти зміни</span>
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-indigo-600" />
          <h2 className="text-xl font-semibold text-gray-900">Зміна пароля</h2>
        </div>

        <form onSubmit={handlePasswordSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Новий пароль</label>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Мінімум 6 символів"
              minLength={6}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Підтвердження пароля</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Повторіть новий пароль"
              minLength={6}
              required
            />
          </div>

          {passwordMessage && (
            <div className="text-sm text-gray-700 bg-gray-100 border border-gray-200 rounded-lg px-3 py-2">
              {passwordMessage}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingPassword}
              className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {savingPassword ? <Loader className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              <span>Оновити пароль</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
