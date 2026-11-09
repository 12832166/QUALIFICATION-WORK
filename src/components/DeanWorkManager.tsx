import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { FilePreview } from './FilePreview';
import { getWorkStatusLabel } from '../lib/workStatus';
import {
  assignAdvisorToWork,
  assignCommissionMember,
  assignCommissionToGroup,
  removeCommissionMember,
  decideWorkTheme,
  assignReviewerToWork,
  deleteWorkAsDean,
  getAllWorks,
  getCommissionMembers,
  getWorkVersions,
  getStudents,
  getTeachers,
  scheduleDefense,
  scheduleDefenseForGroup,
} from '../lib/supabase';
import { QualificationWork, User, CommissionMember, WorkVersion } from '../types';
import {
  CheckCircle,
  FileText,
  GraduationCap,
  Loader,
  Search,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';

type DeanSection = 'advisors' | 'theme-approval' | 'workflow' | 'works' | 'users';
type WorkTypeFilter = 'all' | 'coursework' | 'diploma';

interface DeanWorkManagerProps {
  initialSection?: DeanSection;
  onSectionChange?: (section: DeanSection) => void;
}

export const DeanWorkManager: React.FC<DeanWorkManagerProps> = ({
  initialSection = 'advisors',
  onSectionChange,
}) => {
  const { user } = useAuth();
  const [works, setWorks] = useState<QualificationWork[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [teachers, setTeachers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DeanSection>(initialSection);
  const [showWorkModal, setShowWorkModal] = useState(false);
  const [selectedWork, setSelectedWork] = useState<QualificationWork | null>(null);
  const [decidingThemeWorkId, setDecidingThemeWorkId] = useState<string | null>(null);
  const [deletingWorkId, setDeletingWorkId] = useState<string | null>(null);
  const [workSearch, setWorkSearch] = useState('');
  const [workStatusFilter, setWorkStatusFilter] = useState<string[]>([]);
  const [allWorksSearchText, setAllWorksSearchText] = useState('');
  const [allWorksTypeFilter, setAllWorksTypeFilter] = useState<WorkTypeFilter>('all');
  const [assigningWorkId, setAssigningWorkId] = useState<string | null>(null);
  const [advisorSelectionByWork, setAdvisorSelectionByWork] = useState<Record<string, string>>({});
  const [rejectionReasonByWork, setRejectionReasonByWork] = useState<Record<string, string>>({});
  const [themeRejectModeByWork, setThemeRejectModeByWork] = useState<Record<string, boolean>>({});
  const [themeDecisionErrorByWork, setThemeDecisionErrorByWork] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user?.role === 'dean') {
      loadData();
    }
  }, [user]);

  useEffect(() => {
    setActiveTab(initialSection);
  }, [initialSection]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [worksData, studentsData, teachersData] = await Promise.all([
        getAllWorks(),
        getStudents(),
        getTeachers(),
      ]);

      setWorks(worksData);
      setStudents(studentsData);
      setTeachers(teachersData);
    } catch (error) {
      console.error('Error loading dean data:', error);
    } finally {
      setLoading(false);
    }
  };

  const studentById = useMemo(() => {
    const result: Record<string, User> = {};
    for (const student of students) {
      result[student.id] = student;
    }
    return result;
  }, [students]);

  const worksWithAdvisor = useMemo(() => works.filter((work) => !!work.advisor_id), [works]);
  const approvedWorksWithoutAdvisor = useMemo(
    () => works.filter((work) => (work.theme_status || 'pending') === 'approved' && !work.advisor_id),
    [works],
  );

  const filteredApprovedWorksWithoutAdvisor = useMemo(() => {
    const term = workSearch.trim().toLowerCase();
    if (!term) return approvedWorksWithoutAdvisor;

    return approvedWorksWithoutAdvisor.filter((work) => {
      const student = studentById[work.student_id];
      return [
        work.title,
        work.description || '',
        student?.full_name || '',
        student?.email || '',
        student?.academic_group || '',
      ].join(' ').toLowerCase().includes(term);
    });
  }, [approvedWorksWithoutAdvisor, studentById, workSearch]);

  const advisorLoadByTeacherId = useMemo(() => {
    const loadMap: Record<string, { active: number; total: number }> = {};
    for (const teacher of teachers) {
      loadMap[teacher.id] = { active: 0, total: 0 };
    }

    for (const work of worksWithAdvisor) {
      if (!work.advisor_id || !loadMap[work.advisor_id]) continue;
      loadMap[work.advisor_id].total += 1;
      if (!['defense_completed', 'archived'].includes(work.status)) {
        loadMap[work.advisor_id].active += 1;
      }
    }

    return loadMap;
  }, [teachers, worksWithAdvisor]);
  const worksNeedingReviewer = useMemo(
    () => works.filter((work) => work.advisor_id && !work.reviewer_id),
    [works],
  );
  const worksReadyForDefense = useMemo(
    () => works.filter((work) => work.status === 'approved_for_defense' || work.status === 'defense_scheduled'),
    [works],
  );
  const pendingThemeWorks = useMemo(
    () => works.filter((work) => (work.theme_status || 'pending') === 'pending'),
    [works],
  );

  const filteredWorksByStatus = useMemo(() => {
    if (workStatusFilter.length === 0) return works;
    return works.filter((work) => workStatusFilter.includes(work.status));
  }, [works, workStatusFilter]);

  const filteredWorksForDisplay = useMemo(() => {
    const term = allWorksSearchText.trim().toLowerCase();

    return filteredWorksByStatus.filter((work) => {
      const studentName = students.find((student) => student.id === work.student_id)?.full_name || '';
      const advisorName = teachers.find((teacher) => teacher.id === work.advisor_id)?.full_name || '';
      const reviewerName = teachers.find((teacher) => teacher.id === work.reviewer_id)?.full_name || '';
      const matchesType = allWorksTypeFilter === 'all' || work.work_type === allWorksTypeFilter;
      const matchesSearch = !term || [
        work.title,
        work.description || '',
        studentName,
        advisorName,
        reviewerName,
        work.student?.academic_group || '',
      ].join(' ').toLowerCase().includes(term);

      return matchesType && matchesSearch;
    });
  }, [allWorksSearchText, allWorksTypeFilter, filteredWorksByStatus, students, teachers]);

  const getThemeStatusLabel = (themeStatus?: string) => {
    switch (themeStatus || 'pending') {
      case 'approved':
        return 'Тема погоджена';
      case 'rejected':
        return 'Тема відхилена';
      case 'pending':
      default:
        return 'Очікує рішення адміністрації';
    }
  };

  const getThemeStatusStyle = (themeStatus?: string) => {
    switch (themeStatus || 'pending') {
      case 'approved':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'rejected':
        return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'pending':
      default:
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
  };

  const handleThemeDecision = async (work: QualificationWork, decision: 'approved' | 'rejected') => {
    let comment: string | undefined;
    if (decision === 'rejected') {
      const isRejectMode = !!themeRejectModeByWork[work.id];
      if (!isRejectMode) {
        setThemeRejectModeByWork((current) => ({ ...current, [work.id]: true }));
        setThemeDecisionErrorByWork((current) => ({ ...current, [work.id]: '' }));
        return;
      }

      const reason = (rejectionReasonByWork[work.id] || '').trim();
      if (!reason) {
        setThemeDecisionErrorByWork((current) => ({
          ...current,
          [work.id]: 'Вкажіть причину відхилення теми.',
        }));
        return;
      }

      setThemeDecisionErrorByWork((current) => ({ ...current, [work.id]: '' }));
      comment = reason;
    }

    setDecidingThemeWorkId(work.id);
    try {
      await decideWorkTheme(work.id, decision, comment);
      await loadData();
      setThemeRejectModeByWork((current) => ({ ...current, [work.id]: false }));
      setThemeDecisionErrorByWork((current) => ({ ...current, [work.id]: '' }));
      if (decision === 'rejected') {
        setRejectionReasonByWork((current) => ({ ...current, [work.id]: '' }));
      }
    } catch (decisionError) {
      const supabaseError = decisionError as { message?: string; details?: string; hint?: string; code?: string };
      const parts = [supabaseError.message, supabaseError.details, supabaseError.hint].filter(Boolean);
      const message = parts.length > 0
        ? `Не вдалося зберегти рішення щодо теми: ${parts.join(' | ')}`
        : 'Не вдалося зберегти рішення щодо теми. Перевірте, чи застосована остання міграція для погодження тем.';
      setThemeDecisionErrorByWork((current) => ({ ...current, [work.id]: message }));
    } finally {
      setDecidingThemeWorkId(null);
    }
  };

  const getTeacherName = (teacherId?: string) => teachers.find((teacher) => teacher.id === teacherId)?.full_name || 'Не призначено';
  const getStudentName = (studentId: string) => students.find((student) => student.id === studentId)?.full_name || 'Невідомо';

  const getStatusLabel = (status: string) => {
    return getWorkStatusLabel(status);
  };

  const handleTabChange = (section: DeanSection) => {
    setActiveTab(section);
    onSectionChange?.(section);
  };

  const openWorkModal = (work: QualificationWork) => {
    setSelectedWork(work);
    setShowWorkModal(true);
  };

  const handleDeleteWork = async (workId: string) => {
    setDeletingWorkId(workId);
    try {
      await deleteWorkAsDean(workId);
      if (selectedWork?.id === workId) {
        setShowWorkModal(false);
        setSelectedWork(null);
      }
      await loadData();
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : 'Не вдалося видалити роботу';
      alert(message);
    } finally {
      setDeletingWorkId(null);
    }
  };

  const handleAssignAdvisorForWork = async (workId: string) => {
    const advisorId = advisorSelectionByWork[workId];
    if (!advisorId) {
      alert('Оберіть керівника для цієї роботи');
      return;
    }

    setAssigningWorkId(workId);
    try {
      await assignAdvisorToWork(workId, advisorId);
      await loadData();
      setAdvisorSelectionByWork((current) => ({ ...current, [workId]: '' }));
    } catch (assignmentError) {
      const message = assignmentError instanceof Error ? assignmentError.message : 'Не вдалося призначити керівника';
      alert(message);
    } finally {
      setAssigningWorkId(null);
    }
  };

  const getTeachersSortedByLoad = () => {
    return [...teachers].sort((left, right) => {
      const leftLoad = advisorLoadByTeacherId[left.id]?.active || 0;
      const rightLoad = advisorLoadByTeacherId[right.id]?.active || 0;
      if (leftLoad !== rightLoad) return leftLoad - rightLoad;
      return left.full_name.localeCompare(right.full_name, 'uk');
    });
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
        <h1 className="text-3xl font-bold text-gray-900">Адміністрація</h1>
        <p className="text-gray-600 mt-2">
          Тут відбувається весь ланцюжок: студентська заявка, науковий керівник, рецензент, дата захисту та комісія.
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => handleTabChange('advisors')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'advisors'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <UserPlus className="h-4 w-4" />
              <span>Керівники</span>
            </div>
          </button>
          <button
            onClick={() => handleTabChange('theme-approval')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'theme-approval'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <GraduationCap className="h-4 w-4" />
              <span>Погодження тем ({pendingThemeWorks.length})</span>
            </div>
          </button>
          <button
            onClick={() => handleTabChange('workflow')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'workflow'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <ShieldCheck className="h-4 w-4" />
              <span>Рецензування і захист</span>
            </div>
          </button>
          <button
            onClick={() => handleTabChange('works')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'works'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Усі роботи ({works.length})</span>
            </div>
          </button>
          <button
            onClick={() => handleTabChange('users')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'users'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <UserPlus className="h-4 w-4" />
              <span>Користувачі</span>
            </div>
          </button>
        </nav>
      </div>

      {activeTab === 'advisors' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
              <p className="text-sm text-indigo-700 font-medium">Теми на погодженні</p>
              <p className="text-3xl font-bold text-indigo-900 mt-1">{pendingThemeWorks.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
              <p className="text-sm text-emerald-700 font-medium">Роботи з керівниками</p>
              <p className="text-3xl font-bold text-emerald-900 mt-1">{worksWithAdvisor.length}</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-4">
              <p className="text-sm text-amber-700 font-medium">Погоджені без керівника</p>
              <p className="text-3xl font-bold text-amber-900 mt-1">{approvedWorksWithoutAdvisor.length}</p>
            </div>
          </div>

          <div className="flex justify-between items-center gap-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Призначення наукових керівників</h2>
              <p className="text-sm text-gray-600 mt-1">Призначення виконується для конкретної роботи, а не глобально для студента.</p>
            </div>
            <input
              value={workSearch}
              onChange={(event) => setWorkSearch(event.target.value)}
              placeholder="Пошук за студентом, темою або групою"
              className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900">Роботи без керівника (погоджені теми)</h3>
                <p className="text-sm text-gray-600 mt-1">{filteredApprovedWorksWithoutAdvisor.length} робіт</p>
              </div>
              <div className="p-4 space-y-3">
                {filteredApprovedWorksWithoutAdvisor.length > 0 ? (
                  filteredApprovedWorksWithoutAdvisor.map((work) => (
                    <div key={work.id} className="p-4 rounded-lg border border-amber-200 bg-amber-50/50 space-y-3">
                      <div>
                        <p className="font-semibold text-gray-900">{work.title}</p>
                        <p className="text-sm text-gray-700 mt-1">Студент: <span className="font-medium">{getStudentName(work.student_id)}</span></p>
                        {studentById[work.student_id]?.academic_group && (
                          <p className="text-sm text-gray-700">Група: <span className="font-medium">{studentById[work.student_id]?.academic_group}</span></p>
                        )}
                        <p className="text-xs text-gray-600 mt-1">
                          Тип: {work.work_type === 'coursework' ? 'курсова' : 'дипломна'} | Подано: {new Date(work.created_at).toLocaleDateString('uk-UA')}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2 items-center">
                        <select
                          value={advisorSelectionByWork[work.id] || ''}
                          onChange={(event) => setAdvisorSelectionByWork((current) => ({ ...current, [work.id]: event.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        >
                          <option value="">-- Оберіть керівника --</option>
                          {getTeachersSortedByLoad().map((teacher) => {
                            const load = advisorLoadByTeacherId[teacher.id]?.active || 0;
                            return (
                              <option key={teacher.id} value={teacher.id}>
                                {teacher.full_name} ({load} активн.)
                              </option>
                            );
                          })}
                        </select>

                        <button
                          onClick={() => handleAssignAdvisorForWork(work.id)}
                          disabled={assigningWorkId === work.id || !advisorSelectionByWork[work.id]}
                          className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {assigningWorkId === work.id ? 'Призначення...' : 'Призначити'}
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-8">Немає погоджених робіт без керівника.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-semibold text-gray-900">Навантаження керівників</h3>
                <p className="text-sm text-gray-600 mt-1">Поточний розподіл активних робіт</p>
              </div>
              <div className="p-4 space-y-3">
                {teachers.length > 0 ? (
                  getTeachersSortedByLoad().map((teacher) => {
                    const active = advisorLoadByTeacherId[teacher.id]?.active || 0;
                    const total = advisorLoadByTeacherId[teacher.id]?.total || 0;
                    return (
                      <div key={teacher.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-gray-900">{teacher.full_name}</p>
                            <p className="text-sm text-gray-600">{teacher.email}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">Активних: {active}</p>
                            <p className="text-xs text-gray-600">Усього: {total}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-gray-500 text-center py-8">Викладачів поки немає</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'theme-approval' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
              <p className="text-sm text-indigo-700 font-medium">Теми на погодженні</p>
              <p className="text-3xl font-bold text-indigo-900 mt-1">{pendingThemeWorks.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
              <p className="text-sm text-emerald-700 font-medium">Погоджені теми</p>
              <p className="text-3xl font-bold text-emerald-900 mt-1">{works.filter((work) => work.theme_status === 'approved').length}</p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-white p-4">
              <p className="text-sm text-rose-700 font-medium">Відхилені теми</p>
              <p className="text-3xl font-bold text-rose-900 mt-1">{works.filter((work) => work.theme_status === 'rejected').length}</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Погодження тем адміністрацією</h3>
              <p className="text-sm text-gray-600 mt-1">Після погодження теми студента можна призначати керівника.</p>
            </div>
            <div className="p-4 space-y-3">
              {pendingThemeWorks.length > 0 ? (
                pendingThemeWorks.map((work) => (
                  <div key={work.id} className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <GraduationCap className="h-4 w-4 text-amber-700" />
                          <h4 className="font-semibold text-gray-900">{work.title}</h4>
                        </div>
                        <p className="text-sm text-gray-700">
                          Студент: <span className="font-medium">{getStudentName(work.student_id)}</span>
                        </p>
                        <p className="text-xs text-gray-600 mt-1">
                          Тип: {work.work_type === 'coursework' ? 'курсова' : 'дипломна'} | Подано: {new Date(work.created_at).toLocaleDateString('uk-UA')}
                        </p>
                        {work.description && (
                          <p className="text-sm text-gray-600 mt-2">{work.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleThemeDecision(work, 'approved')}
                          disabled={decidingThemeWorkId === work.id}
                          className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {decidingThemeWorkId === work.id ? 'Збереження...' : 'Погодити'}
                        </button>
                        <button
                          onClick={() => handleThemeDecision(work, 'rejected')}
                          disabled={decidingThemeWorkId === work.id}
                          className="px-3 py-2 rounded-lg bg-rose-600 text-white text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
                        >
                          {decidingThemeWorkId === work.id ? 'Збереження...' : 'Відхилити'}
                        </button>
                      </div>
                    </div>
                    {themeRejectModeByWork[work.id] && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Причина відхилення</label>
                        <textarea
                          value={rejectionReasonByWork[work.id] ?? ''}
                          onChange={(event) =>
                            setRejectionReasonByWork((current) => ({
                              ...current,
                              [work.id]: event.target.value,
                            }))
                          }
                          rows={2}
                          placeholder="Наприклад: тема занадто широка, потрібна конкретизація предмета та методу"
                          className="w-full px-3 py-2 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                        />
                        {themeDecisionErrorByWork[work.id] && (
                          <p className="text-xs text-rose-700 mt-2">{themeDecisionErrorByWork[work.id]}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">Немає тем, які очікують погодження.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'workflow' && (
        <div className="space-y-4">
          {worksNeedingReviewer.length > 0 || worksReadyForDefense.length > 0 ? (
            [...worksNeedingReviewer, ...worksReadyForDefense]
              .filter((work, index, array) => array.findIndex((item) => item.id === work.id) === index)
              .map((work) => (
                <div key={work.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{work.title}</h3>
                        <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                          {getStatusLabel(work.status)}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getThemeStatusStyle(work.theme_status)}`}>
                          {getThemeStatusLabel(work.theme_status)}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                        <div>
                          <span className="font-medium text-gray-700">Студент:</span> {getStudentName(work.student_id)}
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Керівник:</span> {getTeacherName(work.advisor_id)}
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Рецензент:</span> {getTeacherName(work.reviewer_id)}
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">Створено:</span> {new Date(work.created_at).toLocaleDateString('uk-UA')}
                        </div>
                        {work.defense_date && (
                          <div>
                            <span className="font-medium text-gray-700">Захист:</span> {new Date(work.defense_date).toLocaleDateString('uk-UA')}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => openWorkModal(work)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium whitespace-nowrap"
                    >
                      Керувати
                    </button>
                  </div>
                </div>
              ))
          ) : (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Поки що немає робіт для рецензування</h3>
              <p className="text-gray-600">Коли з'являться роботи, які готові до рецензії або захисту, вони будуть тут.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'works' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Пошук за текстом</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={allWorksSearchText}
                    onChange={(event) => setAllWorksSearchText(event.target.value)}
                    placeholder="Тема, опис, студент, керівник, рецензент або група"
                    className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">Категорія</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'all', label: 'Всі' },
                    { value: 'coursework', label: 'Курсова' },
                    { value: 'diploma', label: 'Дипломна' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAllWorksTypeFilter(option.value as WorkTypeFilter)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                        allWorksTypeFilter === option.value
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Фільтр за етапом</h3>
              <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setWorkStatusFilter([])}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  workStatusFilter.length === 0
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                Всі роботи
              </button>
              {[
                'awaiting_advisor',
                'advisor_assigned',
                'in_progress',
                'ready_for_review',
                'under_review',
                'revision_required',
                'approved_for_defense',
                'defense_scheduled',
                'defense_completed',
              ].map((status) => (
                <button
                  key={status}
                  onClick={() => {
                    if (workStatusFilter.includes(status)) {
                      setWorkStatusFilter(workStatusFilter.filter((s) => s !== status));
                    } else {
                      setWorkStatusFilter([...workStatusFilter, status]);
                    }
                  }}
                  className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                    workStatusFilter.includes(status)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  {getStatusLabel(status)}
                </button>
              ))}
              </div>
            </div>
          </div>

          {works.length > 0 ? (
            <>
              <div className="text-sm text-gray-600">
                Показано: <span className="font-medium">{filteredWorksForDisplay.length}</span> з{' '}
                <span className="font-medium">{works.length}</span> робіт
              </div>
              {filteredWorksForDisplay.length > 0 ? (
                <div className="space-y-4">
                  {filteredWorksForDisplay.map((work) => (
                    <div key={work.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">{work.title}</h3>
                            <span className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                              {getStatusLabel(work.status)}
                            </span>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getThemeStatusStyle(work.theme_status)}`}>
                              {getThemeStatusLabel(work.theme_status)}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-600">
                            <div><span className="font-medium text-gray-700">Студент:</span> {getStudentName(work.student_id)}</div>
                            <div><span className="font-medium text-gray-700">Керівник:</span> {getTeacherName(work.advisor_id)}</div>
                            <div><span className="font-medium text-gray-700">Рецензент:</span> {getTeacherName(work.reviewer_id)}</div>
                            <div><span className="font-medium text-gray-700">Тип:</span> {work.work_type === 'coursework' ? 'курсова' : 'дипломна'}</div>
                            <div><span className="font-medium text-gray-700">Група:</span> {work.student?.academic_group || 'Не вказана'}</div>
                            <div><span className="font-medium text-gray-700">Створено:</span> {new Date(work.created_at).toLocaleDateString('uk-UA')}</div>
                            {typeof work.final_score === 'number' && (
                              <div><span className="font-medium text-gray-700">Підсумковий бал:</span> {work.final_score}</div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => openWorkModal(work)}
                          className="px-4 py-2 text-indigo-600 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors text-sm font-medium whitespace-nowrap"
                        >
                          Відкрити
                        </button>
                        <button
                          onClick={() => handleDeleteWork(work.id)}
                          disabled={deletingWorkId === work.id}
                          className="px-4 py-2 text-rose-700 border border-rose-300 rounded-lg hover:bg-rose-50 transition-colors text-sm font-medium whitespace-nowrap disabled:opacity-50"
                        >
                          {deletingWorkId === work.id ? 'Видалення...' : 'Видалити'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Роботи не знайдені</h3>
                  <p className="text-gray-600">За вибраними фільтрами робіт не знайдено.</p>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Роботи ще не подано</h3>
              <p className="text-gray-600">Система покаже тут усі роботи після подання студентами.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Студенти</h3>
              <p className="text-sm text-gray-600 mt-1">{students.length} користувачів</p>
            </div>
            <div className="p-4 space-y-2 max-h-[24rem] overflow-y-auto">
              {students.length > 0 ? (
                students.map((student) => (
                  <div key={student.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <p className="font-medium text-gray-900">
                      {student.full_name}
                      <span className="ml-2 text-sm font-normal text-gray-600">
                        ({student.academic_group || 'Групу не вказано'})
                      </span>
                    </p>
                    <p className="text-sm text-gray-600">{student.email}</p>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">Студентів поки немає</p>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Викладачі</h3>
              <p className="text-sm text-gray-600 mt-1">{teachers.length} користувачів</p>
            </div>
            <div className="p-4 space-y-2 max-h-[24rem] overflow-y-auto">
              {teachers.length > 0 ? (
                teachers.map((teacher) => (
                  <div key={teacher.id} className="p-3 rounded-lg border border-gray-200 bg-gray-50">
                    <p className="font-medium text-gray-900">{teacher.full_name}</p>
                    <p className="text-sm text-gray-600">{teacher.email}</p>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 text-center py-8">Викладачів поки немає</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showWorkModal && selectedWork && (
        <WorkManagementModal
          work={selectedWork}
          teachers={teachers}
          onClose={() => {
            setShowWorkModal(false);
            setSelectedWork(null);
          }}
          onSuccess={loadData}
        />
      )}
    </div>
  );
};

const WorkManagementModal: React.FC<{
  work: QualificationWork;
  teachers: User[];
  onClose: () => void;
  onSuccess: () => void;
}> = ({ work, teachers, onClose, onSuccess }) => {
  const APPLY_TO_GROUP_PREFERENCE_KEY = 'dean-apply-defense-to-group';
  const [reviewerId, setReviewerId] = useState(work.reviewer_id || '');
  const [defenseDate, setDefenseDate] = useState(work.defense_date || '');
  const [defenseTime, setDefenseTime] = useState(work.defense_time || '');
  const [defenseLocation, setDefenseLocation] = useState(work.defense_location || '');
  const [selectedCommission, setSelectedCommission] = useState<string[]>([]);
  const [commissionMembers, setCommissionMembers] = useState<CommissionMember[]>([]);
  const [versions, setVersions] = useState<WorkVersion[]>([]);
  const [assigningReviewer, setAssigningReviewer] = useState(false);
  const [schedulingDefense, setSchedulingDefense] = useState(false);
  const [savingCommission, setSavingCommission] = useState(false);
  const [applyDefenseToGroup, setApplyDefenseToGroup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const studentAcademicGroup = work.student?.academic_group?.trim() || '';

  useEffect(() => {
    loadCommissionMembers();
    loadVersions();
  }, [work.id]);

  useEffect(() => {
    try {
      const savedPreference = window.localStorage.getItem(APPLY_TO_GROUP_PREFERENCE_KEY);
      if (savedPreference !== null) {
        setApplyDefenseToGroup(savedPreference === 'true');
      }
    } catch (storageError) {
      console.error('Error loading apply-to-group preference:', storageError);
    }
  }, []);

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

  const handleApplyDefenseToGroupChange = (checked: boolean) => {
    setApplyDefenseToGroup(checked);
    try {
      window.localStorage.setItem(APPLY_TO_GROUP_PREFERENCE_KEY, String(checked));
    } catch (storageError) {
      console.error('Error saving apply-to-group preference:', storageError);
    }
  };

  const loadCommissionMembers = async () => {
    try {
      const data = await getCommissionMembers(work.id);
      setCommissionMembers(data);
      setSelectedCommission(data.map((member) => member.teacher_id));
    } catch (loadError) {
      console.error('Error loading commission members:', loadError);
    }
  };

  const loadVersions = async () => {
    try {
      const data = await getWorkVersions(work.id);
      setVersions(data);
    } catch (loadError) {
      console.error('Error loading work versions:', loadError);
    }
  };

  const finalVersion =
    versions.find((version) => version.uploaded_by === work.student_id) ||
    (versions.length > 0 ? versions[0] : null);

  const handleAssignReviewer = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reviewerId) {
      setError('Виберіть рецензента.');
      return;
    }

    setAssigningReviewer(true);
    setError(null);

    try {
      await assignReviewerToWork(work.id, reviewerId);
      onSuccess();
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : 'Не вдалося призначити рецензента';
      setError(message);
    } finally {
      setAssigningReviewer(false);
    }
  };

  const handleScheduleDefense = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!defenseDate || !defenseLocation.trim()) {
      setError('Вкажіть дату та місце захисту.');
      return;
    }

    setSchedulingDefense(true);
    setSavingCommission(true);
    setError(null);

    try {
      if (applyDefenseToGroup && studentAcademicGroup) {
        // Apply defense to group
        await scheduleDefenseForGroup(studentAcademicGroup, defenseDate, defenseTime, defenseLocation);
        // Apply commission to group
        for (const teacherId of selectedCommission) {
          await assignCommissionToGroup(studentAcademicGroup, teacherId);
          await assignCommissionMember(work.id, teacherId);
        }
        // Remove members that were unselected
        const membersToRemove = commissionMembers.filter((member) => !selectedCommission.includes(member.teacher_id));
        for (const member of membersToRemove) {
          await removeCommissionMember(work.id, member.teacher_id);
        }
      } else {
        // Apply defense only to current work
        await scheduleDefense(work.id, defenseDate, defenseTime, defenseLocation);
        // Apply commission only to current work
        const membersToAdd = selectedCommission.filter((teacherId) => !commissionMembers.some((member) => member.teacher_id === teacherId));
        const membersToRemove = commissionMembers.filter((member) => !selectedCommission.includes(member.teacher_id));

        for (const teacherId of membersToAdd) {
          await assignCommissionMember(work.id, teacherId);
        }

        for (const member of membersToRemove) {
          await removeCommissionMember(work.id, member.teacher_id);
        }
      }
      onSuccess();
    } catch (submissionError) {
      const message = submissionError instanceof Error ? submissionError.message : 'Не вдалося зберегти дані';
      setError(message);
    } finally {
      setSchedulingDefense(false);
      setSavingCommission(false);
    }
  };

  return (
    <div className="fixed inset-0 !m-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[1000]">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-start gap-4 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Керування роботою</h2>
              <p className="text-gray-600 mt-1">{work.title}</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium">Помилка</p>
              <p className="text-sm text-red-600 mt-1">{error}</p>
            </div>
          )}

          <div className="space-y-6">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="text-sm font-semibold text-emerald-900 mb-2">Фінальна версія роботи для адміністрації</h3>
              {finalVersion ? (
                <div className="space-y-1 text-sm text-emerald-900">
                  <p>
                    <span className="font-medium">Файл:</span> {finalVersion.file_name}
                  </p>
                  <p>
                    <span className="font-medium">Версія:</span> v{finalVersion.version_number}
                  </p>
                  <p>
                    <span className="font-medium">Завантажено:</span> {new Date(finalVersion.created_at).toLocaleString('uk-UA')}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <a
                      href={finalVersion.file_url}
                      target="_blank"
                      rel="noreferrer"
                      download={finalVersion.file_name}
                      className="text-indigo-700 font-medium hover:text-indigo-800"
                    >
                      {finalVersion.file_name}
                    </a>
                    <details className="group w-full">
                      <summary className="w-full cursor-pointer list-none rounded-lg border border-emerald-300 bg-emerald-100 px-3 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-200">
                        <span className="group-open:hidden">Показати перегляд</span>
                        <span className="hidden group-open:inline">Сховати перегляд</span>
                      </summary>
                      <div className="mt-3">
                        <FilePreview fileUrl={finalVersion.file_url} fileName={finalVersion.file_name} maxPdfPages={20} />
                      </div>
                    </details>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-emerald-800">Студент ще не завантажив жодної версії.</p>
              )}
            </div>

            <form onSubmit={handleAssignReviewer} className="space-y-3 rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-900">1. Призначення рецензента (окремий етап)</h3>
              <p className="text-xs text-gray-600">Ця дія не призначає захист. Вона лише запускає етап рецензування.</p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Рецензент</label>
              <select
                value={reviewerId}
                onChange={(event) => setReviewerId(event.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="">-- Не призначено --</option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.full_name} ({teacher.email})
                  </option>
                ))}
              </select>
            </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={assigningReviewer || !reviewerId}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                >
                  {assigningReviewer && <Loader className="h-4 w-4 animate-spin" />}
                  <span>Призначити рецензента</span>
                </button>
              </div>
            </form>

            <form onSubmit={handleScheduleDefense} className="space-y-4 rounded-lg border border-gray-200 p-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">2. Призначення захисту та складу комісії</h3>
                <p className="text-xs text-gray-600 mt-1">Виконуйте після рецензування. Це окрема незалежна дія.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Дата захисту</label>
                  <input
                    type="date"
                    value={defenseDate}
                    onChange={(event) => setDefenseDate(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Час захисту</label>
                  <input
                    type="time"
                    value={defenseTime}
                    onChange={(event) => setDefenseTime(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Місце захисту</label>
                  <input
                    value={defenseLocation}
                    onChange={(event) => setDefenseLocation(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Аудиторія, корпус або онлайн-посилання"
                  />
                </div>
              </div>

              {studentAcademicGroup && (
                <label className="flex items-center space-x-2 text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <input
                    type="checkbox"
                    checked={applyDefenseToGroup}
                    onChange={(event) => handleApplyDefenseToGroupChange(event.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Застосувати дату, час, місце <strong>та склад комісії</strong> для всієї групи <strong>{studentAcademicGroup}</strong></span>
                </label>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Члени комісії</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {teachers.map((teacher) => (
                    <label key={teacher.id} className="flex items-center space-x-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selectedCommission.includes(teacher.id)}
                        onChange={(event) => {
                          if (event.target.checked) {
                            setSelectedCommission((current) => [...current, teacher.id]);
                          } else {
                            setSelectedCommission((current) => current.filter((id) => id !== teacher.id));
                          }
                        }}
                      />
                      <span>{teacher.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={schedulingDefense || savingCommission || !defenseDate || !defenseLocation.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center space-x-2"
                >
                  {(schedulingDefense || savingCommission) && <Loader className="h-4 w-4 animate-spin" />}
                  <span>Зберегти назначення</span>
                </button>
              </div>
            </form>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
