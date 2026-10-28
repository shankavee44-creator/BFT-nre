export type DrawingToolId =
  | 'none'
  | 'trendline'
  | 'horizontal-line'
  | 'rectangle'
  | 'gann-box'
  | 'arc'
  | 'curve'
  | 'cross-line'
  | 'parallel-channel'
  | 'ray'
  | 'extended-line'
  | 'triangle'
  | 'horizontal-ray'
  | 'support-resistance'
  | 'vertical-ray'
  | 'fibonacci'
  | 'brush';

export type DrawingLineStyle = 'solid' | 'dashed' | 'dotted';

export interface ChartDrawingObject {
  id: string;
  type: DrawingToolId;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  controlX?: number;
  controlY?: number;
  startCandleIndex?: number;
  startPrice?: number;
  endCandleIndex?: number;
  endPrice?: number;
  controlCandleIndex?: number;
  controlPrice?: number;
  color: string;
  width: number;
  lineStyle?: DrawingLineStyle;
  fillOpacity?: number;
  points?: { x: number; y: number }[];
  createdAt?: number;
}

export interface DrawingToolDefinition {
  id: DrawingToolId;
  label: string;
  shortLabel: string;
  category: 'Lines' | 'Channels & Shapes' | 'Geometry & Curves';
  description: string;
}

export const QUOTEX_DRAWING_TOOLS: DrawingToolDefinition[] = [
  {
    id: 'trendline',
    label: 'Trend Line',
    shortLabel: 'Trend',
    category: 'Lines',
    description: 'Point-to-point diagonal trend line between two price pivots',
  },
  {
    id: 'horizontal-line',
    label: 'Horizontal Line',
    shortLabel: 'H-Line',
    category: 'Lines',
    description: 'Full-width horizontal support or resistance price level',
  },
  {
    id: 'rectangle',
    label: 'Rectangle',
    shortLabel: 'Rect',
    category: 'Channels & Shapes',
    description: 'Shaded consolidation range or supply/demand zone box',
  },
  {
    id: 'gann-box',
    label: 'Gann Box',
    shortLabel: 'Gann',
    category: 'Geometry & Curves',
    description: 'Proportional price-time Gann grid with 0.25, 0.5, 0.75 divisions',
  },
  {
    id: 'arc',
    label: 'ARC',
    shortLabel: 'ARC',
    category: 'Geometry & Curves',
    description: 'Elliptical cycle arc connecting two swing points',
  },
  {
    id: 'curve',
    label: 'Curve',
    shortLabel: 'Curve',
    category: 'Geometry & Curves',
    description: 'Parabolic quadratic curve for accelerating trend structures',
  },
  {
    id: 'cross-line',
    label: 'Cross Line',
    shortLabel: 'Cross',
    category: 'Lines',
    description: 'Intersecting horizontal price and vertical time coordinate lines',
  },
  {
    id: 'parallel-channel',
    label: 'Parallel Channel',
    shortLabel: 'Channel',
    category: 'Channels & Shapes',
    description: 'Equidistant parallel trend channel with midline projection',
  },
  {
    id: 'ray',
    label: 'Ray',
    shortLabel: 'Ray',
    category: 'Lines',
    description: 'Directional vector line projecting forward from origin through target',
  },
  {
    id: 'extended-line',
    label: 'Extended Line',
    shortLabel: 'Extended',
    category: 'Lines',
    description: 'Infinite bi-directional line extending across the entire chart',
  },
  {
    id: 'triangle',
    label: 'Triangle',
    shortLabel: 'Triangle',
    category: 'Channels & Shapes',
    description: 'Three-point geometric wedge or chart triangle formation',
  },
];

export const DRAWING_COLOR_PALETTE = [
  '#ff8800',
  '#00e676',
  '#00e5ff',
  '#ff334b',
  '#a855f7',
  '#eab308',
  '#ffffff',
];

/**
 * Creates a new drawing object when the user starts drawing on the canvas.
 */
