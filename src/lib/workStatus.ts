import type { QualificationWork } from '../types';

export const getWorkStatusLabel = (status: QualificationWork['status'] | string) => {
  switch (status) {
    case 'draft':
      return 'Чернетка';
    case 'awaiting_advisor':
      return 'Очікує керівника';
    case 'advisor_assigned':
      return 'Керівника призначено';
    case 'in_progress':
      return 'У роботі';
    case 'ready_for_review':
      return 'Готова до рецензії';
    case 'under_review':
      return 'На рецензуванні';
    case 'revision_required':
      return 'Потрібне доопрацювання';
    case 'approved_for_defense':
      return 'Допущено до захисту';
    case 'defense_scheduled':
      return 'Призначено захист';
    case 'defense_completed':
      return 'Захист завершено';
    case 'archived':
      return 'Архівовано';
    default:
      return String(status).replace(/_/g, ' ');
  }
};
