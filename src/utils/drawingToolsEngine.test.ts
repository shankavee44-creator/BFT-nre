import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUOTEX_DRAWING_TOOLS,
  createInitialDrawing,
  updateDrawingOnDrag,
  finalizeDrawingObject,
  translateDrawing,
  updateDrawingHandle,
  findHitDrawing,
  findHitDrawingHandle,
} from './drawingToolsEngine';

test('QUOTEX_DRAWING_TOOLS contains all 11 required technical analysis drawing tools in order', () => {
  const labels = QUOTEX_DRAWING_TOOLS.map((t) => t.label);
  assert.deepEqual(labels, [
    'Trend Line',
    'Horizontal Line',
    'Rectangle',
    'Gann Box',
    'ARC',
    'Curve',
    'Cross Line',
    'Parallel Channel',
    'Ray',
    'Extended Line',
    'Triangle',
  ]);
});

test('createInitialDrawing, updateDrawingOnDrag, and finalizeDrawingObject produce valid geometry', () => {
  const d0 = createInitialDrawing('trendline', 120, 220, '#ff8800', 2);
  assert.equal(d0.type, 'trendline');
  assert.equal(d0.startX, 120);
  assert.equal(d0.startY, 220);

  // Single click without drag gets finalized to visible default span
  const finalized = finalizeDrawingObject(d0);
  assert.ok(Math.hypot(finalized.endX - finalized.startX, finalized.endY - finalized.startY) >= 50);

  // Dragging updates endX, endY, and control points
  const dragged = updateDrawingOnDrag(d0, 260, 140);
  assert.equal(dragged.endX, 260);
  assert.equal(dragged.endY, 140);
  assert.ok(typeof dragged.controlX === 'number');
  assert.ok(typeof dragged.controlY === 'number');
});

test('findHitDrawing detects clicks on Trend Line, Horizontal Line, Rectangle, Gann Box, Cross Line, and Triangle', () => {
  const trend = updateDrawingOnDrag(createInitialDrawing('trendline', 100, 100), 200, 200);
  const hline = createInitialDrawing('horizontal-line', 150, 320);
  const rect = updateDrawingOnDrag(createInitialDrawing('rectangle', 300, 120), 420, 210);
  const cross = createInitialDrawing('cross-line', 510, 260);

  const drawings = [trend, hline, rect, cross];

  // Hit midpoint of diagonal trend line
  const hitTrend = findHitDrawing(150, 150, drawings, 900, 500);
  assert.equal(hitTrend?.id, trend.id);

  // Hit anywhere along horizontal line Y=320
  const hitHline = findHitDrawing(40, 321, drawings, 900, 500);
  assert.equal(hitHline?.id, hline.id);

  // Hit inside rectangle
  const hitRect = findHitDrawing(350, 165, drawings, 900, 500);
  assert.equal(hitRect?.id, rect.id);

  // Hit vertical axis of cross line X=510
  const hitCross = findHitDrawing(510, 90, drawings, 900, 500);
  assert.equal(hitCross?.id, cross.id);

  // Miss empty space
  const miss = findHitDrawing(25, 25, drawings, 900, 500);
  assert.equal(miss, null);
});

test('translateDrawing and updateDrawingHandle move and resize drawn objects accurately', () => {
  const channel = updateDrawingOnDrag(createInitialDrawing('parallel-channel', 100, 200), 240, 160);
  const moved = translateDrawing(channel, 30, -20);

  assert.equal(moved.startX, 130);
  assert.equal(moved.startY, 180);
  assert.equal(moved.endX, 270);
  assert.equal(moved.endY, 140);

  const handle = findHitDrawingHandle(130, 180, moved, 10);
  assert.equal(handle, 'start');

  const resized = updateDrawingHandle(moved, 'end', 310, 120);
  assert.equal(resized.endX, 310);
  assert.equal(resized.endY, 120);
});
