import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getProtectedGuestPdf, getPublicDefendedWorks } from '../lib/supabase';
import { PublicDefendedWork } from '../types';
import { ArrowLeft, BookOpen, FileText, Loader, Search, SortAsc } from 'lucide-react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

interface GuestProps {
  onBackToAuth: () => void;
}

type WorkTypeFilter = 'all' | 'coursework' | 'diploma';
type SortMode = 'newest' | 'oldest';

GlobalWorkerOptions.workerSrc = pdfWorker;

const getWorkTypeLabel = (workType: WorkTypeFilter | PublicDefendedWork['work_type']) => {
  if (workType === 'coursework') return 'Курсова';
  if (workType === 'diploma') return 'Дипломна';
  return 'Усі роботи';
};

type RenderedPdfPage = {
  image: string;
  width: number;
  height: number;
};

const renderPdfAsImages = async (blob: Blob, maxPages?: number): Promise<RenderedPdfPage[]> => {
  const loadingTask = getDocument({ data: await blob.arrayBuffer() });
  const pdf = await loadingTask.promise;
  const renderedPages: RenderedPdfPage[] = [];
  const pagesToRender = Math.min(pdf.numPages, maxPages ?? pdf.numPages);

  try {
    for (let pageNumber = 1; pageNumber <= pagesToRender; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('Не вдалося створити полотно для сторінки PDF.');

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: context, viewport, canvas }).promise;
      renderedPages.push({
        image: canvas.toDataURL('image/jpeg', 0.92),
        width: canvas.width,
        height: canvas.height,
      });
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return renderedPages;
};

