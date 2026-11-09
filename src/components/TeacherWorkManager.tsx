import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  getTeacherCommissionWorks,
  getTeacherWorks,
  getWorkMessages,
  getWorkReviews,
  getWorkVersions,
  getCommissionMembers,
  sendWorkMessage,
  submitAdvisorFeedback,
  submitDefenseScore,
  supabase,
  submitWorkReview,
} from '../lib/supabase';
import { getWorkStatusLabel } from '../lib/workStatus';
import { QualificationWork, WorkMessage, WorkReview, WorkVersion, CommissionMember } from '../types';
import { FilePreview } from './FilePreview';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  FileText,
  Loader,
  MessageSquare,
  Medal,
  PenTool,
} from 'lucide-react';

type TeacherSection = 'assigned' | 'reviews' | 'grading';

interface TeacherWorkManagerProps {
  initialSection?: TeacherSection;
  onSectionChange?: (section: TeacherSection) => void;
}

export const TeacherWorkManager: React.FC<TeacherWorkManagerProps> = ({
  initialSection = 'assigned',
  onSectionChange,
}) => {
  const { user } = useAuth();
  const [works, setWorks] = useState<QualificationWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWork, setSelectedWork] = useState<QualificationWork | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [activeTab, setActiveTab] = useState<TeacherSection>(initialSection);
  const [commissionWorkIds, setCommissionWorkIds] = useState<string[]>([]);
  const [initialDetailsTab, setInitialDetailsTab] = useState<'versions' | 'chat' | 'advisor_feedback' | 'reviews' | 'grading'>('versions');

  useEffect(() => {
    setActiveTab(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (user?.role === 'teacher') {
      loadWorks();
    }
  }, [user]);

  const loadWorks = async () => {
    if (!user) return;

    try {
      const [assignedWorks, commissionWorks] = await Promise.all([
        getTeacherWorks(user.id),
        getTeacherCommissionWorks(user.id),
      ]);

      const uniqueWorks = new Map<string, QualificationWork>();
      assignedWorks.forEach((work) => uniqueWorks.set(work.id, work));
      commissionWorks.forEach((work) => uniqueWorks.set(work.id, work));

      setWorks(Array.from(uniqueWorks.values()).sort((left, right) => {
        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      }));
      setCommissionWorkIds(commissionWorks.map((work) => work.id));
    } catch (error) {
      console.error('Error loading works:', error);
    } finally {
      setLoading(false);
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

  const handleTabChange = (section: TeacherSection) => {
    setActiveTab(section);
    onSectionChange?.(section);
  };

  const assignedWorks = useMemo(
    () => works.filter((work) => work.advisor_id === user?.id && !commissionWorkIds.includes(work.id)),
    [works, commissionWorkIds, user?.id],
  );
  const reviewWorks = useMemo(
    () => works.filter((work) => work.reviewer_id === user?.id),
    [works, user?.id],
  );
  const gradingWorks = useMemo(
    () => works.filter((work) => commissionWorkIds.includes(work.id)),
    [works, commissionWorkIds],
  );

  const visibleWorks = useMemo(() => {
    switch (activeTab) {
      case 'reviews':
        return reviewWorks;
      case 'grading':
        return gradingWorks;
      case 'assigned':
      default:
        return assignedWorks;
    }
  }, [activeTab, assignedWorks, reviewWorks, gradingWorks]);

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
        <h1 className="text-3xl font-bold text-gray-900">Роботи під вашим керівництвом</h1>
        <p className="text-gray-600 mt-2">
          Перевіряйте версії, обговорюйте роботу зі студентом, залишайте рецензії та виставляйте бали комісії після захисту.
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => handleTabChange('assigned')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'assigned'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <PenTool className="h-4 w-4" />
              <span>Керівництво роботами ({assignedWorks.length})</span>
            </div>
          </button>
          <button
            onClick={() => handleTabChange('reviews')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'reviews'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4" />
              <span>Рецензування ({reviewWorks.length})</span>
            </div>
          </button>
          <button
            onClick={() => handleTabChange('grading')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'grading'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Medal className="h-4 w-4" />
              <span>Оцінювання комісії ({gradingWorks.length})</span>
            </div>
          </button>
        </nav>
      </div>

      {visibleWorks.length > 0 ? (
        <div className="space-y-4">
          {visibleWorks.map((work) => (
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
                  </div>

                  {work.description && <p className="text-gray-600 mb-3 text-sm">{work.description}</p>}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                    <div>
                      <span className="font-medium text-gray-700">Студент:</span> {work.student?.full_name || 'Невідомо'}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Керівник:</span> {work.advisor?.full_name || 'Не призначено'}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Рецензент:</span> {work.reviewer?.full_name || 'Не призначено'}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Створено:</span> {new Date(work.created_at).toLocaleDateString('uk-UA')}
                    </div>
                    {work.defense_date && (
                      <div>
                        <span className="font-medium text-gray-700">Захист:</span> {new Date(work.defense_date).toLocaleDateString('uk-UA')}
                      </div>
                    )}
                    {typeof work.final_score === 'number' && (
                      <div>
                        <span className="font-medium text-gray-700">Підсумковий бал:</span> {work.final_score}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedWork(work);
                    // Открыть модал на вкладке, соответствующей текущему табу
                    if (activeTab === 'reviews') {
                      setInitialDetailsTab('reviews');
                    } else if (activeTab === 'grading') {
                      setInitialDetailsTab('grading');
                    } else {
                      setInitialDetailsTab('versions');
                    }
                    setShowDetailsModal(true);
                  }}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium whitespace-nowrap"
                >
                  Відкрити
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Робіт ще немає</h3>
          <p className="text-gray-600">Коли адміністрація призначить вам студентів або роботи для комісії, вони з'являться тут.</p>
        </div>
      )}

      {showDetailsModal && selectedWork && (
        <WorkDetailsModal
          work={selectedWork}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedWork(null);
          }}
          onRefresh={loadWorks}
          initialDetailsTab={initialDetailsTab}
        />
      )}
    </div>
  );
};

const WorkDetailsModal: React.FC<{
  work: QualificationWork;
  onClose: () => void;
  onRefresh: () => void;
  initialDetailsTab?: 'versions' | 'chat' | 'advisor_feedback' | 'reviews' | 'grading';
}> = ({ work, onClose, onRefresh, initialDetailsTab = 'versions' }) => {
  const { user } = useAuth();
  const [versions, setVersions] = useState<WorkVersion[]>([]);
  const [messages, setMessages] = useState<WorkMessage[]>([]);
  const [reviews, setReviews] = useState<WorkReview[]>([]);
  const [commissionMembers, setCommissionMembers] = useState<CommissionMember[]>([]);
  const [messageText, setMessageText] = useState('');
  const [reviewDecision, setReviewDecision] = useState<'revision_required' | 'approved'>('approved');
  const [reviewFeedback, setReviewFeedback] = useState('');
  const [reviewScore, setReviewScore] = useState('');
  const [defenseScore, setDefenseScore] = useState('');
  const [defenseComment, setDefenseComment] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [submittingAdvisorFeedback, setSubmittingAdvisorFeedback] = useState(false);
  const [submittingScore, setSubmittingScore] = useState(false);
  const [advisorDecision, setAdvisorDecision] = useState<'revision_required' | 'approved'>('approved');
  const [advisorFeedback, setAdvisorFeedback] = useState('');
  const [advisorScore, setAdvisorScore] = useState('');
  const [detailsTab, setDetailsTab] = useState<'versions' | 'chat' | 'advisor_feedback' | 'reviews' | 'grading'>('versions');

  useEffect(() => {
    loadDetails();
  }, [work.id]);

  useEffect(() => {
    const channel = supabase
      .channel(`teacher-work-messages-${work.id}`)
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
      const [versionsData, messagesData, reviewsData, commissionData] = await Promise.all([
        getWorkVersions(work.id),
        getWorkMessages(work.id),
        getWorkReviews(work.id),
        getCommissionMembers(work.id),
      ]);

      setVersions(versionsData);
      setMessages(messagesData);
      setReviews(reviewsData);
      setCommissionMembers(commissionData);
    } catch (error) {
      console.error('Error loading work details:', error);
    }
  };

  const isAdvisor = work.advisor_id === user?.id;
  const isReviewer = work.reviewer_id === user?.id;
  const isCommissionMember = commissionMembers.some((member) => member.teacher_id === user?.id);
  const canLeaveReview = isReviewer;
  const canLeaveAdvisorFeedback = isAdvisor;
  const canScoreDefense = isCommissionMember && (
    work.status === 'approved_for_defense' ||
    work.status === 'defense_scheduled' ||
    work.status === 'defense_completed'
  );
  const advisorFeedbacks = reviews.filter((review) => review.review_type === 'advisor_feedback');
  const reviewerReviews = reviews.filter((review) => review.review_type !== 'advisor_feedback');

  useEffect(() => {
    setDetailsTab(initialDetailsTab);
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

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reviewFeedback.trim()) {
      alert('Додайте текст рецензії.');
      return;
    }

    setSubmittingReview(true);
    try {
      await submitWorkReview(
        work.id,
        reviewDecision,
        reviewFeedback.trim(),
        reviewScore.trim() ? Number(reviewScore) : undefined,
      );
      setReviewFeedback('');
      setReviewScore('');
      await loadDetails();
      onRefresh();
    } catch (error) {
      console.error('Error submitting review:', error);
      alert('Не вдалося зберегти рецензію.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleSubmitAdvisorFeedback = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!advisorFeedback.trim()) {
      alert('Додайте текст відгуку керівника.');
      return;
    }

    setSubmittingAdvisorFeedback(true);
    try {
      await submitAdvisorFeedback(
        work.id,
        advisorDecision,
        advisorFeedback.trim(),
        advisorScore.trim() ? Number(advisorScore) : undefined,
      );
      setAdvisorFeedback('');
      setAdvisorScore('');
      await loadDetails();
      onRefresh();
    } catch (error) {
      console.error('Error submitting advisor feedback:', error);
      alert('Не вдалося зберегти відгук керівника.');
    } finally {
      setSubmittingAdvisorFeedback(false);
    }
  };

  const handleSubmitDefenseScore = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!defenseScore.trim()) {
      alert('Вкажіть бал.');
      return;
    }

    setSubmittingScore(true);
    try {
      await submitDefenseScore(work.id, Number(defenseScore), defenseComment.trim() || undefined);
      setDefenseScore('');
      setDefenseComment('');
      await loadDetails();
      onRefresh();
    } catch (error) {
      console.error('Error submitting defense score:', error);
      alert('Не вдалося зберегти бал.');
    } finally {
      setSubmittingScore(false);
    }
  };

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
              <p className="text-sm text-gray-600">Студент</p>
              <p className="font-medium text-gray-900">{work.student?.full_name || 'Невідомо'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Керівник</p>
              <p className="font-medium text-gray-900">{work.advisor?.full_name || 'Не призначено'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Рецензент</p>
              <p className="font-medium text-gray-900">{work.reviewer?.full_name || 'Не призначено'}</p>
            </div>
          </div>

          {work.description && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Опис</h3>
              <p className="text-gray-900">{work.description}</p>
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
              {isAdvisor && (
                <button
                  onClick={() => setDetailsTab('chat')}
                  className={`py-2 border-b-2 text-sm font-medium ${detailsTab === 'chat' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  Чат
                </button>
              )}
              <button
                onClick={() => setDetailsTab('advisor_feedback')}
                className={`py-2 border-b-2 text-sm font-medium ${detailsTab === 'advisor_feedback' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Відгук керівника
              </button>
              <button
                onClick={() => setDetailsTab('reviews')}
                className={`py-2 border-b-2 text-sm font-medium ${detailsTab === 'reviews' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Рецензія рецензента
              </button>
              {canScoreDefense && (
                <button
                  onClick={() => setDetailsTab('grading')}
                  className={`py-2 border-b-2 text-sm font-medium ${detailsTab === 'grading' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                  Оцінювання
                </button>
              )}
            </nav>
          </div>

          {detailsTab === 'versions' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <FileText className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Версії роботи</h3>
              </div>

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

          {detailsTab === 'chat' && isAdvisor && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <MessageSquare className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Чат обговорення</h3>
              </div>

              <form onSubmit={handleSendMessage} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
                <textarea
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                  placeholder="Напишіть повідомлення студенту або керівнику..."
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

          {detailsTab === 'advisor_feedback' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <PenTool className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Відгук наукового керівника</h3>
              </div>

              <div className="space-y-3">
                {advisorFeedbacks.length > 0 ? (
                  advisorFeedbacks.map((review) => (
                    <div key={review.id} className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <p className="font-medium text-gray-900">
                          {review.decision === 'approved' ? 'Готово до рецензування' : 'Потрібне доопрацювання'}
                        </p>
                        <span className="text-xs text-gray-500">{new Date(review.created_at).toLocaleString('uk-UA')}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{review.feedback}</p>
                      {typeof review.score === 'number' && (
                        <p className="text-sm text-gray-700 mt-2"><span className="font-medium">Оцінка керівника:</span> {review.score}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">Автор: {review.reviewer?.full_name || 'Невідомо'}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg text-gray-600">
                    Відгуків керівника ще немає
                  </div>
                )}
              </div>

              {canLeaveAdvisorFeedback && (
                <form onSubmit={handleSubmitAdvisorFeedback} className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Рішення керівника</label>
                    <select
                      value={advisorDecision}
                      onChange={(event) => setAdvisorDecision(event.target.value as 'revision_required' | 'approved')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="approved">Передати на рецензування</option>
                      <option value="revision_required">Повернути на доопрацювання</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Текст відгуку</label>
                    <textarea
                      value={advisorFeedback}
                      onChange={(event) => setAdvisorFeedback(event.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      placeholder="Що потрібно виправити або чому роботу можна передати рецензенту"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Попередня оцінка (за бажанням)</label>
                    <input
                      type="number"
                      value={advisorScore}
                      onChange={(event) => setAdvisorScore(event.target.value)}
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      placeholder="Наприклад, 90"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submittingAdvisorFeedback}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center space-x-2"
                    >
                      {submittingAdvisorFeedback && <Loader className="h-4 w-4 animate-spin" />}
                      <span>Зберегти відгук керівника</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {detailsTab === 'reviews' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <CheckCircle className="h-5 w-5 text-indigo-600" />
                <h3 className="text-lg font-semibold text-gray-900">Рецензії рецензента</h3>
              </div>

              <div className="space-y-3">
                {reviewerReviews.length > 0 ? (
                  reviewerReviews.map((review) => (
                    <div key={review.id} className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                      <div className="flex justify-between items-start gap-4 mb-2">
                        <p className="font-medium text-gray-900">
                          {review.decision === 'approved' ? 'Рекомендовано до наступного етапу' : 'Потрібне доопрацювання'}
                        </p>
                        <span className="text-xs text-gray-500">{new Date(review.created_at).toLocaleString('uk-UA')}</span>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{review.feedback}</p>
                      {typeof review.score === 'number' && (
                        <p className="text-sm text-gray-700 mt-2"><span className="font-medium">Оцінка:</span> {review.score}</p>
                      )}
                      <p className="text-xs text-gray-500 mt-2">Автор: {review.reviewer?.full_name || 'Невідомо'}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 border border-dashed border-gray-300 rounded-lg text-gray-600">
                    Рецензій ще немає
                  </div>
                )}
              </div>

              {canLeaveReview && (
                <form onSubmit={handleSubmitReview} className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Рішення</label>
                    <select
                      value={reviewDecision}
                      onChange={(event) => setReviewDecision(event.target.value as 'revision_required' | 'approved')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      <option value="approved">Допустити далі</option>
                      <option value="revision_required">Повернути на доопрацювання</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Текст рецензії</label>
                    <textarea
                      value={reviewFeedback}
                      onChange={(event) => setReviewFeedback(event.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      placeholder="Ваші зауваження, рекомендації та висновок"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Балл (за бажанням)</label>
                    <input
                      type="number"
                      value={reviewScore}
                      onChange={(event) => setReviewScore(event.target.value)}
                      min="0"
                      max="100"
                      step="0.1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                      placeholder="Наприклад, 92"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submittingReview}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center space-x-2"
                    >
                      {submittingReview && <Loader className="h-4 w-4 animate-spin" />}
                      <span>Зберегти рецензію</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {detailsTab === 'grading' && canScoreDefense && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Medal className="h-5 w-5 text-emerald-600" />
                <h3 className="text-lg font-semibold text-gray-900">Виставлення балів комісії</h3>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Члени комісії</h4>
                {commissionMembers.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {commissionMembers.map((member) => (
                      <span key={member.id} className="px-3 py-1 rounded-full bg-white border border-gray-300 text-sm text-gray-700">
                        {member.teacher?.full_name || 'Невідомо'}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Склад комісії ще не визначено.</p>
                )}
              </div>

              <form onSubmit={handleSubmitDefenseScore} className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Бал за захист</label>
                  <input
                    type="number"
                    value={defenseScore}
                    onChange={(event) => setDefenseScore(event.target.value)}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    placeholder="Наприклад, 88"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Коментар</label>
                  <textarea
                    value={defenseComment}
                    onChange={(event) => setDefenseComment(event.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
                    placeholder="Короткий коментар до виставленого балу"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={submittingScore}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center space-x-2"
                  >
                    {submittingScore && <Loader className="h-4 w-4 animate-spin" />}
                    <span>Зберегти бал</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
