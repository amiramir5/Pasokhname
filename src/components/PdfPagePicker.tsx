import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  Eye,
  FileText,
  Loader2,
  MousePointerClick,
  ScanLine,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  RenderedPageImage,
  downloadPdfPageRange,
  renderPdfFileToImages,
  renderPdfThumbnails,
} from '../utils/pdfAndVision';
import { toFarsiDigits, parseFarsiInt } from '../utils/farsi';

interface PdfPagePickerProps {
  file: File;
  /** متن راهنمای بالای انتخاب‌گر */
  hint?: string;
  /** حداکثر صفحات رندر تامبنیل */
  maxThumbnails?: number;
  onSelectionChange: (pages: number[]) => void;
}

/**
 * پیش‌نمایش تمام صفحات PDF + انتخاب محدوده صفحه (مثلاً فقط صفحات زیست‌شناسی)
 * + دانلود نسخه برش‌خورده PDF از همان محدوده.
 */
export const PdfPagePicker: React.FC<PdfPagePickerProps> = ({
  file,
  hint,
  maxThumbnails = 150,
  onSelectionChange,
}) => {
  const [thumbs, setThumbs] = useState<RenderedPageImage[]>([]);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [selected, setSelected] = useState<number[]>([]);
  const [rangeFrom, setRangeFrom] = useState<string>('۱');
  const [rangeTo, setRangeTo] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const lastNotifiedRef = useRef<string>('');

  // بزرگ‌نمایی صفحه برای دیدن جزئیات و شماره سوال‌ها
  const [previewPage, setPreviewPage] = useState<number | null>(null);
  const [previewImg, setPreviewImg] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [zoom, setZoom] = useState<number>(1);
  const previewCacheRef = useRef<Map<number, string>>(new Map());

  // رندر تامبنیل‌ها هنگام تغییر فایل
  useEffect(() => {
    let cancelled = false;
    setThumbs([]);
    setSelected([]);
    setMessage(null);
    setIsRendering(true);
    setProgress({ done: 0, total: 0 });

    renderPdfThumbnails(file, maxThumbnails, 280, (done, total) => {
      if (!cancelled) setProgress({ done, total });
    })
      .then((pages) => {
        if (cancelled) return;
        setThumbs(pages);
        const all = pages.map((p) => p.pageNumber);
        setSelected(all);
        setRangeTo(all.length > 0 ? toFarsiDigits(all[all.length - 1]) : '');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'خطا در ساخت پیش‌نمایش صفحات PDF',
        });
      })
      .finally(() => {
        if (!cancelled) setIsRendering(false);
      });

    previewCacheRef.current.clear();
    setPreviewPage(null);

    return () => {
      cancelled = true;
    };
  }, [file, maxThumbnails]);

  // رندر نسخه باکیفیت همان صفحه هنگام باز شدن پیش‌نمایش بزرگ
  useEffect(() => {
    if (previewPage == null) return;
    const cached = previewCacheRef.current.get(previewPage);
    if (cached) {
      setPreviewImg(cached);
      setIsPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setIsPreviewLoading(true);
    setPreviewImg(null);
    renderPdfFileToImages(file, 1, 2.4, [previewPage])
      .then((pages) => {
        if (cancelled) return;
        const url = pages[0]?.dataUrl ?? null;
        if (url) previewCacheRef.current.set(previewPage, url);
        setPreviewImg(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewImg(null);
      })
      .finally(() => {
        if (!cancelled) setIsPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [previewPage, file]);

  const openPreview = (pageNumber: number) => {
    setZoom(1);
    setPreviewPage(pageNumber);
  };

  const closePreview = () => {
    setPreviewPage(null);
    setPreviewImg(null);
  };

  const gotoPreviewPage = (delta: number) => {
    setPreviewPage((prev) => {
      if (prev == null) return prev;
      const next = prev + delta;
      if (next < 1 || next > (pageCount || prev)) return prev;
      return next;
    });
    setZoom(1);
  };

  const pageCount = thumbs.length;

  // کلیدهای میان‌بر پیش‌نمایش: Esc بستن، فلش چپ/راست جابه‌جایی صفحه
  useEffect(() => {
    if (previewPage === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePreview();
      } else if (event.key === 'ArrowLeft') {
        gotoPreviewPage(1);
      } else if (event.key === 'ArrowRight') {
        gotoPreviewPage(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewPage, pageCount]);

  const sortedSelected = useMemo(
    () => Array.from(new Set(selected)).sort((a, b) => a - b),
    [selected]
  );
  const selectedKey = sortedSelected.join(',');

  // اطلاع‌رسانی به والد فقط هنگام تغییر واقعی انتخاب
  useEffect(() => {
    if (lastNotifiedRef.current === selectedKey) return;
    lastNotifiedRef.current = selectedKey;
    onSelectionChange(sortedSelected);
  }, [selectedKey, sortedSelected, onSelectionChange]);

  const togglePage = (pageNumber: number) => {
    setMessage(null);
    setSelected((prev) =>
      prev.includes(pageNumber)
        ? prev.filter((p) => p !== pageNumber)
        : [...prev, pageNumber]
    );
  };

  const selectAll = () => {
    setSelected(thumbs.map((t) => t.pageNumber));
    setMessage(null);
  };

  const clearAll = () => {
    setSelected([]);
    setMessage(null);
  };

  const applyRange = () => {
    const from = Math.max(1, parseFarsiInt(rangeFrom, 1));
    const to = Math.min(
      pageCount || Number.MAX_SAFE_INTEGER,
      Math.max(from, parseFarsiInt(rangeTo, pageCount || from))
    );
    const range: number[] = [];
    for (let p = from; p <= to; p++) range.push(p);
    setSelected(range);
    setMessage({
      type: 'success',
      text: `بازه صفحات ${toFarsiDigits(from)} تا ${toFarsiDigits(to)} انتخاب شد (${toFarsiDigits(range.length)} صفحه).`,
    });
  };

  const handleDownload = async () => {
    if (sortedSelected.length === 0) {
      setMessage({ type: 'error', text: 'ابتدا حداقل یک صفحه را انتخاب کنید.' });
      return;
    }
    setIsDownloading(true);
    setMessage(null);
    try {
      const count = await downloadPdfPageRange(file, sortedSelected);
      setMessage({
        type: 'success',
        text: `فایل PDF برش‌خورده با ${toFarsiDigits(count)} صفحه دانلود شد.`,
      });
    } catch (err: unknown) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'خطا در ساخت فایل PDF برش‌خورده',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#D5C8FF] bg-[#FAF8FF] p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#EDE7FF] text-[#6338F9] flex items-center justify-center shrink-0">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-800 truncate" title={file.name}>
              {file.name}
            </p>
            <p className="text-[11px] text-slate-500 tabular-farsi">
              {pageCount > 0
                ? `${toFarsiDigits(pageCount)} صفحه · ${toFarsiDigits(sortedSelected.length)} صفحه انتخاب‌شده`
                : 'در حال آماده‌سازی پیش‌نمایش...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={selectAll}
            disabled={isRendering || pageCount === 0}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold disabled:opacity-50 cursor-pointer"
          >
            همه صفحات
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={isRendering || pageCount === 0}
            className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold disabled:opacity-50 cursor-pointer"
          >
            پاک کردن
          </button>
        </div>
      </div>

      {hint && (
        <p className="text-[11px] text-slate-600 leading-relaxed flex items-start gap-1.5">
          <MousePointerClick className="w-3.5 h-3.5 text-[#6338F9] shrink-0 mt-0.5" />
          <span>{hint}</span>
        </p>
      )}

      {/* انتخاب سریع بازه */}
      <div className="flex flex-wrap items-end gap-2 bg-white rounded-xl border border-slate-200 p-2.5">
        <div className="space-y-1">
          <label htmlFor="range-from" className="block text-[10px] text-slate-500 font-semibold">
            از صفحه
          </label>
          <input
            id="range-from"
            type="text"
            inputMode="numeric"
            value={rangeFrom}
            onChange={(e) => setRangeFrom(toFarsiDigits(e.target.value))}
            className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-center tabular-farsi focus:outline-none focus:border-[#6338F9]"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="range-to" className="block text-[10px] text-slate-500 font-semibold">
            تا صفحه
          </label>
          <input
            id="range-to"
            type="text"
            inputMode="numeric"
            value={rangeTo}
            onChange={(e) => setRangeTo(toFarsiDigits(e.target.value))}
            className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-center tabular-farsi focus:outline-none focus:border-[#6338F9]"
          />
        </div>
        <button
          type="button"
          onClick={applyRange}
          disabled={isRendering || pageCount === 0}
          className="px-3 py-1.5 rounded-lg bg-[#6338F9] hover:bg-[#5228E8] disabled:opacity-50 text-white text-[11px] font-bold cursor-pointer"
        >
          انتخاب این بازه
        </button>

        <button
          type="button"
          onClick={handleDownload}
          disabled={isDownloading || sortedSelected.length === 0}
          className="mr-auto px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-[#6338F9]/30 text-[#6338F9] disabled:opacity-50 text-[11px] font-bold flex items-center gap-1.5 cursor-pointer"
        >
          {isDownloading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          <span>دانلود PDF برش‌خورده</span>
        </button>
      </div>

      {isRendering && (
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#6338F9]" />
          <span className="tabular-farsi">
            در حال ساخت پیش‌نمایش صفحات... {toFarsiDigits(progress.done)} از{' '}
            {toFarsiDigits(progress.total || maxThumbnails)}
          </span>
        </div>
      )}

      {message && (
        <p
          className={`text-[11px] font-semibold p-2 rounded-lg ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          {message.text}
        </p>
      )}

      {thumbs.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-500 leading-relaxed">
            برای دیدن شماره سوال‌ها و متن صفحه، روی صفحه کلیک نکنید؛ آیکن{' '}
            <span className="inline-flex items-center gap-0.5 font-bold text-[#6338F9]">
              <Eye className="w-3.5 h-3.5" /> چشم
            </span>{' '}
            گوشه هر صفحه را بزنید تا بزرگ‌نمایی شود. کلیک روی خود صفحه فقط آن را انتخاب/حذف می‌کند.
          </p>
          <div className="max-h-[26rem] overflow-y-auto rounded-xl bg-white border border-slate-200 p-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {thumbs.map((thumb) => {
                const isSelected = sortedSelected.includes(thumb.pageNumber);
                return (
                  <div
                    key={thumb.pageNumber}
                    role="button"
                    tabIndex={0}
                    onClick={() => togglePage(thumb.pageNumber)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        togglePage(thumb.pageNumber);
                      }
                    }}
                    aria-pressed={isSelected}
                    aria-label={`انتخاب صفحه ${toFarsiDigits(thumb.pageNumber)}`}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#6338F9] shadow-sm shadow-[#6338F9]/20'
                        : 'border-slate-200 hover:border-slate-300 opacity-75'
                    }`}
                  >
                    <img
                      src={thumb.dataUrl}
                      alt={`پیش‌نمایش صفحه ${toFarsiDigits(thumb.pageNumber)}`}
                      className="w-full h-auto block bg-white"
                      loading="lazy"
                    />
                    <span className="absolute bottom-0 inset-x-0 bg-slate-900/70 text-white text-[11px] font-bold text-center py-0.5 tabular-farsi">
                      صفحه {toFarsiDigits(thumb.pageNumber)}
                    </span>
                    {isSelected && (
                      <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-[#6338F9] text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={`بزرگ‌نمایی صفحه ${toFarsiDigits(thumb.pageNumber)}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        openPreview(thumb.pageNumber);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          openPreview(thumb.pageNumber);
                        }
                      }}
                      className="absolute top-1 left-1 w-7 h-7 rounded-full bg-white/95 text-[#6338F9] border border-slate-200 flex items-center justify-center shadow-sm hover:bg-[#6338F9] hover:text-white transition-colors cursor-pointer"
                      title="بزرگ‌نمایی صفحه"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {previewPage !== null && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3"
          onClick={closePreview}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl h-[88vh] flex flex-col overflow-hidden shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 tabular-farsi">
                  صفحه {toFarsiDigits(previewPage)} از {toFarsiDigits(pageCount)}
                </span>
                <span className="text-[11px] text-slate-500 tabular-farsi">
                  ({toFarsiDigits(Math.round(zoom * 100))}٪)
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(1, Number((z - 0.25).toFixed(2))))}
                  disabled={zoom <= 1}
                  aria-label="کوچک‌تر"
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 flex items-center justify-center cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(4, Number((z + 0.25).toFixed(2))))}
                  disabled={zoom >= 4}
                  aria-label="بزرگ‌تر"
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-700 disabled:opacity-40 flex items-center justify-center cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => togglePage(previewPage)}
                  className={`px-3 h-8 rounded-lg text-[11px] font-bold cursor-pointer ${
                    sortedSelected.includes(previewPage)
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-[#6338F9] text-white'
                  }`}
                >
                  {sortedSelected.includes(previewPage) ? 'حذف از انتخاب' : 'انتخاب این صفحه'}
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  aria-label="بستن پیش‌نمایش"
                  className="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto bg-slate-200/60 p-3">
              {isPreviewLoading && (
                <div className="h-full flex items-center justify-center gap-2 text-xs text-slate-600">
                  <Loader2 className="w-4 h-4 animate-spin text-[#6338F9]" />
                  <span>در حال بارگذاری تصویر باکیفیت صفحه...</span>
                </div>
              )}
              {!isPreviewLoading && previewImg && (
                <img
                  src={previewImg}
                  alt={`صفحه ${toFarsiDigits(previewPage)}`}
                  className="mx-auto block bg-white shadow-lg"
                  style={{ width: `${zoom * 100}%`, maxWidth: zoom === 1 ? '100%' : 'none' }}
                />
              )}
              {!isPreviewLoading && !previewImg && (
                <p className="h-full flex items-center justify-center text-xs text-rose-700">
                  تصویر این صفحه بارگذاری نشد.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-t border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => gotoPreviewPage(-1)}
                disabled={previewPage <= 1}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-[11px] font-bold cursor-pointer"
              >
                صفحه قبل
              </button>
              <span className="text-[11px] text-slate-500">
                برای بستن، کلید Esc یا بیرون کادر را بزنید
              </span>
              <button
                type="button"
                onClick={() => gotoPreviewPage(1)}
                disabled={previewPage >= pageCount}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-700 text-[11px] font-bold cursor-pointer"
              >
                صفحه بعد
              </button>
            </div>
          </div>
        </div>
      )}

      {sortedSelected.length > 12 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-1.5">
          <ScanLine className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            برای صرفه‌جویی در مصرف توکن، فقط صفحات همان درس (مثلاً زیست‌شناسی) را انتخاب کنید؛
            ارسال ۱۲ صفحه یا کمتر توصیه می‌شود.
          </span>
        </p>
      )}
    </div>
  );
};