export const Guest: React.FC<GuestProps> = ({ onBackToAuth }) => {
  const [works, setWorks] = useState<PublicDefendedWork[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [workTypeFilter, setWorkTypeFilter] = useState<WorkTypeFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [selectedWork, setSelectedWork] = useState<PublicDefendedWork | null>(null);
  const [pdfPageImages, setPdfPageImages] = useState<string[]>([]);
  const [renderingPdf, setRenderingPdf] = useState(false);
  const [pdfRenderError, setPdfRenderError] = useState('');
  const [downloadingProtectedPdf, setDownloadingProtectedPdf] = useState(false);
  const [guestAccess, setGuestAccess] = useState<{
    openToken: string;
    openedAt: string;
    generatedAt: string;
  } | null>(null);
  const guestSessionIdRef = useRef<string | undefined>(
    window.sessionStorage.getItem('guest-watermark-session-id') || undefined,
  );

  useEffect(() => {
    const loadWorks = async () => {
      try {
        const data = await getPublicDefendedWorks();
        setWorks(data);
      } catch (error) {
        console.error('Error loading public defended works:', error);
      } finally {
        setLoading(false);
      }
    };

    loadWorks();
  }, []);

  const filteredWorks = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    const sorted = [...works].sort((left, right) => {
      const leftDate = new Date(left.defense_date || left.created_at).getTime();
      const rightDate = new Date(right.defense_date || right.created_at).getTime();
      return sortMode === 'newest' ? rightDate - leftDate : leftDate - rightDate;
    });

    return sorted.filter((work) => {
      const matchesType = workTypeFilter === 'all' || work.work_type === workTypeFilter;
      const matchesSearch = !term || [
        work.title,
        work.description || '',
        work.student_name,
        work.advisor_name || '',
        work.reviewer_name || '',
      ].join(' ').toLowerCase().includes(term);

      return matchesType && matchesSearch;
    });
  }, [works, searchText, workTypeFilter, sortMode]);

  useEffect(() => {
    const renderPdfToImages = async () => {
      if (!selectedWork?.has_file) {
        setPdfPageImages([]);
        setPdfRenderError('Публічний файл роботи не знайдено.');
        setRenderingPdf(false);
        setGuestAccess(null);
        return;
      }

      setRenderingPdf(true);
      setPdfRenderError('');
      setPdfPageImages([]);
      setGuestAccess(null);

      try {
        const protectedFile = await getProtectedGuestPdf('open', selectedWork.id, {
          sessionId: guestSessionIdRef.current,
        });
        guestSessionIdRef.current = protectedFile.sessionId;
        window.sessionStorage.setItem('guest-watermark-session-id', protectedFile.sessionId);
        setGuestAccess({
          openToken: protectedFile.openToken,
          openedAt: protectedFile.openedAt,
          generatedAt: protectedFile.generatedAt,
        });

        const renderedPages = await renderPdfAsImages(protectedFile.blob, 30);
        setPdfPageImages(renderedPages.map((page) => page.image));
      } catch (error) {
        console.error('Error rendering PDF preview:', error);
        setPdfRenderError(error instanceof Error ? error.message : 'Не вдалося підготувати захищене превʼю PDF.');
        setPdfPageImages([]);
      } finally {
        setRenderingPdf(false);
      }
    };

    renderPdfToImages();
  }, [selectedWork?.has_file, selectedWork?.id]);

  const blockCopyAction = (event: React.SyntheticEvent) => {
    event.preventDefault();
  };

  const handleProtectedKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && ['c', 'x', 's', 'a', 'p'].includes(key)) {
      event.preventDefault();
    }
  };

  const handleDownloadProtectedPdf = async () => {
    if (!selectedWork || !guestAccess || !guestSessionIdRef.current) {
      return;
    }

    setDownloadingProtectedPdf(true);
    try {
      const protectedFile = await getProtectedGuestPdf('download', selectedWork.id, {
        sessionId: guestSessionIdRef.current,
        openToken: guestAccess.openToken,
      });
      const renderedPages = await renderPdfAsImages(protectedFile.blob);
      if (renderedPages.length === 0) throw new Error('PDF не містить доступних сторінок.');

      const { jsPDF } = await import('jspdf');
      const firstPage = renderedPages[0];
      const pdf = new jsPDF({
        orientation: firstPage.width >= firstPage.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [firstPage.width, firstPage.height],
        hotfixes: ['px_scaling'],
      });
      pdf.addImage(firstPage.image, 'JPEG', 0, 0, firstPage.width, firstPage.height);

      for (let index = 1; index < renderedPages.length; index += 1) {
        const page = renderedPages[index];
        pdf.addPage([page.width, page.height], page.width >= page.height ? 'landscape' : 'portrait');
        pdf.addImage(page.image, 'JPEG', 0, 0, page.width, page.height);
      }

      const anonymousFileName = `student_work_${selectedWork.id.slice(0, 8)}_protected.pdf`;
      pdf.save(anonymousFileName);
      setGuestAccess((current) => current && ({ ...current, generatedAt: protectedFile.generatedAt }));
    } catch (error) {
      console.error('Error creating protected PDF:', error);
      alert(error instanceof Error ? error.message : 'Не вдалося сформувати захищений PDF. Спробуйте ще раз.');
    } finally {
      setDownloadingProtectedPdf(false);
    }
  };

  useEffect(() => {
    if (!selectedWork) return;

    const handleWindowProtectedKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedWork(null);
        return;
      }

      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && ['c', 'x', 's', 'a', 'p'].includes(key)) {
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleWindowProtectedKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowProtectedKeyDown);
    };
  }, [selectedWork]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-indigo-600">Гостьовий перегляд</p>
            <h1 className="text-3xl font-bold text-gray-900 mt-1">Захищені роботи</h1>
            <p className="text-gray-600 mt-2">Пошук робіт за темою та відкриття файлу роботи без входу в систему.</p>
          </div>
          <button
            type="button"
            onClick={onBackToAuth}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад до входу
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
          <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Пошук за темою</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="Наприклад: автоматизація..."
                    className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">Тип роботи</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { value: 'all', label: 'Усі роботи' },
                    { value: 'coursework', label: 'Курсова' },
                    { value: 'diploma', label: 'Дипломна' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setWorkTypeFilter(option.value as WorkTypeFilter)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                        workTypeFilter === option.value
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="block text-sm font-medium text-gray-700 mb-2">Сортування</p>
                <button
                  type="button"
                  onClick={() => setSortMode((current) => (current === 'newest' ? 'oldest' : 'newest'))}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <span>{sortMode === 'newest' ? 'Найновіші спочатку' : 'Найстаріші спочатку'}</span>
                  <SortAsc className="h-4 w-4 text-gray-400" />
                </button>
              </div>

              <div className="rounded-xl bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Знайдено робіт</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{filteredWorks.length}</p>
              </div>
            </div>
          </aside>

          <main className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : filteredWorks.length > 0 ? (
              <div className="space-y-4">
                {filteredWorks.map((work) => (
                  <article key={work.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-gray-900">{work.title}</h2>
                          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
                            {getWorkTypeLabel(work.work_type)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700"><span className="font-medium">Студент:</span> {work.student_name}</p>
                        <p className="text-sm text-gray-700"><span className="font-medium">Керівник:</span> {work.advisor_name || 'Не вказано'}</p>
                        <p className="text-sm text-gray-700">
                          <span className="font-medium">Опубліковано:</span>{' '}
                          {new Date(work.created_at).toLocaleDateString('uk-UA')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedWork(work)}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        <FileText className="h-4 w-4" />
                        Відкрити файл
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <BookOpen className="h-12 w-12 text-gray-400" />
                <h2 className="mt-4 text-xl font-semibold text-gray-900">Робіт не знайдено</h2>
                <p className="mt-2 max-w-md text-gray-600">Спробуйте інший запит або змініть тип роботи.</p>
              </div>
            )}
          </main>
        </div>
      </div>

      {selectedWork && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-6">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.2em] text-indigo-600">Файл роботи</p>
                <h2 className="text-2xl font-bold text-gray-900 mt-1">{selectedWork.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWork(null)}
                className="text-2xl leading-none text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 overflow-y-auto p-6 xl:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                <div
                  className="rounded-xl border border-gray-200 bg-white p-4 select-none"
                  onCopy={blockCopyAction}
                  onCut={blockCopyAction}
                  onContextMenu={blockCopyAction}
                  onDragStart={blockCopyAction}
                  onKeyDown={handleProtectedKeyDown}
                  tabIndex={0}
                >
                  <h3 className="mb-3 text-lg font-semibold text-gray-900">Попередній перегляд файлу</h3>
                  {selectedWork.has_file ? (
                    <div className="relative">
                      {renderingPdf ? (
                        <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-600">
                          <Loader className="mr-2 h-5 w-5 animate-spin text-indigo-600" />
                          Готуємо персональне захищене превʼю PDF...
                        </div>
                      ) : pdfRenderError ? (
                        <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-dashed border-rose-300 p-4 text-center text-rose-700">
                          {pdfRenderError}
                        </div>
                      ) : pdfPageImages.length > 0 ? (
                        <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3">
                          {pdfPageImages.map((imageSrc, index) => (
                            <div key={`pdf-page-${index + 1}`} className="space-y-1">
                              <p className="text-xs text-gray-500">Сторінка {index + 1}</p>
                              <img
                                src={imageSrc}
                                alt={`PDF page ${index + 1}`}
                                className="w-full rounded border border-gray-200"
                                draggable={false}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-600">
                          Немає доступних сторінок для превʼю.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-600">
                      Публічний файл роботи не знайдено.
                    </div>
                  )}
                  <p className="mt-3 text-xs text-gray-500">
                    Сторінки показуються як зображення з персональною вотермаркою. Відкриття не записується; лише завантаження журналюється разом з IP-адресою.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <h3 className="text-lg font-semibold text-gray-900">Інформація</h3>
                  <div className="mt-4 space-y-3 text-sm text-gray-700">
                    <div>
                      <p className="text-gray-600">Студент</p>
                      <p className="font-medium text-gray-900">{selectedWork.student_name}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Керівник</p>
                      <p className="font-medium text-gray-900">{selectedWork.advisor_name || 'Не вказано'}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Рецензент</p>
                      <p className="font-medium text-gray-900">{selectedWork.reviewer_name || 'Не вказано'}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Тип</p>
                      <p className="font-medium text-gray-900">{getWorkTypeLabel(selectedWork.work_type)}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Опубліковано</p>
                      <p className="font-medium text-gray-900">{new Date(selectedWork.created_at).toLocaleDateString('uk-UA')}</p>
                    </div>
                  </div>
                </div>

                {selectedWork.description && (
                  <div
                    className="rounded-xl border border-gray-200 bg-white p-4 select-none"
                    onCopy={blockCopyAction}
                    onCut={blockCopyAction}
                    onContextMenu={blockCopyAction}
                    onDragStart={blockCopyAction}
                    onKeyDown={handleProtectedKeyDown}
                    tabIndex={0}
                  >
                    <h3 className="text-lg font-semibold text-gray-900">Короткий опис</h3>
                    <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{selectedWork.description}</p>
                  </div>
                )}

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-medium text-gray-600">Файл роботи</p>
                  <p className="mt-1 text-sm text-gray-900">
                    Захищений PDF-документ
                  </p>
                  {guestAccess && (
                    <div className="mt-3 space-y-1 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-900">
                      <p><span className="font-semibold">ID сесії:</span> {guestSessionIdRef.current}</p>
                      <p><span className="font-semibold">Відкрито:</span> {new Date(guestAccess.openedAt).toLocaleString('uk-UA')}</p>
                      <p><span className="font-semibold">Копію сформовано:</span> {new Date(guestAccess.generatedAt).toLocaleString('uk-UA')}</p>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedWork.has_file && (
                      <button
                        type="button"
                        onClick={handleDownloadProtectedPdf}
                        disabled={renderingPdf || downloadingProtectedPdf || !guestAccess || pdfPageImages.length === 0}
                        className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                      >
                        {downloadingProtectedPdf
                          ? 'Формуємо захищений PDF...'
                          : 'Завантажити захищену копію PDF'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedWork(null)}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Закрити
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
