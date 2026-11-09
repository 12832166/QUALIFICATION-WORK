import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { GraduationCap, Mail, Lock, User, UserCheck } from 'lucide-react';

interface AuthProps {
  onGuestAccess: () => void;
}

export const Auth: React.FC<AuthProps> = ({ onGuestAccess }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('student');
  const [academicGroup, setAcademicGroup] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    try {
      if (isSignUp) {
        if (role === 'student' && !academicGroup.trim()) {
          throw new Error('Для студента потрібно вказати академічну групу.');
        }

        const { data, error } = await signUp(email, password, fullName, role, academicGroup.trim());
        if (error) throw error;

        // Registration always ends with one-time email confirmation before first login.
        if (data.user) {
          setInfo('Реєстрацію завершено. Підтвердіть електронну пошту через лист і після цього увійдіть у систему.');
          setIsSignUp(false);
          setPassword('');
          return;
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) throw error;
      }
    } catch (err: any) {
      if (err.message?.includes('rate limit') || err.code === 'over_email_send_rate_limit') {
        setError('Занадто багато спроб реєстрації. Будь ласка, зачекайте кілька хвилин і спробуйте повторно або увійдіть, якщо у вас уже є аккаунт.');
      } else if (err.message?.includes('Signups not allowed for this instance')) {
        setError('Реєстрацію тимчасово вимкнено в налаштуваннях сервера. Увімкніть Email signups у Supabase Authentication, щоб створювати нові акаунти.');
      } else if (err.message?.includes('Email not confirmed')) {
        setError('Підтвердіть електронну пошту через лист, який було надіслано під час реєстрації, і після цього увійдіть.');
      } else if (err.message?.includes('Invalid login credentials')) {
        setError('Невірна адреса електронної пошти або пароль. Будь ласка, перевірте свої облікові дані та спробуйте повторно.');
      } else {
        setError(err.message || 'Сталася помилка. Будь ласка, спробуйте ще раз.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-indigo-100 p-3 rounded-full">
              <GraduationCap className="h-8 w-8 text-indigo-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            {isSignUp ? 'Створити обліковий запис' : 'З поверненням'}
          </h2>
          <p className="text-gray-600 mt-2">
            {isSignUp
              ? 'Приєднайтесь до репозиторію кваліфікаційних робіт'
              : 'Увійдіть, щоб отримати доступ до свого облікового запису'
            }
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {info && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
              {info}
            </div>
          )}

          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Повне ім'я
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Введіть своє повне ім'я"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Адреса електронної пошти
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Введіть свою електронну пошту"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Пароль
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Введіть пароль"
                required
              />
            </div>
          </div>

          {isSignUp && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Роль
              </label>
              <div className="relative">
                <UserCheck className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <select
                  value={role}
                  onChange={(e) => {
                    const nextRole = e.target.value;
                    setRole(nextRole);
                    if (nextRole !== 'student') {
                      setAcademicGroup('');
                    }
                  }}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent appearance-none"
                  required
                >
                  <option value="student">Студент</option>
                  <option value="teacher">Викладач</option>
                  <option value="dean">Адміністрація</option>
                </select>
              </div>
            </div>
          )}

          {isSignUp && role === 'student' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Академічна група
              </label>
              <input
                type="text"
                value={academicGroup}
                onChange={(e) => setAcademicGroup(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Наприклад: КН25М"
                required
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Будь ласка, чекайте...' : (isSignUp ? 'Створити обліковий запис' : 'Увійти')}
          </button>
        </form>

        {/* Toggle */}
        <div className="mt-6 text-center space-y-3">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-indigo-600 hover:text-indigo-700 font-medium block w-full"
          >
            {isSignUp
              ? 'Уже маєте обліковий запис? Увійти'
              : 'Немає облікового запису? Зареєструватися'
            }
          </button>

          <button
            type="button"
            onClick={onGuestAccess}
            className="text-gray-700 hover:text-gray-900 font-medium block w-full"
          >
            Гостьовий доступ
          </button>
        </div>
      </div>
    </div>
  );
};