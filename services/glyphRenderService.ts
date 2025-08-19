
import { Point, Path, AttachmentPoint, MarkAttachmentRules, Character, FontMetrics } from '../types';
import { VEC } from '../utils/vectorUtils';

export interface RenderOptions {
    strokeThickness: number;
    color: string;
    lineDash?: number[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts a single quadratic Bézier curve into a polyline.
 * @param points An array of 3 points: [start, control, end].
 * @param density The number of line segments to use for approximation.
 * @returns An array of Points representing the flattened curve.
 */
export const quadraticCurveToPolyline = (points: Point[], density = 10): Point[] => {
    if (points.length !== 3) return points;
    const [p0, p1, p2] = points;
    const polyline: Point[] = [p0];
    const quadraticPoint = (t: number, p0: Point, p1: Point, p2: Point) => {
        const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
        const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
        return { x, y };
    };
    for (let j = 1; j <= density; j++) {
        polyline.push(quadraticPoint(j / density, p0, p1, p2));
    }
    return polyline;
};

/**
 * Converts a curve represented by control points into a polyline (an array of points).
 * @param points The control points of the curve.
 * @param density The number of line segments to use for each Bézier curve segment.
 * @returns An array of Points representing the flattened curve.
 */
export const curveToPolyline = (points: Point[], density = 15): Point[] => {
    if (points.length < 3) return points;
    const polyline: Point[] = [points[0]];
    const quadraticPoint = (t: number, p0: Point, p1: Point, p2: Point) => {
        const x = Math.pow(1 - t, 2) * p0.x + 2 * (1 - t) * t * p1.x + Math.pow(t, 2) * p2.x;
        const y = Math.pow(1 - t, 2) * p0.y + 2 * (1 - t) * t * p1.y + Math.pow(t, 2) * p2.y;
        return { x, y };
    };
    let p0 = points[0];
    for (let i = 1; i < points.length - 2; i++) {
        const p1 = points[i];
        const p2 = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
        for (let j = 1; j <= density; j++) {
            polyline.push(quadraticPoint(j / density, p0, p1, p2));
        }
        p0 = p2;
    }
    const lastIndex = points.length - 1;
    const p1 = points[lastIndex - 1];
    const p2 = points[lastIndex];
    for (let j = 1; j <= density; j++) {
        polyline.push(quadraticPoint(j / density, p0, p1, p2));
    }
    return polyline;
}

/**
 * Calculates a simple bounding box of the raw points of a set of paths.
 * @param paths The array of Path objects to measure.
 * @returns A BoundingBox object or null if there are no points.
 */
export const getGlyphBBoxOfPoints = (paths: Path[]): BoundingBox | null => {
    if (paths.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasPoints = false;
    paths.forEach(path => { 
      if (path.points.length > 0) hasPoints = true;
      path.points.forEach(point => {
        minX = Math.min(minX, point.x); minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y);
    });});
    return !hasPoints ? null : { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};


/**
 * Calculates a precise bounding box for a set of paths by flattening curves and accounting for stroke thickness.
 * @param paths The array of Path objects to measure.
 * @param strokeThickness The thickness of the strokes.
 * @returns A BoundingBox object or null if there are no points.
 */
export const getAccurateGlyphBBox = (paths: Path[], strokeThickness: number): BoundingBox | null => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let hasPoints = false;

    paths.forEach(path => {
        if (path.points.length === 0) return;
        hasPoints = true;

        if (path.type === 'dot') {
            const center = path.points[0];
            const radius = path.points.length > 1 ? VEC.len(VEC.sub(path.points[1], center)) : strokeThickness / 2;
            minX = Math.min(minX, center.x - radius);
            maxX = Math.max(maxX, center.x + radius);
            minY = Math.min(minY, center.y - radius);
            maxY = Math.max(maxY, center.y + radius);
        } else {
            let pointsToTest: Point[];
            if ((path.type === 'pen' || path.type === 'calligraphy') && path.points.length > 2) {
                pointsToTest = curveToPolyline(path.points);
            } else if (path.type === 'curve' && path.points.length === 3) {
                pointsToTest = quadraticCurveToPolyline(path.points);
            } else {
                pointsToTest = path.points;
            }

            if (pointsToTest.length === 0) return;

            let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
            pointsToTest.forEach(point => {
                pMinX = Math.min(pMinX, point.x);
                pMaxX = Math.max(pMaxX, point.x);
                pMinY = Math.min(pMinY, point.y);
                pMaxY = Math.max(pMaxY, point.y);
            });

            const halfStroke = strokeThickness / 2;
            minX = Math.min(minX, pMinX - halfStroke);
            maxX = Math.max(maxX, pMaxX + halfStroke);
            minY = Math.min(minY, pMinY - halfStroke);
            maxY = Math.max(maxY, pMaxY + halfStroke);
        }
    });

    if (!hasPoints) return null;
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export const getAttachmentPointCoords = (bbox: BoundingBox, pointName: AttachmentPoint): Point => {
    const { x, y, width, height } = bbox;
    switch (pointName) {
        case 'topLeft': return { x, y };
        case 'topCenter': return { x: x + width / 2, y };
        case 'topRight': return { x: x + width, y };
        case 'midLeft': return { x, y: y + height / 2 };
        case 'midRight': return { x: x + width, y: y + height / 2 };
        case 'bottomLeft': return { x, y: y + height };
        case 'bottomCenter': return { x: x + width / 2, y: y + height };
        case 'bottomRight': return { x: x + width, y: y + height };
        default: return { x, y }; // Fallback
    }
};

export const calculateDefaultMarkOffset = (
    baseChar: Character,
    markChar: Character,
    baseBbox: BoundingBox | null,
    markBbox: BoundingBox | null,
    markAttachmentRules: MarkAttachmentRules | null,
    metrics: FontMetrics
): Point => {
    // Priority 1: Check for a specific attachment rule
    if (markAttachmentRules && baseBbox && markBbox) {
        const rule = markAttachmentRules[baseChar.name]?.[markChar.name];
        if (rule) {
            const [baseAttachName, markAttachName, xOffsetStr, yOffsetStr] = rule;
            let baseAttachPoint = getAttachmentPointCoords(baseBbox, baseAttachName as AttachmentPoint);
            
            if (xOffsetStr !== undefined && yOffsetStr !== undefined) {
                const xOffset = parseFloat(xOffsetStr) || 0;
                const yOffset = parseFloat(yOffsetStr) || 0;
                baseAttachPoint = {
                    x: baseAttachPoint.x + xOffset,
                    y: baseAttachPoint.y + yOffset,
                };
            }

            const markAttachPoint = getAttachmentPointCoords(markBbox, markAttachName as AttachmentPoint);
            return VEC.sub(baseAttachPoint, markAttachPoint);
        }
    }

    // Priority 2: Fallback to side-by-side positioning based on bearings
    if (baseBbox && markBbox) {
        const baseRsb = baseChar.rsb ?? metrics.defaultRSB;
        const markLsb = markChar.lsb ?? metrics.defaultLSB;

        // The target x position for the mark's content is the base's right edge plus bearings.
        const targetX = baseBbox.x + baseBbox.width + baseRsb;
        
        // The offset is the difference between where the mark's left edge should be and where it currently is,
        // also accounting for the mark's own LSB.
        const dx = (targetX + markLsb) - markBbox.x;

        // No vertical change, maintain baseline alignment (assuming both are drawn relative to it)
        const dy = 0;

        return { x: dx, y: dy };
    }

    // Default fallback if no bboxes
    return { x: 0, y: 0 };
};

/**
 * Renders a set of paths onto a canvas context.
 * @param ctx The 2D rendering context of the canvas.
 * @param paths The array of Path objects to draw.
 * @param options Rendering options like stroke thickness and color.
 */
export const renderPaths = (ctx: CanvasRenderingContext2D, paths: Path[], options: RenderOptions) => {
  ctx.strokeStyle = options.color;
  ctx.fillStyle = options.color;
  ctx.lineWidth = options.strokeThickness;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(options.lineDash || []);

  paths.forEach(path => {
    const stroke = path.points;
    if (stroke.length === 0) return;

    if (path.type === 'dot') {
      const center = stroke[0];
      const radius = stroke.length > 1 ? VEC.len(VEC.sub(stroke[1], center)) : options.strokeThickness / 2;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
      ctx.fill();
      return;
    }

    if (path.type === 'calligraphy') {
      const polyline = curveToPolyline(stroke, 15);
      if (polyline.length < 2) return;
      const angleRad = (path.angle || 45) * Math.PI / 180;
      const perpToNib = { x: -Math.sin(angleRad), y: Math.cos(angleRad) };
      const outline1: Point[] = [];
      const outline2: Point[] = [];

      for (let i = 0; i < polyline.length; i++) {
        const p_curr = polyline[i];
        const p_prev = polyline[i - 1];
        const p_next = polyline[i + 1];
        let normal: Point;
        let dir: Point;

        if (!p_prev) {
          dir = VEC.normalize(VEC.sub(p_next, p_curr));
          normal = VEC.perp(dir);
        } else if (!p_next) {
          dir = VEC.normalize(VEC.sub(p_curr, p_prev));
          normal = VEC.perp(dir);
        } else {
          const dir1 = VEC.normalize(VEC.sub(p_curr, p_prev));
          const n1 = VEC.perp(dir1);
          const dir2 = VEC.normalize(VEC.sub(p_next, p_curr));
          const n2 = VEC.perp(dir2);
          dir = VEC.normalize(VEC.add(dir1, dir2));
          let miterVec = VEC.normalize(VEC.add(n1, n2));
          const dotProduct = VEC.dot(miterVec, n1);
          if (Math.abs(dotProduct) < 1e-6) {
            normal = n1;
          } else {
            let miterLen = 1 / dotProduct;
            if (miterLen > 5) { miterLen = 5; } // Miter limit
            normal = VEC.scale(miterVec, miterLen);
          }
        }
        const thicknessAtPoint = options.strokeThickness * Math.abs(VEC.dot(dir, perpToNib));
        outline1.push(VEC.add(p_curr, VEC.scale(normal, thicknessAtPoint / 2)));
        outline2.push(VEC.add(p_curr, VEC.scale(normal, -thicknessAtPoint / 2)));
      }

      if (outline1.length > 0) {
        ctx.beginPath();
        ctx.moveTo(outline1[0].x, outline1[0].y);
        for (let i = 1; i < outline1.length; i++) ctx.lineTo(outline1[i].x, outline1[i].y);
        ctx.lineTo(outline2[outline2.length - 1].x, outline2[outline2.length - 1].y);
        for (let i = outline2.length - 2; i >= 0; i--) ctx.lineTo(outline2[i].x, outline2[i].y);
        ctx.closePath();
        ctx.fill();
      }
      return;
    }

    if (stroke.length < 2) return;
    ctx.beginPath();
    if (path.type === 'curve' && stroke.length === 3) {
      ctx.moveTo(stroke[0].x, stroke[0].y);
      ctx.quadraticCurveTo(stroke[1].x, stroke[1].y, stroke[2].x, stroke[2].y);
    } else if (path.type === 'pen' && stroke.length > 2) {
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length - 2; i++) {
        const xc = (stroke[i].x + stroke[i + 1].x) / 2;
        const yc = (stroke[i].y + stroke[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, xc, yc);
      }
      ctx.quadraticCurveTo(stroke[stroke.length - 2].x, stroke[stroke.length - 2].y, stroke[stroke.length - 1].x, stroke[stroke.length - 1].y);
    } else {
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
    }
    ctx.stroke();
  });
};