export function createInitialDrawing(
  tool: DrawingToolId,
  x: number,
  y: number,
  color: string = '#ff8800',
  width: number = 2,
  lineStyle: DrawingLineStyle = 'solid'
): ChartDrawingObject {
  const defaultOffsetX = 95;
  const defaultOffsetY = -55;

  // For single-click placement or initial drag anchor, provide sensible initial geometry
  const isSingleClickLine = tool === 'horizontal-line' || tool === 'cross-line' || tool === 'horizontal-ray' || tool === 'support-resistance' || tool === 'vertical-ray';
  const endX = isSingleClickLine ? x + 120 : x + 2;
  const endY = isSingleClickLine ? y : y + 2;

  return {
    id: `DRW-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    type: tool,
    startX: x,
    startY: y,
    endX,
    endY,
    controlX: x + defaultOffsetX * 0.5,
    controlY: y + defaultOffsetY,
    color,
    width,
    lineStyle,
    fillOpacity: 0.14,
    points: tool === 'brush' ? [{ x, y }] : undefined,
    createdAt: Date.now(),
  };
}

/**
 * Updates a drawing while the user drags the cursor across the canvas.
 */
export function updateDrawingOnDrag(
  drawing: ChartDrawingObject,
  x: number,
  y: number
): ChartDrawingObject {
  if (drawing.type === 'brush') {
    return {
      ...drawing,
      endX: x,
      endY: y,
      points: [...(drawing.points || []), { x, y }],
    };
  }

  const midX = (drawing.startX + x) / 2;
  const midY = (drawing.startY + y) / 2;
  const dx = x - drawing.startX;
  const dy = y - drawing.startY;
  const dist = Math.hypot(dx, dy);

  // Compute perpendicular offset for curve, arc, triangle, and parallel channel
  const perpX = dist > 1 ? (-dy / dist) * Math.min(55, Math.max(24, dist * 0.32)) : 0;
  const perpY = dist > 1 ? (dx / dist) * Math.min(55, Math.max(24, dist * 0.32)) : -35;

  return {
    ...drawing,
    endX: x,
    endY: y,
    controlX: midX + perpX,
    controlY: midY + perpY,
  };
}

/**
 * Ensures a finished drawing has non-zero visual span even if the user clicked once without dragging far.
 */
export function finalizeDrawingObject(drawing: ChartDrawingObject): ChartDrawingObject {
  const dx = drawing.endX - drawing.startX;
  const dy = drawing.endY - drawing.startY;
  const dist = Math.hypot(dx, dy);

  if (
    dist < 8 &&
    drawing.type !== 'horizontal-line' &&
    drawing.type !== 'cross-line' &&
    drawing.type !== 'horizontal-ray' &&
    drawing.type !== 'support-resistance' &&
    drawing.type !== 'vertical-ray' &&
    drawing.type !== 'brush'
  ) {
    const fallbackEndX = drawing.startX + 110;
    const fallbackEndY = drawing.startY - 45;
    return updateDrawingOnDrag(drawing, fallbackEndX, fallbackEndY);
  }
  return drawing;
}

/**
 * Moves/translates an entire drawing by (dx, dy) pixels on the canvas.
 */
export function translateDrawing(
  drawing: ChartDrawingObject,
  dx: number,
  dy: number
): ChartDrawingObject {
  return {
    ...drawing,
    startX: drawing.startX + dx,
    startY: drawing.startY + dy,
    endX: drawing.endX + dx,
    endY: drawing.endY + dy,
    controlX: drawing.controlX !== undefined ? drawing.controlX + dx : undefined,
    controlY: drawing.controlY !== undefined ? drawing.controlY + dy : undefined,
    points: drawing.points
      ? drawing.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }))
      : undefined,
  };
}

/**
 * Updates a specific anchor handle ('start' | 'end' | 'control') when resizing a selected drawing.
 */
export function updateDrawingHandle(
  drawing: ChartDrawingObject,
  handle: 'start' | 'end' | 'control',
  x: number,
  y: number
): ChartDrawingObject {
  if (handle === 'start') {
    return { ...drawing, startX: x, startY: y };
  }
  if (handle === 'end') {
    return { ...drawing, endX: x, endY: y };
  }
  return { ...drawing, controlX: x, controlY: y };
}

/**
 * Shortest distance from point (px, py) to segment (x1, y1)-(x2, y2).
 */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Detects if a cursor coordinate hits one of a selected drawing's resize handles.
 */
export function findHitDrawingHandle(
  x: number,
  y: number,
  drawing: ChartDrawingObject,
  hitRadius: number = 10
): 'start' | 'end' | 'control' | null {
  if (Math.hypot(x - drawing.startX, y - drawing.startY) <= hitRadius) {
    return 'start';
  }
  if (Math.hypot(x - drawing.endX, y - drawing.endY) <= hitRadius) {
    return 'end';
  }
  if (
    drawing.controlX !== undefined &&
    drawing.controlY !== undefined &&
    (drawing.type === 'curve' ||
      drawing.type === 'arc' ||
      drawing.type === 'triangle' ||
      drawing.type === 'parallel-channel') &&
    Math.hypot(x - drawing.controlX, y - drawing.controlY) <= hitRadius
  ) {
    return 'control';
  }
  return null;
}

/**
 * Hit-tests a list of drawings (in reverse order so top-most drawing wins) against (x, y).
 */
export function findHitDrawing(
  x: number,
  y: number,
  drawings: ChartDrawingObject[],
  canvasWidth: number,
  canvasHeight: number,
  tolerance: number = 9
): ChartDrawingObject | null {
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    // Always check endpoints first
    if (Math.hypot(x - d.startX, y - d.startY) <= tolerance + 3) return d;
    if (Math.hypot(x - d.endX, y - d.endY) <= tolerance + 3) return d;
    if (
      d.controlX !== undefined &&
      d.controlY !== undefined &&
      Math.hypot(x - d.controlX, y - d.controlY) <= tolerance + 3
    ) {
      return d;
    }

    switch (d.type) {
      case 'horizontal-line':
      case 'horizontal-ray':
      case 'support-resistance': {
        if (Math.abs(y - d.startY) <= tolerance) return d;
        break;
      }
      case 'vertical-ray': {
        if (Math.abs(x - d.startX) <= tolerance) return d;
        break;
      }
      case 'cross-line': {
        if (Math.abs(y - d.startY) <= tolerance || Math.abs(x - d.startX) <= tolerance) {
          return d;
        }
        break;
      }
      case 'trendline': {
        if (distanceToSegment(x, y, d.startX, d.startY, d.endX, d.endY) <= tolerance) {
          return d;
        }
        break;
      }
      case 'ray': {
        const dx = d.endX - d.startX;
        const dy = d.endY - d.startY;
        const len = Math.hypot(dx, dy) || 1;
        const extX = d.startX + (dx / len) * canvasWidth * 1.5;
        const extY = d.startY + (dy / len) * canvasWidth * 1.5;
        if (distanceToSegment(x, y, d.startX, d.startY, extX, extY) <= tolerance) {
          return d;
        }
        break;
      }
      case 'extended-line': {
        const dx = d.endX - d.startX;
        const dy = d.endY - d.startY;
        const len = Math.hypot(dx, dy) || 1;
        const p1X = d.startX - (dx / len) * canvasWidth * 1.5;
        const p1Y = d.startY - (dy / len) * canvasWidth * 1.5;
        const p2X = d.startX + (dx / len) * canvasWidth * 1.5;
        const p2Y = d.startY + (dy / len) * canvasWidth * 1.5;
        if (distanceToSegment(x, y, p1X, p1Y, p2X, p2Y) <= tolerance) {
          return d;
        }
        break;
      }
      case 'rectangle':
      case 'gann-box':
      case 'fibonacci': {
        const minX = Math.min(d.startX, d.endX);
        const maxX = Math.max(d.startX, d.endX);
        const minY = Math.min(d.startY, d.endY);
        const maxY = Math.max(d.startY, d.endY);
        if (
          x >= minX - tolerance &&
          x <= maxX + tolerance &&
          y >= minY - tolerance &&
          y <= maxY + tolerance
        ) {
          return d;
        }
        break;
      }
      case 'parallel-channel': {
        const ctrlX = d.controlX ?? d.startX;
        const ctrlY = d.controlY ?? d.startY - 35;
        const offsetX = ctrlX - (d.startX + d.endX) / 2;
        const offsetY = ctrlY - (d.startY + d.endY) / 2;
        const d1 = distanceToSegment(x, y, d.startX, d.startY, d.endX, d.endY);
        const d2 = distanceToSegment(
          x,
          y,
          d.startX + offsetX,
          d.startY + offsetY,
          d.endX + offsetX,
          d.endY + offsetY
        );
        const dMid = distanceToSegment(
          x,
          y,
          d.startX + offsetX * 0.5,
          d.startY + offsetY * 0.5,
          d.endX + offsetX * 0.5,
          d.endY + offsetY * 0.5
        );
        if (Math.min(d1, d2, dMid) <= tolerance + 4) return d;
        break;
      }
      case 'triangle': {
        const cX = d.controlX ?? (d.startX + d.endX) / 2;
        const cY = d.controlY ?? Math.min(d.startY, d.endY) - 45;
        const e1 = distanceToSegment(x, y, d.startX, d.startY, d.endX, d.endY);
        const e2 = distanceToSegment(x, y, d.endX, d.endY, cX, cY);
        const e3 = distanceToSegment(x, y, cX, cY, d.startX, d.startY);
        if (Math.min(e1, e2, e3) <= tolerance + 4) return d;
        break;
      }
      case 'arc':
      case 'curve': {
        const cX = d.controlX ?? (d.startX + d.endX) / 2;
        const cY = d.controlY ?? Math.min(d.startY, d.endY) - 40;
        const dBase = distanceToSegment(x, y, d.startX, d.startY, d.endX, d.endY);
        const dLeg1 = distanceToSegment(x, y, d.startX, d.startY, cX, cY);
        const dLeg2 = distanceToSegment(x, y, cX, cY, d.endX, d.endY);
        if (Math.min(dBase, dLeg1, dLeg2) <= tolerance + 8) return d;
        break;
      }
      case 'brush': {
        if (d.points && d.points.length > 0) {
          for (let j = 0; j < d.points.length; j++) {
            if (Math.hypot(x - d.points[j].x, y - d.points[j].y) <= tolerance + 2) {
              return d;
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return null;
}

/**
 * Renders any ChartDrawingObject onto a 2D Canvas context with optional selection handles.
 */
export function renderDrawingOnCanvas(
  ctx: CanvasRenderingContext2D,
  d: ChartDrawingObject,
  width: number,
  height: number,
  chartHeight: number,
  minPrice: number,
  maxPrice: number,
  pipDecimals: number,
  isSelected: boolean
): void {
  ctx.save();
  ctx.strokeStyle = d.color || '#ff8800';
  ctx.lineWidth = d.width || 2;

  if (d.lineStyle === 'dashed') {
    ctx.setLineDash([6, 4]);
  } else if (d.lineStyle === 'dotted') {
    ctx.setLineDash([2, 3]);
  } else {
    ctx.setLineDash([]);
  }

  switch (d.type) {
    case 'trendline': {
      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.lineTo(d.endX, d.endY);
      ctx.stroke();
      break;
    }

    case 'horizontal-line':
    case 'horizontal-ray': {
      ctx.beginPath();
      ctx.moveTo(0, d.startY);
      ctx.lineTo(width - 65, d.startY);
      ctx.stroke();

      // Right-axis price tag for Horizontal Line
      const linePrice =
        maxPrice - ((d.startY - 10) / Math.max(1, chartHeight)) * (maxPrice - minPrice);
      ctx.setLineDash([]);
      ctx.fillStyle = '#141722';
      ctx.fillRect(width - 65, d.startY - 9, 64, 18);
      ctx.strokeStyle = d.color || '#ff8800';
      ctx.lineWidth = 1;
      ctx.strokeRect(width - 65, d.startY - 9, 64, 18);
      ctx.fillStyle = d.color || '#ff8800';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(linePrice.toFixed(pipDecimals), width - 33, d.startY + 3);
      break;
    }

    case 'rectangle': {
      const rx = Math.min(d.startX, d.endX);
      const ry = Math.min(d.startY, d.endY);
      const rw = Math.abs(d.endX - d.startX);
      const rh = Math.abs(d.endY - d.startY);
      ctx.save();
      ctx.fillStyle = d.color || '#ff8800';
      ctx.globalAlpha = d.fillOpacity ?? 0.14;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.restore();
      ctx.strokeRect(rx, ry, rw, rh);
      break;
    }

    case 'gann-box': {
      const gx = Math.min(d.startX, d.endX);
      const gy = Math.min(d.startY, d.endY);
      const gw = Math.abs(d.endX - d.startX);
      const gh = Math.abs(d.endY - d.startY);

      ctx.save();
      ctx.fillStyle = d.color || '#ff8800';
      ctx.globalAlpha = 0.08;
      ctx.fillRect(gx, gy, gw, gh);
      ctx.restore();

      ctx.strokeRect(gx, gy, gw, gh);

      // Internal Gann Box divisions (0.25, 0.382, 0.5, 0.618, 0.75) + diagonals
      const levels = [0.25, 0.5, 0.75];
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      levels.forEach((lvl) => {
        const yPos = gy + gh * lvl;
        const xPos = gx + gw * lvl;
        ctx.beginPath();
        ctx.moveTo(gx, yPos);
        ctx.lineTo(gx + gw, yPos);
        ctx.moveTo(xPos, gy);
        ctx.lineTo(xPos, gy + gh);
        ctx.stroke();

        ctx.fillStyle = d.color || '#ff8800';
        ctx.font = '8.5px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${lvl}`, gx + 4, yPos - 2);
      });

      // Gann 1x1 diagonals
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(gx, gy + gh);
      ctx.lineTo(gx + gw, gy);
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + gw, gy + gh);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'arc': {
      const cX = d.controlX ?? (d.startX + d.endX) / 2;
      const cY = d.controlY ?? Math.min(d.startY, d.endY) - 45;

      // Filled semi-transparent arc sector
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.quadraticCurveTo(cX, cY, d.endX, d.endY);
      ctx.closePath();
      ctx.fillStyle = d.color || '#ff8800';
      ctx.globalAlpha = 0.12;
      ctx.fill();
      ctx.restore();

      // Arc baseline & curve
      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.quadraticCurveTo(cX, cY, d.endX, d.endY);
      ctx.stroke();

      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.lineTo(d.endX, d.endY);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'curve': {
      const cX = d.controlX ?? (d.startX + d.endX) / 2;
      const cY = d.controlY ?? Math.min(d.startY, d.endY) - 45;
      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.quadraticCurveTo(cX, cY, d.endX, d.endY);
      ctx.stroke();
      break;
    }

    case 'cross-line': {
      ctx.beginPath();
      ctx.moveTo(0, d.startY);
      ctx.lineTo(width - 65, d.startY);
      ctx.moveTo(d.startX, 10);
      ctx.lineTo(d.startX, chartHeight + 10);
      ctx.stroke();

      const crossPrice =
        maxPrice - ((d.startY - 10) / Math.max(1, chartHeight)) * (maxPrice - minPrice);
      ctx.setLineDash([]);
      ctx.fillStyle = '#141722';
      ctx.fillRect(width - 65, d.startY - 9, 64, 18);
      ctx.strokeStyle = d.color || '#ff8800';
      ctx.lineWidth = 1;
      ctx.strokeRect(width - 65, d.startY - 9, 64, 18);
      ctx.fillStyle = d.color || '#ff8800';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(crossPrice.toFixed(pipDecimals), width - 33, d.startY + 3);
      break;
    }

    case 'parallel-channel': {
      const ctrlX = d.controlX ?? (d.startX + d.endX) / 2;
      const ctrlY = d.controlY ?? (d.startY + d.endY) / 2 - 42;
      const offsetX = ctrlX - (d.startX + d.endX) / 2;
      const offsetY = ctrlY - (d.startY + d.endY) / 2;

      const p2StartX = d.startX + offsetX;
      const p2StartY = d.startY + offsetY;
      const p2EndX = d.endX + offsetX;
      const p2EndY = d.endY + offsetY;

      // Shaded channel interior
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.lineTo(d.endX, d.endY);
      ctx.lineTo(p2EndX, p2EndY);
      ctx.lineTo(p2StartX, p2StartY);
      ctx.closePath();
      ctx.fillStyle = d.color || '#ff8800';
      ctx.globalAlpha = 0.12;
      ctx.fill();
      ctx.restore();

      // Main & parallel border lines
      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.lineTo(d.endX, d.endY);
      ctx.moveTo(p2StartX, p2StartY);
      ctx.lineTo(p2EndX, p2EndY);
      ctx.stroke();

      // Dashed median channel line
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(d.startX + offsetX * 0.5, d.startY + offsetY * 0.5);
      ctx.lineTo(d.endX + offsetX * 0.5, d.endY + offsetY * 0.5);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'ray': {
      const dx = d.endX - d.startX;
      const dy = d.endY - d.startY;
      const len = Math.hypot(dx, dy) || 1;
      const extX = d.startX + (dx / len) * width * 1.6;
      const extY = d.startY + (dy / len) * width * 1.6;
      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.lineTo(extX, extY);
      ctx.stroke();
      break;
    }

    case 'extended-line': {
      const dx = d.endX - d.startX;
      const dy = d.endY - d.startY;
      const len = Math.hypot(dx, dy) || 1;
      const p1X = d.startX - (dx / len) * width * 1.6;
      const p1Y = d.startY - (dy / len) * width * 1.6;
      const p2X = d.startX + (dx / len) * width * 1.6;
      const p2Y = d.startY + (dy / len) * width * 1.6;
      ctx.beginPath();
      ctx.moveTo(p1X, p1Y);
      ctx.lineTo(p2X, p2Y);
      ctx.stroke();
      break;
    }

    case 'triangle': {
      const cX = d.controlX ?? (d.startX + d.endX) / 2;
      const cY = d.controlY ?? Math.min(d.startY, d.endY) - 48;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.lineTo(d.endX, d.endY);
      ctx.lineTo(cX, cY);
      ctx.closePath();
      ctx.fillStyle = d.color || '#ff8800';
      ctx.globalAlpha = 0.14;
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(d.startX, d.startY);
      ctx.lineTo(d.endX, d.endY);
      ctx.lineTo(cX, cY);
      ctx.closePath();
      ctx.stroke();
      break;
    }

    case 'support-resistance': {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 136, 0, 0.12)';
      ctx.fillRect(0, d.startY - 5, width - 65, 10);
      ctx.strokeStyle = d.color || '#ff8800';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(0, d.startY);
      ctx.lineTo(width - 65, d.startY);
      ctx.stroke();
      ctx.setLineDash([]);

      const srPrice =
        maxPrice - ((d.startY - 10) / Math.max(1, chartHeight)) * (maxPrice - minPrice);
      ctx.fillStyle = '#131722';
      ctx.fillRect(12, d.startY - 17, 132, 15);
      ctx.strokeStyle = d.color || '#ff8800';
      ctx.lineWidth = 1;
      ctx.strokeRect(12, d.startY - 17, 132, 15);
      ctx.fillStyle = d.color || '#ff8800';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`S/R LEVEL • ${srPrice.toFixed(pipDecimals)}`, 16, d.startY - 6);
      ctx.restore();
      break;
    }

    case 'vertical-ray': {
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(d.startX, 0);
      ctx.lineTo(d.startX, height);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    }

    case 'fibonacci': {
      const topY = Math.min(d.startY, d.endY);
      const bottomY = Math.max(d.startY, d.endY);
      const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
      fibLevels.forEach((lvl) => {
        const y = bottomY - (bottomY - topY) * lvl;
        ctx.strokeStyle = lvl === 0.618 ? '#ff8800' : d.color;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width - 65, y);
        ctx.stroke();

        ctx.fillStyle = lvl === 0.618 ? '#ff8800' : d.color;
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Fib ${(lvl * 100).toFixed(1)}%`, 15, y - 3);
      });
      ctx.setLineDash([]);
      break;
    }

    case 'brush': {
      if (d.points && d.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(d.points[0].x, d.points[0].y);
        for (let i = 1; i < d.points.length; i++) {
          ctx.lineTo(d.points[i].x, d.points[i].y);
        }
        ctx.stroke();
      }
      break;
    }

    default:
      break;
  }

  // Render crisp institutional anchor handles when drawing is selected or active
  ctx.setLineDash([]);
  const drawAnchor = (ax: number, ay: number) => {
    ctx.beginPath();
    ctx.arc(ax, ay, isSelected ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? '#0a0a0a' : d.color || '#ff8800';
    ctx.fill();
    ctx.lineWidth = isSelected ? 2 : 1.5;
    ctx.strokeStyle = isSelected ? '#ffffff' : '#0a0a0a';
    ctx.stroke();
  };

  if (d.type !== 'brush') {
    drawAnchor(d.startX, d.startY);
    if (
      d.type !== 'horizontal-line' &&
      d.type !== 'cross-line' &&
      d.type !== 'horizontal-ray' &&
      d.type !== 'support-resistance' &&
      d.type !== 'vertical-ray'
    ) {
      drawAnchor(d.endX, d.endY);
    }
    if (
      isSelected &&
      d.controlX !== undefined &&
      d.controlY !== undefined &&
      (d.type === 'curve' ||
        d.type === 'arc' ||
        d.type === 'triangle' ||
        d.type === 'parallel-channel')
    ) {
      drawAnchor(d.controlX, d.controlY);
    }
  }

  ctx.restore();
}
