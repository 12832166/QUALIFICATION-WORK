import { createClient } from '@supabase/supabase-js';
import type {
  QualificationWork,
  WorkMessage,
  WorkReview,
  WorkVersion,
  DefenseScore,
  PublicDefendedWork,
  GuestProtectedFile,
} from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

const sanitizeFileName = (fileName: string) => {
  const normalizedName = fileName.normalize('NFKC');
  const lastPathSegment = normalizedName.split(/[/\\]/).pop() || 'document.pdf';
  const safeName = lastPathSegment
    .replace(/\.{2,}/g, '.')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^[_.]+/, '')
    .replace(/_+/g, '_')
    .trim();

  if (!safeName) return 'document.pdf';
  if (!safeName.toLowerCase().endsWith('.pdf')) {
    return `${safeName}.pdf`;
  }

  return safeName;
};

export const validatePdfFile = async (file: File) => {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Дозволено лише PDF-файли.');
  }

  if (file.type && file.type !== 'application/pdf') {
    throw new Error('Неприпустимий MIME-тип файлу. Очікується PDF.');
  }

  const header = new Uint8Array(await file.slice(0, PDF_MAGIC_BYTES.length).arrayBuffer());
  const isPdf = PDF_MAGIC_BYTES.every((byte, index) => header[index] === byte);

  if (!isPdf) {
    throw new Error('Файл не є дійсним PDF. Порушено сигнатуру Magic Bytes.');
  }

  return {
    sanitizedFileName: sanitizeFileName(file.name),
  };
};

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return profile;
};

export const getPublicDefendedWorks = async () => {
  const { data, error } = await supabase.rpc('get_public_defended_works');
  if (error) throw error;
  return (data || []).map((work: PublicDefendedWork) => ({
    ...work,
    // Never propagate the original uploaded name into the guest UI, including
    // while the database migration is still being rolled out.
    file_name: undefined,
  })) as PublicDefendedWork[];
};

type GuestFileAction = 'open' | 'download';

export const getProtectedGuestPdf = async (
  action: GuestFileAction,
  workId: string,
  options: { sessionId?: string; openToken?: string } = {},
): Promise<GuestProtectedFile> => {
  const params = new URLSearchParams({ action, work_id: workId });
  if (options.sessionId) params.set('session_id', options.sessionId);
  if (options.openToken) params.set('open_token', options.openToken);

  const response = await fetch(`${supabaseUrl}/functions/v1/guest-files?${params.toString()}`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || 'Не вдалося отримати захищений файл.');
  }

  const sessionId = response.headers.get('X-Guest-Session-Id');
  const openToken = response.headers.get('X-Guest-Open-Token');
  const openedAt = response.headers.get('X-Opened-At');
  const generatedAt = response.headers.get('X-Generated-At');
  if (!sessionId || !openToken || !openedAt || !generatedAt) {
    throw new Error('Сервер повернув неповні дані гостьової сесії.');
  }

  return {
    blob: await response.blob(),
    sessionId,
    openToken,
    openedAt,
    generatedAt,
  };
};

export const updateMyProfile = async (fullName: string) => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Користувач не авторизований');

  const { data, error } = await supabase
    .from('users')
    .update({ full_name: fullName.trim() })
    .eq('id', authData.user.id)
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

export const updateMyPassword = async (newPassword: string) => {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
};

// Helper function to assign advisor to student
export const assignAdvisorToStudent = async (studentId: string, advisorId: string) => {
  const { data, error } = await supabase.rpc('assign_advisor_to_student', {
    p_student_id: studentId,
    p_advisor_id: advisorId,
  });

  if (error) {
    throw error;
  }

  return data;
};

export const assignAdvisorToWork = async (workId: string, advisorId: string) => {
  const { data, error } = await supabase.rpc('assign_advisor_to_work', {
    p_work_id: workId,
    p_advisor_id: advisorId,
  });

  if (error) throw error;
  return data;
};

export const createWorkRequest = async (title: string, workType: 'coursework' | 'diploma', description?: string) => {
  const { data, error } = await supabase.rpc('submit_work_request', {
    p_title: title,
    p_work_type: workType,
    p_description: description || null,
  });

  if (error) throw error;
  return data as QualificationWork;
};

