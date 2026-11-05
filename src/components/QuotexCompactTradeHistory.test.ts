import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDurationToClock,
  formatDateGroupTitle,
} from './QuotexCompactTradeHistory';

describe('QuotexCompactTradeHistory helpers', () => {
  it('formats duration seconds to clock format (00:00:05 style)', () => {
    assert.equal(formatDurationToClock(5), '00:00:05');
    assert.equal(formatDurationToClock(60), '00:01:00');
    assert.equal(formatDurationToClock(300), '00:05:00');
    assert.equal(formatDurationToClock(3600), '01:00:00');
    assert.equal(formatDurationToClock(0), '00:00:00');
  });

  it('formats date group headers into uppercase Quotex style', () => {
    const fixedTime = new Date('2026-11-05T12:00:00Z').getTime();
    const formatted = formatDateGroupTitle(fixedTime);
    assert.match(formatted, /5 NOVEMBER \d{2}/);
  });
});
