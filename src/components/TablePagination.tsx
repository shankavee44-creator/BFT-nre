import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import {
  calculatePaginationMetrics,
  calculatePaginationRange,
} from '../utils/paginationHelper';

export interface TablePaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (newPage: number) => void;
  onPageSizeChange?: (newSize: number) => void;
  pageSizeOptions?: number[];
  itemLabel?: string;
  className?: string;
  testIdPrefix?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 15, 25, 50],
  itemLabel = 'items',
  className = '',
  testIdPrefix = 'table-pagination',
}) => {
  const metrics = calculatePaginationMetrics(totalItems, currentPage, pageSize);
  const pageRange = calculatePaginationRange(metrics.currentPage, metrics.totalPages, 5);

  if (totalItems <= 0) {
    return null;
  }

  return (
    <div
      data-testid={`${testIdPrefix}-container`}
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 mt-3 border-t border-white/10 text-xs font-mono select-none ${className}`}
    >
      {/* Left: Summary & Page Size Selector */}
      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 text-slate-400 text-[11px] w-full sm:w-auto">
        <span>
          Showing{' '}
          <strong className="text-white font-bold">
            {metrics.fromItem}–{metrics.toItem}
          </strong>{' '}
          of <strong className="text-white font-bold">{metrics.totalItems}</strong> {itemLabel}
        </span>

        {onPageSizeChange && pageSizeOptions.length > 1 && (
          <div className="flex items-center gap-1.5 pl-2 border-l border-white/10">
            <span className="text-slate-500 text-[10px] hidden xs:inline">Show:</span>
            <div className="flex items-center gap-1">
              {pageSizeOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  data-testid={`${testIdPrefix}-size-btn-${opt}`}
                  onClick={() => {
                    if (opt !== pageSize) {
                      onPageSizeChange(opt);
                      onPageChange(1);
                    }
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                    opt === pageSize
                      ? 'bg-[#ff8800] text-slate-950 font-black'
                      : 'bg-[#1a1d26] text-slate-400 hover:text-white hover:bg-[#252a37] border border-white/10'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: Navigation Controls */}
      <div className="flex items-center justify-center gap-1 w-full sm:w-auto">
        {/* Mobile Page Indicator (xs viewports) */}
        <div className="flex sm:hidden items-center text-[11px] text-slate-400 mr-1">
          <span>
            Page <strong className="text-white">{metrics.currentPage}</strong> of{' '}
            <strong className="text-white">{metrics.totalPages}</strong>
          </span>
        </div>

        {/* First Page Button (optional on larger screens) */}
        {metrics.totalPages > 4 && (
          <button
            type="button"
            data-testid={`${testIdPrefix}-first-btn`}
            disabled={!metrics.hasPrev}
            onClick={() => onPageChange(1)}
            aria-label="First Page"
            className="hidden md:flex p-1.5 rounded-lg bg-[#1a1d26] text-slate-400 hover:text-white hover:bg-[#252a37] border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Previous Button */}
        <button
          type="button"
          data-testid={`${testIdPrefix}-prev-btn`}
          disabled={!metrics.hasPrev}
          onClick={() => onPageChange(metrics.currentPage - 1)}
          aria-label="Previous Page"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1a1d26] text-slate-300 hover:text-white hover:bg-[#252a37] border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold cursor-pointer"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>

        {/* Numeric Page Buttons (Desktop & Tablet) */}
        <div className="hidden sm:flex items-center gap-1">
          {pageRange.map((page, index) => {
            if (page === 'ellipsis') {
              return (
                <span
                  key={`ellipsis-${index}`}
                  className="px-1.5 py-1 text-slate-500 font-bold tracking-widest text-[10px]"
                >
                  …
                </span>
              );
            }

            const isCurrent = page === metrics.currentPage;
            return (
              <button
                key={page}
                type="button"
                data-testid={`${testIdPrefix}-page-btn-${page}`}
                onClick={() => onPageChange(page)}
                aria-current={isCurrent ? 'page' : undefined}
                className={`min-w-7 h-7 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                  isCurrent
                    ? 'bg-[#ff8800] text-slate-950 font-black shadow-md shadow-[#ff8800]/20'
                    : 'bg-[#1a1d26] text-slate-300 hover:text-white hover:bg-[#252a37] border border-white/10'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          type="button"
          data-testid={`${testIdPrefix}-next-btn`}
          disabled={!metrics.hasNext}
          onClick={() => onPageChange(metrics.currentPage + 1)}
          aria-label="Next Page"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1a1d26] text-slate-300 hover:text-white hover:bg-[#252a37] border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold cursor-pointer"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        {/* Last Page Button */}
        {metrics.totalPages > 4 && (
          <button
            type="button"
            data-testid={`${testIdPrefix}-last-btn`}
            disabled={!metrics.hasNext}
            onClick={() => onPageChange(metrics.totalPages)}
            aria-label="Last Page"
            className="hidden md:flex p-1.5 rounded-lg bg-[#1a1d26] text-slate-400 hover:text-white hover:bg-[#252a37] border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
