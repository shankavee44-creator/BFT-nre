/**
 * Pure pagination utility functions for trade history, affiliate referral network,
 * and data tables. Decoupled and unit-tested for robust edge cases.
 */

export interface PaginationMetrics {
  totalItems: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  fromItem: number;
  toItem: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * Calculates complete pagination metrics safely, handling 0 items, out-of-bound pages,
 * and negative numbers.
 */
export function calculatePaginationMetrics(
  totalItems: number,
  page: number,
  pageSize: number = 10
): PaginationMetrics {
  const safeTotal = Math.max(0, Number.isFinite(totalItems) ? totalItems : 0);
  const safePageSize = Math.max(1, Number.isFinite(pageSize) ? pageSize : 10);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safePageSize));
  const currentPage = Math.min(Math.max(1, Number.isFinite(page) ? page : 1), totalPages);

  const startIndex = safeTotal === 0 ? 0 : (currentPage - 1) * safePageSize;
  const endIndex = Math.min(startIndex + safePageSize, safeTotal);
  const fromItem = safeTotal === 0 ? 0 : startIndex + 1;
  const toItem = endIndex;

  return {
    totalItems: safeTotal,
    pageSize: safePageSize,
    currentPage,
    totalPages,
    startIndex,
    endIndex,
    fromItem,
    toItem,
    hasPrev: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

/**
 * Slices an array of items for the given page and page size.
 */
export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number = 10
): T[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const metrics = calculatePaginationMetrics(items.length, page, pageSize);
  return items.slice(metrics.startIndex, metrics.endIndex);
}

/**
 * Computes the page button numbers with ellipsis for rendering clean pagination controls.
 * e.g., for page 5 of 10: [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]
 * e.g., for page 1 of 4: [1, 2, 3, 4]
 */
export function calculatePaginationRange(
  currentPage: number,
  totalPages: number,
  maxVisibleButtons: number = 5
): (number | 'ellipsis')[] {
  if (totalPages <= 1) return [1];
  if (totalPages <= maxVisibleButtons) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | 'ellipsis')[] = [];
  const sideWidth = 1; // 1 before and 1 after current page

  const leftBound = Math.max(2, currentPage - sideWidth);
  const rightBound = Math.min(totalPages - 1, currentPage + sideWidth);

  // Always show first page
  pages.push(1);

  if (leftBound > 2) {
    pages.push('ellipsis');
  }

  for (let i = leftBound; i <= rightBound; i++) {
    pages.push(i);
  }

  if (rightBound < totalPages - 1) {
    pages.push('ellipsis');
  }

  // Always show last page
  pages.push(totalPages);

  return pages;
}
