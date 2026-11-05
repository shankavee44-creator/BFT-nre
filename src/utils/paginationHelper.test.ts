import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculatePaginationMetrics,
  paginateItems,
  calculatePaginationRange,
} from './paginationHelper';

test('calculatePaginationMetrics handles empty list safely', () => {
  const metrics = calculatePaginationMetrics(0, 1, 10);
  assert.equal(metrics.totalItems, 0);
  assert.equal(metrics.totalPages, 1);
  assert.equal(metrics.currentPage, 1);
  assert.equal(metrics.startIndex, 0);
  assert.equal(metrics.endIndex, 0);
  assert.equal(metrics.fromItem, 0);
  assert.equal(metrics.toItem, 0);
  assert.equal(metrics.hasPrev, false);
  assert.equal(metrics.hasNext, false);
});

test('calculatePaginationMetrics handles valid pagination and clamps out-of-bound pages', () => {
  // Page 2 of 45 items with size 10 => items 11 to 20
  const metrics = calculatePaginationMetrics(45, 2, 10);
  assert.equal(metrics.totalItems, 45);
  assert.equal(metrics.totalPages, 5);
  assert.equal(metrics.currentPage, 2);
  assert.equal(metrics.startIndex, 10);
  assert.equal(metrics.endIndex, 20);
  assert.equal(metrics.fromItem, 11);
  assert.equal(metrics.toItem, 20);
  assert.equal(metrics.hasPrev, true);
  assert.equal(metrics.hasNext, true);

  // Over-page clamping (requesting page 99 when total pages is 5)
  const clampedMetrics = calculatePaginationMetrics(45, 99, 10);
  assert.equal(clampedMetrics.currentPage, 5);
  assert.equal(clampedMetrics.fromItem, 41);
  assert.equal(clampedMetrics.toItem, 45);
  assert.equal(clampedMetrics.hasNext, false);

  // Under-page clamping (requesting page -5)
  const underMetrics = calculatePaginationMetrics(45, -5, 10);
  assert.equal(underMetrics.currentPage, 1);
  assert.equal(underMetrics.hasPrev, false);
});

test('paginateItems slices correctly across pages', () => {
  const items = Array.from({ length: 25 }, (_, i) => `item-${i + 1}`);

  // Page 1 (size 10) => items 1..10
  const page1 = paginateItems(items, 1, 10);
  assert.equal(page1.length, 10);
  assert.equal(page1[0], 'item-1');
  assert.equal(page1[9], 'item-10');

  // Page 3 (size 10) => items 21..25
  const page3 = paginateItems(items, 3, 10);
  assert.equal(page3.length, 5);
  assert.equal(page3[0], 'item-21');
  assert.equal(page3[4], 'item-25');

  // Empty input array returns empty
  assert.deepEqual(paginateItems([], 1, 10), []);
});

test('calculatePaginationRange returns clean page buttons with ellipsis', () => {
  // Small page count
  assert.deepEqual(calculatePaginationRange(1, 4), [1, 2, 3, 4]);

  // Page 1 of 10
  assert.deepEqual(calculatePaginationRange(1, 10), [1, 2, 'ellipsis', 10]);

  // Middle page (Page 5 of 10)
  assert.deepEqual(calculatePaginationRange(5, 10), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10]);

  // Near end (Page 9 of 10)
  assert.deepEqual(calculatePaginationRange(9, 10), [1, 'ellipsis', 8, 9, 10]);
});
