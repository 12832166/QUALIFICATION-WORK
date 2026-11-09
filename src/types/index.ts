export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'student' | 'teacher' | 'dean';
  academic_group?: string;
  advisor_id?: string;
  created_at: string;
  updated_at: string;
}

export interface QualificationWork {
  id: string;
  student_id: string;
  advisor_id?: string;
  reviewer_id?: string;
  title: string;
  description?: string;
  work_type: 'coursework' | 'diploma';
  theme_status?: 'pending' | 'approved' | 'rejected';
  theme_decision_comment?: string;
  theme_decided_at?: string;
  theme_decided_by?: string;
  status:
    | 'draft'
    | 'awaiting_advisor'
    | 'advisor_assigned'
    | 'in_progress'
    | 'ready_for_review'
    | 'under_review'
    | 'revision_required'
    | 'approved_for_defense'
    | 'defense_scheduled'
    | 'defense_completed'
    | 'archived';
  submitted_at?: string;
  advisor_assigned_at?: string;
  reviewer_assigned_at?: string;
  defense_date?: string;
  defense_time?: string;
  defense_location?: string;
  final_score?: number;
  final_decision?: string;
  created_at: string;
  updated_at: string;
  student?: User;
  advisor?: User;
  reviewer?: User;
  teacher_id?: string;
  teacher?: User;
}

export interface WorkVersion {
  id: string;
  work_id: string;
  version_number: number;
  file_name: string;
  file_url: string;
  notes?: string;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  uploader?: User;
}

export interface WorkMessage {
  id: string;
  work_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  sender?: User;
}

export interface WorkReview {
  id: string;
  work_id: string;
  reviewer_id: string;
  review_type?: 'reviewer_review' | 'advisor_feedback';
  decision: 'revision_required' | 'approved';
  feedback: string;
  score?: number;
  created_at: string;
  updated_at: string;
  reviewer?: User;
}

export interface CommissionMember {
  id: string;
  work_id: string;
  teacher_id: string;
  created_at: string;
  teacher?: User;
}

export interface DefenseScore {
  id: string;
  work_id: string;
  teacher_id: string;
  score: number;
  comment?: string;
  created_at: string;
  updated_at: string;
  teacher?: User;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message?: string;
  type: string;
  related_work_id?: string;
  is_read: boolean;
  created_at: string;
  updated_at?: string;
}

export interface PublicDefendedWork {
  id: string;
  title: string;
  description?: string;
  work_type: 'coursework' | 'diploma';
  student_name: string;
  advisor_name?: string;
  reviewer_name?: string;
  file_name?: string;
  has_file: boolean;
  defense_date?: string;
  defense_time?: string;
  defense_location?: string;
  final_score?: number;
  created_at: string;
}

export interface GuestProtectedFile {
  blob: Blob;
  sessionId: string;
  openToken: string;
  openedAt: string;
  generatedAt: string;
}

export interface WorkChatPayload {
  content: string;
}

export type Review = WorkReview;
export type Comment = WorkMessage;