export const uploadWorkVersion = async (
  workId: string,
  file: File,
  notes?: string,
) => {
  const { sanitizedFileName } = await validatePdfFile(file);
  const fileName = `${Date.now()}-${sanitizedFileName}`;
  const filePath = `${workId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('work-files')
    .upload(filePath, file, { upsert: false });

  if (uploadError) throw uploadError;

  const { data, error } = await supabase.rpc('submit_work_version', {
    p_work_id: workId,
    p_file_name: sanitizedFileName,
    p_file_url: filePath,
    p_notes: notes || null,
  });

  if (error) throw error;
  return data as WorkVersion;
};

export const sendWorkMessage = async (workId: string, content: string) => {
  const { data, error } = await supabase.rpc('send_work_message', {
    p_work_id: workId,
    p_content: content,
  });

  if (error) throw error;
  return data as WorkMessage;
};

export const assignReviewerToWork = async (workId: string, reviewerId: string) => {
  const { data, error } = await supabase.rpc('assign_reviewer_to_work', {
    p_work_id: workId,
    p_reviewer_id: reviewerId,
  });

  if (error) throw error;
  return data;
};

export const decideWorkTheme = async (
  workId: string,
  decision: 'approved' | 'rejected',
  comment?: string,
) => {
  const { data, error } = await supabase.rpc('decide_work_theme', {
    p_work_id: workId,
    p_decision: decision,
    p_comment: comment || null,
  });

  if (error) throw error;
  return data as QualificationWork;
};

export const submitWorkReview = async (
  workId: string,
  decision: 'revision_required' | 'approved',
  feedback: string,
  score?: number,
) => {
  const { data, error } = await supabase.rpc('submit_work_review', {
    p_work_id: workId,
    p_decision: decision,
    p_feedback: feedback,
    p_score: score ?? null,
  });

  if (error) throw error;
  return data as WorkReview;
};

export const submitAdvisorFeedback = async (
  workId: string,
  decision: 'revision_required' | 'approved',
  feedback: string,
  score?: number,
) => {
  const { data, error } = await supabase.rpc('submit_advisor_feedback', {
    p_work_id: workId,
    p_decision: decision,
    p_feedback: feedback,
    p_score: score ?? null,
  });

  if (error) throw error;
  return data as WorkReview;
};

export const scheduleDefense = async (workId: string, defenseDate: string, defenseTime: string, location: string) => {
  const { data, error } = await supabase.rpc('schedule_defense', {
    p_work_id: workId,
    p_defense_date: defenseDate,
    p_defense_time: defenseTime,
    p_location: location,
  });

  if (error) throw error;
  return data;
};

export const scheduleDefenseForGroup = async (academicGroup: string, defenseDate: string, defenseTime: string, location: string) => {
  const { data, error } = await supabase.rpc('schedule_defense_for_group', {
    p_academic_group: academicGroup,
    p_defense_date: defenseDate,
    p_defense_time: defenseTime,
    p_location: location,
  });

  if (error) throw error;
  return data;
};

export const assignCommissionMember = async (workId: string, teacherId: string) => {
  const { data, error } = await supabase.rpc('assign_commission_member', {
    p_work_id: workId,
    p_teacher_id: teacherId,
  });

  if (error) throw error;
  return data;
};

export const assignCommissionToGroup = async (academicGroup: string, teacherId: string) => {
  const { data, error } = await supabase.rpc('assign_commission_to_group', {
    p_academic_group: academicGroup,
    p_teacher_id: teacherId,
  });

  if (error) throw error;
  return data;
};

export const removeCommissionMember = async (workId: string, teacherId: string) => {
  const { error } = await supabase
    .from('work_commission_members')
    .delete()
    .eq('work_id', workId)
    .eq('teacher_id', teacherId);

  if (error) throw error;
};

export const deleteWorkAsDean = async (workId: string) => {
  const { data, error } = await supabase.rpc('delete_work_as_dean', {
    p_work_id: workId,
  });

  if (error) throw error;
  return data;
};

export const submitDefenseScore = async (workId: string, score: number, comment?: string) => {
  const { data, error } = await supabase.rpc('submit_defense_score', {
    p_work_id: workId,
    p_score: score,
    p_comment: comment || null,
  });

  if (error) throw error;
  return data as DefenseScore;
};

// Get all students
export const getStudents = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'student')
    .order('full_name');

  if (error) throw error;
  return data || [];
};

// Get all teachers
export const getTeachers = async () => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('role', 'teacher')
    .order('full_name');

  if (error) throw error;
  return data || [];
};

// Get qualification works for student
export const getStudentWorks = async (studentId: string) => {
  const { data, error } = await supabase
    .from('qualification_works')
    .select(`
      *,
      student:student_id(id, email, full_name, role, academic_group),
      advisor:advisor_id(id, email, full_name, role),
      reviewer:reviewer_id(id, email, full_name, role)
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

// Get qualification works assigned to teacher
export const getTeacherWorks = async (teacherId: string) => {
  const { data, error } = await supabase
    .from('qualification_works')
    .select(`
      *,
      student:student_id(id, email, full_name, role, academic_group),
      advisor:advisor_id(id, email, full_name, role),
      reviewer:reviewer_id(id, email, full_name, role)
    `)
    .or(`advisor_id.eq.${teacherId},reviewer_id.eq.${teacherId}`)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getTeacherCommissionWorks = async (teacherId: string) => {
  const { data: commissionRows, error: commissionError } = await supabase
    .from('work_commission_members')
    .select('work_id')
    .eq('teacher_id', teacherId);

  if (commissionError) throw commissionError;

  const workIds = (commissionRows || []).map((row) => row.work_id);
  if (workIds.length === 0) return [];

  const { data, error } = await supabase
    .from('qualification_works')
    .select(`
      *,
      student:student_id(id, email, full_name, role, academic_group),
      advisor:advisor_id(id, email, full_name, role),
      reviewer:reviewer_id(id, email, full_name, role)
    `)
    .in('id', workIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

// Get all qualification works (for dean)
export const getAllWorks = async () => {
  const { data, error } = await supabase
    .from('qualification_works')
    .select(`
      *,
      student:student_id(id, email, full_name, role, academic_group),
      advisor:advisor_id(id, email, full_name, role),
      reviewer:reviewer_id(id, email, full_name, role)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getWorkVersions = async (workId: string) => {
  const { data, error } = await supabase
    .from('work_versions')
    .select(`*, uploader:uploaded_by(id, email, full_name, role)`)
    .eq('work_id', workId)
    .order('version_number', { ascending: false });

  if (error) throw error;

  return Promise.all((data || []).map(async (version) => {
    let storagePath = version.file_url as string;
    if (/^https?:\/\//i.test(storagePath)) {
      const url = new URL(storagePath);
      const marker = '/storage/v1/object/public/work-files/';
      const markerIndex = url.pathname.indexOf(marker);
      if (markerIndex === -1) throw new Error('Непідтримуваний шлях файлу в Storage.');
      storagePath = decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
    }

    const { data: signedFile, error: signedFileError } = await supabase.storage
      .from('work-files')
      .createSignedUrl(storagePath.replace(/^\/+/, '').replace(/^work-files\//, ''), 3600);
    if (signedFileError) throw signedFileError;

    return { ...version, file_url: signedFile.signedUrl };
  }));
};

export const getWorkMessages = async (workId: string) => {
  const { data, error } = await supabase
    .from('work_messages')
    .select(`*, sender:sender_id(id, email, full_name, role)`)
    .eq('work_id', workId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getWorkReviews = async (workId: string) => {
  const { data, error } = await supabase
    .from('work_reviews')
    .select(`*, reviewer:reviewer_id(id, email, full_name, role)`)
    .eq('work_id', workId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const getCommissionMembers = async (workId: string) => {
  const { data, error } = await supabase
    .from('work_commission_members')
    .select(`*, teacher:teacher_id(id, email, full_name, role)`)
    .eq('work_id', workId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
};

export const getNotifications = async (userId: string) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const markNotificationAsRead = async (notificationId: string, userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) throw error;
};

export const markAllNotificationsAsRead = async (userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) throw error;
};

export const deleteNotification = async (notificationId: string, userId: string) => {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) throw error;
};

export const getDefenseScores = async (workId: string) => {
  const { data, error } = await supabase
    .from('defense_scores')
    .select(`*, teacher:teacher_id(id, email, full_name, role)`)
    .eq('work_id', workId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};
