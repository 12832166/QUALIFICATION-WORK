import React, { useEffect, useMemo, useState } from 'react';
import { Loader } from 'lucide-react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type FilePreviewProps = {
  fileUrl?: string;
  fileName?: string;
  maxPdfPages?: number;
};

GlobalWorkerOptions.workerSrc = pdfWorker;

const getFilePreviewKind = (fileUrl?: string, fileName?: string) => {
  const candidate = `${fileName || ''} ${fileUrl || ''}`.toLowerCase();

  if (candidate.includes('.pdf')) return 'pdf';
  if (candidate.match(/\.(png|jpg|jpeg|gif|webp)$/)) return 'image';
  if (candidate.match(/\.(txt|md|csv|json|xml|html|htm)$/)) return 'text';
  return 'other';
};

export const FilePreview: React.FC<FilePreviewProps> = ({ fileUrl, fileName, maxPdfPages = 30 }) => {
  const [pdfPageImages, setPdfPageImages] = useState<string[]>([]);
  const [renderingPdf, setRenderingPdf] = useState(false);
  const [pdfRenderError, setPdfRenderError] = useState('');

  const previewKind = useMemo(() => getFilePreviewKind(fileUrl, fileName), [fileName, fileUrl]);

  useEffect(() => {
    const renderPdfToImages = async () => {
      if (!fileUrl || previewKind !== 'pdf') {
        setPdfPageImages([]);
        setPdfRenderError('');
        setRenderingPdf(false);
        return;
      }

      setRenderingPdf(true);
      setPdfRenderError('');

      try {
        const loadingTask = getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        const renderedImages: string[] = [];
        const pagesToRender = Math.min(pdf.numPages, maxPdfPages);

        for (let pageNum = 1; pageNum <= pagesToRender; pageNum += 1) {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.4 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          if (!context) continue;

          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);

          await page.render({ canvasContext: context, viewport, canvas }).promise;
          renderedImages.push(canvas.toDataURL('image/jpeg', 0.92));
        }

        setPdfPageImages(renderedImages);
      } catch (error) {
        console.error('Error rendering file preview:', error);
        setPdfRenderError('Не вдалося підготувати превʼю PDF.');
        setPdfPageImages([]);
      } finally {
        setRenderingPdf(false);
      }
    };

    renderPdfToImages();
  }, [fileUrl, maxPdfPages, previewKind]);

  if (!fileUrl) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-600">
        Файл не вказано.
      </div>
    );
  }

  if (previewKind === 'pdf') {
    if (renderingPdf) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-600">
          <Loader className="mr-2 h-5 w-5 animate-spin text-indigo-600" />
          Готуємо превʼю PDF...
        </div>
      );
    }

    if (pdfRenderError) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-dashed border-rose-300 text-rose-700">
          {pdfRenderError}
        </div>
      );
    }

    if (pdfPageImages.length === 0) {
      return (
        <div className="flex min-h-[40vh] items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-600">
          Немає доступних сторінок для превʼю.
        </div>
      );
    }

    return (
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
    );
  }

  if (previewKind === 'image') {
    return (
      <img
        src={fileUrl}
        alt={fileName || 'Файл'}
        className="max-h-[65vh] w-full rounded-lg border border-gray-200 object-contain"
        draggable={false}
      />
    );
  }

  return <iframe title={fileName || 'Файл'} src={fileUrl} className="h-[65vh] w-full rounded-lg border border-gray-200" />;
};