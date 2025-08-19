
import { Character, GlyphData, FontMetrics } from '../types';
import { getGlyphBBoxOfPoints } from './glyphRenderService';

interface BBox {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

// Simplified version based on point bucketing. It's an approximation but avoids full rasterization.
const getGlyphSubBBoxes = (
    glyphData: GlyphData,
    baselineY: number,
    strokeThickness: number
): { above: BBox | null; below: BBox | null; full: BBox } | null => {
    const fullBBoxRaw = getGlyphBBoxOfPoints(glyphData.paths);
    if (!fullBBoxRaw) return null;

    let aboveRaw = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    let belowRaw = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };

    const expandBox = (box: BBox, p: {x: number, y: number}) => {
        box.minX = Math.min(box.minX, p.x);
        box.maxX = Math.max(box.maxX, p.x);
        box.minY = Math.min(box.minY, p.y);
        box.maxY = Math.max(box.maxY, p.y);
    };

    glyphData.paths.forEach(path => {
        path.points.forEach(point => {
            // A point's stroke might cross the baseline. Use a tolerance based on stroke thickness.
            const tolerance = strokeThickness / 2;
            // Capture points that are part of the shape above the baseline
            if (point.y <= baselineY + tolerance) {
                expandBox(aboveRaw, point);
            }
            // Capture points that are part of the shape below the baseline
            if (point.y >= baselineY - tolerance) {
                expandBox(belowRaw, point);
            }
        });
    });
    
    const halfStroke = strokeThickness / 2;
    const adjustBox = (box: BBox) => {
        if (box.minX === Infinity) return null;
        return {
            minX: box.minX - halfStroke,
            maxX: box.maxX + halfStroke,
            minY: box.minY - halfStroke,
            maxY: box.maxY + halfStroke,
        };
    };

    const above = adjustBox(aboveRaw);
    const below = adjustBox(belowRaw);
    const full = adjustBox({minX: fullBBoxRaw.x, minY: fullBBoxRaw.y, maxX: fullBBoxRaw.x + fullBBoxRaw.width, maxY: fullBBoxRaw.y + fullBBoxRaw.height});

    if (!full) return null;

    return { above, below, full };
};

const doBBoxesCollide = (boxA: BBox | null, boxB: BBox | null): boolean => {
    if (!boxA || !boxB) return false;
    return !(
        boxA.maxX < boxB.minX ||
        boxA.minX > boxB.maxX ||
        boxA.maxY < boxB.minY ||
        boxA.minY > boxB.maxY
    );
};


export async function calculateAutoKerning(
    pairsToKern: { left: Character, right: Character }[],
    glyphDataMap: Map<number, GlyphData>,
    metrics: FontMetrics,
    strokeThickness: number
): Promise<Map<string, number>> {

    const newKerningMap = new Map<string, number>();

    for (const pair of pairsToKern) {
        const { left: leftChar, right: rightChar } = pair;
        const leftGlyph = glyphDataMap.get(leftChar.unicode);
        const rightGlyph = glyphDataMap.get(rightChar.unicode);

        if (!leftGlyph || !rightGlyph) continue;

        const leftBoxes = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, strokeThickness);
        const rightBoxes = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, strokeThickness);

        if (!leftBoxes || !rightBoxes || !leftBoxes.full || !rightBoxes.full) continue;

        const rsbL = leftChar.rsb ?? metrics.defaultRSB;
        
        // Binary search for optimal k
        let low = -Math.round(metrics.unitsPerEm / 2); // Max potential kerning
        let high = 0; // No kerning
        let bestK = 0;

        while (low <= high) {
            const kMid = Math.floor((low + high) / 2);
            
            const rightStartX = leftBoxes.full.maxX + rsbL + kMid;
            
            const rBoxAboveT = rightBoxes.above ? { 
                minX: rightStartX + rightBoxes.above.minX - rightBoxes.full.minX, maxX: rightStartX + rightBoxes.above.maxX - rightBoxes.full.minX,
                minY: rightBoxes.above.minY, maxY: rightBoxes.above.maxY,
            } : null;

            const rBoxBelowT = rightBoxes.below ? { 
                minX: rightStartX + rightBoxes.below.minX - rightBoxes.full.minX, maxX: rightStartX + rightBoxes.below.maxX - rightBoxes.full.minX,
                minY: rightBoxes.below.minY, maxY: rightBoxes.below.maxY,
            } : null;

            const collisionAbove = doBBoxesCollide(leftBoxes.above, rBoxAboveT);
            const collisionBelow = doBBoxesCollide(leftBoxes.full, rBoxBelowT);

            if (collisionAbove || collisionBelow) {
                // Too much kerning (k is too small/negative), search in the right half for less kerning
                low = kMid + 1;
            } else {
                // Not colliding, this k is a potential candidate. Try for more kerning (smaller k).
                bestK = kMid;
                high = kMid - 1;
            }
        }
        
        // Only add if kerning is actually needed (bestK is negative)
        if (bestK < 0) {
            newKerningMap.set(`${leftChar.unicode}-${rightChar.unicode}`, bestK);
        }

        // yield to the event loop to prevent freezing the UI
        await new Promise(resolve => setTimeout(resolve, 0));
    }

    return newKerningMap;
}
