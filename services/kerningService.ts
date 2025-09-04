import { Character, GlyphData, FontMetrics } from '../types';
import { getGlyphSubBBoxes, BBox } from './glyphRenderService';

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

        const leftBoxes = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        const rightBoxes = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);

        if (!leftBoxes || !rightBoxes || !leftBoxes.full || !rightBoxes.full) continue;

        const rsbL = leftChar.rsb ?? metrics.defaultRSB;
        const lsbR = rightChar.lsb ?? metrics.defaultLSB;
        
        // The target distance between the x-height boxes is the default spacing defined by side bearings.
        const targetDistance = rsbL + lsbR;

        // Binary search for optimal k
        let low = -Math.round(metrics.unitsPerEm / 2); // Max potential kerning
        let high = 0; // No kerning
        let bestK = 0;

        while (low <= high) {
            const kMid = Math.floor((low + high) / 2);
            
            // This is the hypothetical x-position of the right glyph's full bounding box's left edge.
            const rightStartX = leftBoxes.full.maxX + rsbL + kMid;
            
            const rBoxAscenderT = rightBoxes.ascender ? { 
                minX: rightStartX + (rightBoxes.ascender.minX - rightBoxes.full.minX), 
                maxX: rightStartX + (rightBoxes.ascender.maxX - rightBoxes.full.minX),
                minY: rightBoxes.ascender.minY, maxY: rightBoxes.ascender.maxY,
            } : null;

            const rBoxXHeightT = rightBoxes.xHeight ? { 
                minX: rightStartX + (rightBoxes.xHeight.minX - rightBoxes.full.minX), 
                maxX: rightStartX + (rightBoxes.xHeight.maxX - rightBoxes.full.minX),
                minY: rightBoxes.xHeight.minY, maxY: rightBoxes.xHeight.maxY,
            } : null;

            const rBoxDescenderT = rightBoxes.descender ? { 
                minX: rightStartX + (rightBoxes.descender.minX - rightBoxes.full.minX), 
                maxX: rightStartX + (rightBoxes.descender.maxX - rightBoxes.full.minX),
                minY: rightBoxes.descender.minY, maxY: rightBoxes.descender.maxY,
            } : null;

            let isInvalidKerning = false;
            // First, check for hard collisions in ascender/descender areas.
            if (doBBoxesCollide(leftBoxes.ascender, rBoxAscenderT) || doBBoxesCollide(leftBoxes.descender, rBoxDescenderT)) {
                isInvalidKerning = true;
            } else {
                // If no collisions there, check the distance in the x-height area against the target.
                if (rBoxXHeightT && leftBoxes.xHeight) {
                    const currentGap = rBoxXHeightT.minX - leftBoxes.xHeight.maxX;
                    if (currentGap < targetDistance) {
                        isInvalidKerning = true; // Kerned too tight, gap is smaller than desired.
                    }
                } else {
                    // Fallback for glyphs without significant x-height content (e.g., '-').
                    // We just check for simple collision of the full boxes.
                    const rBoxFullT = {
                        minX: rightStartX,
                        maxX: rightStartX + (rightBoxes.full.maxX - rightBoxes.full.minX),
                        minY: rightBoxes.full.minY,
                        maxY: rightBoxes.full.maxY
                    };
                    if (doBBoxesCollide(leftBoxes.full, rBoxFullT)) {
                        isInvalidKerning = true;
                    }
                }
            }

            if (isInvalidKerning) {
                // Too much kerning (k is too small/negative), search in the right half for less kerning.
                low = kMid + 1;
            } else {
                // This k is a potential candidate. Try for more kerning (smaller k).
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
