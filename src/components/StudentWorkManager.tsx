import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  createWorkRequest,
  getStudentWorks,
  getWorkMessages,
  getWorkReviews,
  getWorkVersions,
  sendWorkMessage,
  supabase,
  validatePdfFile,
  uploadWorkVersion,
} from '../lib/supabase';
import { getWorkStatusLabel } from '../lib/workStatus';
import { QualificationWork, WorkMessage, WorkReview, WorkVersion } from '../types';
import { FilePreview } from './FilePreview';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader,
  MessageSquare,
  Upload,
} from 'lucide-react';

export const StudentWorkManager: React.FC = () => {
  const { user } = useAuth();
  const [works, setWorks] = useState<QualificationWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWork, setSelectedWork] = useState<QualificationWork | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [requestTitle, setRequestTitle] = useState('');
  const [requestType, setRequestType] = useState<'coursework' | 'diploma'>('coursework');
  const [requestDescription, setRequestDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user?.role === 'student') {
      loadWorks();
    }
  }, [user]);

  const loadWorks = async () => {
    if (!user) return;

    try {
      const data = await getStudentWorks(user.id);
      setWorks(data);
    } catch (error) {
      console.error('Error loading student works:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!requestTitle.trim()) return;

    setCreating(true);
    try {
      await createWorkRequest(requestTitle.trim(), requestType, requestDescription.trim() || undefined);
      setRequestTitle('');
      setRequestDescription('');
      setRequestType('coursework');
      await loadWorks();
    } catch (error) {
      console.error('Error creating work request:', error);
      alert('Не вдалося створити заявку на роботу. Спробуйте ще раз.');
    } finally {
      setCreating(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'awaiting_advisor':
        return <Clock className="h-5 w-5 text-slate-500" />;
      case 'advisor_assigned':
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-500" />;
      case 'ready_for_review':
      case 'under_review':
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case 'revision_required':
        return <AlertCircle className="h-5 w-5 text-orange-500" />;
      case 'approved_for_defense':
      case 'defense_scheduled':
      case 'defense_completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      default:
        return <FileText className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
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
      case 'defense_completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    return getWorkStatusLabel(status);
  };

  const getThemeStatusLabel = (themeStatus?: string) => {
    switch (themeStatus || 'pending') {
      case 'approved':
        return 'Тему погоджено адміністрацією';
      case 'rejected':
        return 'Тему відхилено адміністрацією';
      case 'pending':
      default:
        return 'Тема очікує рішення адміністрації';
    }
  };

  const getThemeStatusColor = (themeStatus?: string) => {
    switch (themeStatus || 'pending') {
      case 'approved':
        return 'bg-emerald-100 text-emerald-800';
      case 'rejected':
        return 'bg-rose-100 text-rose-800';
      case 'pending':
      default:
        return 'bg-amber-100 text-amber-800';
    }
  };

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
        <h1 className="text-3xl font-bold text-gray-900">Моя кваліфікаційна робота</h1>
        <p className="text-gray-600 mt-2">
          Подайте тему роботи, завантажуйте версії, спілкуйтеся з керівником та стежте за етапами захисту.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Нова заявка на роботу</h2>
        <form onSubmit={handleCreateRequest} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Тема роботи</label>
            <input
              value={requestTitle}
              onChange={(e) => setRequestTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Наприклад: Розробка веб-платформи для обліку робіт"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Вид роботи</label>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.target.value as 'coursework' | 'diploma')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="coursework">Курсова</option>
              <option value="diploma">Дипломна</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Опис / коротке обґрунтування</label>
            <input
              value={requestDescription}
              onChange={(e) => setRequestDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="За бажанням"
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {creating && <Loader className="h-4 w-4 animate-spin" />}
              <span>Подати заявку</span>
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        {works.length > 0 ? (
          works.map((work) => (
            <div
              key={work.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{work.title}</h3>
                    <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(work.status)}`}>
                      {getStatusIcon(work.status)}
                      <span>{getStatusLabel(work.status)}</span>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${getThemeStatusColor(work.theme_status)}`}>
                      {getThemeStatusLabel(work.theme_status)}
                    </div>
                  </div>

                  {work.description && <p className="text-gray-600 mb-3 text-sm">{work.description}</p>}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                    <div>
                      <span className="font-medium text-gray-700">Вид роботи:</span>{' '}
                      {work.work_type === 'coursework' ? 'курсова' : 'дипломна'}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Керівник:</span>{' '}
                      {work.advisor?.full_name || 'Ще не призначено'}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Рецензент:</span>{' '}
                      {work.reviewer?.full_name || 'Ще не призначено'}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Створено:</span>{' '}
                      {new Date(work.created_at).toLocaleDateString('uk-UA')}
                    </div>
                    {work.defense_date && (
                      <div>
                        <span className="font-medium text-gray-700">Дата захисту:</span>{' '}
                        {new Date(work.defense_date).toLocaleDateString('uk-UA')}
                      </div>
                    )}
                    {typeof work.final_score === 'number' && (
                      <div>
                        <span className="font-medium text-gray-700">Підсумковий бал:</span>{' '}
                        {work.final_score}
                      </div>
                    )}
                  </div>

                  {work.theme_status === 'rejected' && work.theme_decision_comment && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                      <p className="text-sm font-medium text-rose-800">Причина відхилення теми</p>
                      <p className="text-sm text-rose-700 mt-1">{work.theme_decision_comment}</p>
                    </div>
                  )}
                </div>

                <button
                  onClick={() => {
                    setSelectedWork(work);
                    setShowDetailsModal(true);
                  }}
                  className="px-4 py-2 text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  Переглянути деталі
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Заявок ще немає</h3>
            <p className="text-gray-600">Створіть свою першу тему роботи, і адміністрація зможе призначити керівника.</p>
          </div>
        )}
      </div>

      {showDetailsModal && selectedWork && (
        <WorkDetailsModal
          work={selectedWork}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedWork(null);
          }}
          onRefresh={loadWorks}
        />
      )}
    </div>
  );
};

const WorkDetailsModal: React.FC<{
  work: QualificationWork;
  onClose: () => void;
  onRefresh: () => void;
}> = ({ work, onClose, onRefresh }) => {
  const { user } = useAuth();
  const [versions, setVersions] = useState<WorkVersion[]>([]);
  const [messages, setMessages] = useState<WorkMessage[]>([]);
  const [reviews, setReviews] = useState<WorkReview[]>([]);
  const [messageText, setMessageText] = useState('');
  const [versionNotes, setVersionNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'versions' | 'chat' | 'reviews'>('versions');

  useEffect(() => {
    loadDetails();
  }, [work.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`student-work-messages-${work.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'work_messages',
          filter: `work_id=eq.${work.id}`,
        },
        () => {
          loadDetails();
        },
      )
      .subscribe();

    const pollInterval = window.setInterval(() => {
      loadDetails();
    }, 10000);

    return () => {
      window.clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [work.id]);

  const loadDetails = async () => {
    try {
      const [versionsData, messagesData, reviewsData] = await Promise.all([
        getWorkVersions(work.id),
        getWorkMessages(work.id),
        getWorkReviews(work.id),
      ]);

      setVersions(versionsData);
      setMessages(messagesData);
      setReviews(reviewsData);
    } catch (error) {
      console.error('Error loading work details:', error);
    }
  };

  const handleUploadVersion = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      alert('Оберіть файл для завантаження.');
      return;
    }

    setUploading(true);
    try {
      await validatePdfFile(selectedFile);
      await uploadWorkVersion(work.id, selectedFile, versionNotes.trim() || undefined);
      setSelectedFile(null);
      setVersionNotes('');
      await loadDetails();
      onRefresh();
    } catch (error) {
      console.error('Error uploading version:', error);
      alert(error instanceof Error ? error.message : 'Не вдалося завантажити версію роботи.');
    } finally {
      setUploading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!messageText.trim()) return;

    setSendingMessage(true);
    try {
      await sendWorkMessage(work.id, messageText.trim());
      setMessageText('');
      await loadDetails();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Не вдалося надіслати повідомлення.');
    } finally {
      setSendingMessage(false);
    }
  };

  const canUpload = work.status !== 'defense_completed' && work.status !== 'archived';

  useEffect(() => {
    setDetailsTab('versions');
  }, [work.id]);

  useEffect(() => {
    const handleEscClose = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscClose);
    return () => {
      window.removeEventListener('keydown', handleEscClose);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 !m-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[1000]">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{work.title}</h2>
              <p className="text-gray-600 mt-1">
                {work.work_type === 'coursework' ? 'Курсова робота' : 'Дипломна робота'}
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4 border border-gray-200">
            <div>
              <p className="text-sm text-gray-600">Статус</p>
              <p className="font-medium text-gray-900">{getWorkStatusLabel(work.status)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Керівник</p>
              <p className="font-medium text-gray-900">{work.advisor?.full_name || 'Ще не призначено'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Рецензент</p>
              <p className="font-medium text-gray-900">{work.reviewer?.full_name || 'Ще не призначено'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Підсумковий бал</p>
              <p className="font-medium text-gray-900">{typeof work.final_score === 'number' ? work.final_score : 'Ще не визначено'}</p>
            </div>
          </div>

          {work.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Опис</h3>
              <p className="text-gray-900">{work.description}</p>
            </div>
          )}

          {work.defense_date && (
            <div className="bg-green-50 rounded-lg p-4 border border-green-200">
              <p className="text-sm text-green-700 font-medium">Дата захисту</p>
              <p className="text-green-900 mt-1">
                {new Date(work.defense_date).toLocaleDateString('uk-UA')}
                {work.defense_time ? ` · ${work.defense_time.slice(0, 5)}` : ''}
                {work.defense_location ? ` · ${work.defense_location}` : ''}
              </p>
            </div>
          )}

          <div className="border-b border-gray-200">
            <nav className="-mb-px flex flex-wrap gap-6">
              <button
                onClick={() => setDetailsTab('versions')}
                className={`py-2 border-b-2 text-sm font-medium ${detailsTab === 'versions' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Версії
              </button>
              <button
                onClick={() => setDetailsTab('chat')}
                className={`py-2 border-b-2 text-sm font-medium ${detailsTab === 'chat' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Чат
              </button>
              <button
                onClick={() => setDetailsTab('reviews')}
                className={`py-2 border-b-2 text-sm font-medium ${detailsTab === 'reviews' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Рецензії
              </button>
            </nav>
          </div>

          {detailsTab === 'versions' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Upload className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Версії роботи</h3>
              </div>

              {canUpload && (
                <form onSubmit={handleUploadVersion} className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Файл</label>
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
                      className="w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Коментар до версії</label>
                    <textarea
                      value={versionNotes}
                      onChange={(event) => setVersionNotes(event.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      placeholder="Що змінилося в цій версії"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                  >
                    {uploading && <Loader className="h-4 w-4 animate-spin" />}
                    <span>Завантажити версію</span>
                  </button>
                </form>
              )}

              <div className="space-y-3">
                {versions.length > 0 ? (
                  versions.map((version) => (
                    <div key={version.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div>
                        <p className="font-medium text-gray-900">Версія {version.version_number}</p>
                        <a
                          href={version.file_url}
                          target="_blank"
                          rel="noreferrer"
                          download={version.file_name}
                          className="mt-1 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          {version.file_name}
                        </a>
                        {version.notes && <p className="text-sm text-gray-700 mt-2">{version.notes}</p>}
                        <p className="text-xs text-gray-500 mt-2">
                          Завантажив(ла): {version.uploader?.full_name || 'Невідомо'} · {new Date(version.created_at).toLocaleString('uk-UA')}
                        </p>
                        <details className="group mt-3">
                          <summary className="w-full cursor-pointer list-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                            <span className="group-open:hidden">Показати перегляд</span>
                            <span className="hidden group-open:inline">Сховати перегляд</span>
                          </summary>
                          <div className="mt-3">
                            <FilePreview fileUrl={version.file_url} fileName={version.file_name} maxPdfPages={20} />
                          </div>
                        </details>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg text-gray-600">
                    Ще немає завантажених версій
                  </div>
                )}
              </div>
            </div>
          )}

          {detailsTab === 'chat' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Чат із керівником</h3>
              </div>

              <form onSubmit={handleSendMessage} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  placeholder="Напишіть повідомлення керівнику..."
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={sendingMessage || !messageText.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                  >
                    {sendingMessage && <Loader className="h-4 w-4 animate-spin" />}
                    <span>Надіслати</span>
                  </button>
                </div>
              </form>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {messages.filter((message) => !message.content.startsWith('[SYSTEM] Член комісії виставив бал:')).length > 0 ? (
                  messages
                    .filter((message) => !message.content.startsWith('[SYSTEM] Член комісії виставив бал:'))
                    .map((message) => {
                    const isCurrentUser = message.sender_id === user?.id;
                    const isSystemMessage = message.content.startsWith('[SYSTEM] ');
                    const content = isSystemMessage ? message.content.replace('[SYSTEM] ', '') : message.content;
                    return (
                      <div
                        key={message.id}
                        className={`rounded-lg p-3 border ${
                          isSystemMessage
                            ? 'bg-amber-50 border-amber-200'
                            : isCurrentUser
                              ? 'bg-indigo-50 border-indigo-200 ml-8'
                              : 'bg-gray-50 border-gray-200 mr-8'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-medium text-gray-900">{isSystemMessage ? 'Система' : (message.sender?.full_name || 'Учасник')}</p>
                          <span className="text-xs text-gray-500">{new Date(message.created_at).toLocaleString('uk-UA')}</span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{content}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg text-gray-600">
                    Повідомлень ще немає
                  </div>
                )}
              </div>

            </div>
          )}

          {detailsTab === 'reviews' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2 pt-2">
                <CheckCircle className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Відгуки та рецензії</h3>
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Відгук керівника</h4>
                {reviews.filter((review) => review.review_type === 'advisor_feedback').length > 0 ? (
                  reviews
                    .filter((review) => review.review_type === 'advisor_feedback')
                    .map((review) => (
                    <div key={review.id} className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <p className="font-medium text-gray-900">{review.decision === 'approved' ? 'Передано на рецензування' : 'Потрібне доопрацювання'}</p>
                        <span className="text-xs text-gray-500">{new Date(review.created_at).toLocaleString('uk-UA')}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{review.feedback}</p>
                      {typeof review.score === 'number' && (
                        <p className="text-sm text-gray-700 mt-2">
                          <span className="font-medium">Оцінка:</span> {review.score}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">Автор: {review.reviewer?.full_name || 'Невідомо'}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg text-gray-600">
                    Відгуку керівника ще немає
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Рецензія рецензента</h4>
                {reviews.filter((review) => review.review_type !== 'advisor_feedback').length > 0 ? (
                  reviews
                    .filter((review) => review.review_type !== 'advisor_feedback')
                    .map((review) => (
                    <div key={review.id} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <p className="font-medium text-gray-900">{review.decision === 'approved' ? 'Рекомендовано до захисту' : 'Потрібне доопрацювання'}</p>
                        <span className="text-xs text-gray-500">{new Date(review.created_at).toLocaleString('uk-UA')}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{review.feedback}</p>
                      {typeof review.score === 'number' && (
                        <p className="text-sm text-gray-700 mt-2">
                          <span className="font-medium">Оцінка:</span> {review.score}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">Автор: {review.reviewer?.full_name || 'Невідомо'}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg text-gray-600">
                    Рецензії рецензента ще немає
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};