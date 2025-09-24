

import { Character, GlyphData, FontMetrics, RecommendedKerning } from '../types';
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
    strokeThickness: number,
    onProgress: (progress: number) => void,
    recommendedKerning: RecommendedKerning[] | null
): Promise<Map<string, number>> {

    const newKerningMap = new Map<string, number>();
    const totalPairs = pairsToKern.length;
    if (totalPairs === 0) {
        onProgress(100);
        return newKerningMap;
    }

    for (const [index, pair] of pairsToKern.entries()) {
        const { left: leftChar, right: rightChar } = pair;
        const leftGlyph = glyphDataMap.get(leftChar.unicode);
        const rightGlyph = glyphDataMap.get(rightChar.unicode);

        if (!leftGlyph || !rightGlyph) continue;

        const leftBoxes = getGlyphSubBBoxes(leftGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);
        const rightBoxes = getGlyphSubBBoxes(rightGlyph, metrics.baseLineY, metrics.topLineY, strokeThickness);

        if (!leftBoxes || !rightBoxes || !leftBoxes.full || !rightBoxes.full) continue;

        // 1. Determine the target distance
        let targetDistance: number;
        const rule = recommendedKerning?.find(r => r[0] === leftChar.name && r[1] === rightChar.name);

        if (rule && rule.length === 3) {
            const goal = rule[2];
            if (!isNaN(Number(goal))) {
                targetDistance = Number(goal);
            } else if (goal === 'lsb') {
                targetDistance = rightChar.lsb ?? metrics.defaultLSB;
            } else if (goal === 'rsb') {
                targetDistance = leftChar.rsb ?? metrics.defaultRSB;
            } else {
                // Fallback for an invalid rule value (e.g., misspelled string)
                const rsbL = (leftChar.rsb ?? metrics.defaultRSB) < 0 ? metrics.defaultRSB : (leftChar.rsb ?? metrics.defaultRSB);
                const lsbR = (rightChar.lsb ?? metrics.defaultLSB) < 0 ? metrics.defaultLSB : (rightChar.lsb ?? metrics.defaultLSB);
                targetDistance = rsbL + lsbR;
            }
        } else {
            // Default logic: Correct for negative side bearings.
            const rsbL = (leftChar.rsb ?? metrics.defaultRSB) < 0 ? metrics.defaultRSB : (leftChar.rsb ?? metrics.defaultRSB);
            const lsbR = (rightChar.lsb ?? metrics.defaultLSB) < 0 ? metrics.defaultLSB : (rightChar.lsb ?? metrics.defaultLSB);
            targetDistance = rsbL + lsbR;
        }

        // Binary search for optimal k
        let low = -Math.round(metrics.unitsPerEm / 2); // Max potential kerning
        let high = 0; // No kerning
        let bestK = 0;

        while (low <= high) {
            const kMid = Math.floor((low + high) / 2);
            
            const rightStartX = leftBoxes.full.maxX + (leftChar.rsb ?? metrics.defaultRSB) + (rightChar.lsb ?? metrics.defaultLSB) + kMid;
            const deltaX = rightStartX - rightBoxes.full.minX;
            
            const rBoxAscenderT = rightBoxes.ascender ? { ...rightBoxes.ascender, minX: rightBoxes.ascender.minX + deltaX, maxX: rightBoxes.ascender.maxX + deltaX } : null;
            const rBoxXHeightT = rightBoxes.xHeight ? { ...rightBoxes.xHeight, minX: rightBoxes.xHeight.minX + deltaX, maxX: rightBoxes.xHeight.maxX + deltaX } : null;
            const rBoxDescenderT = rightBoxes.descender ? { ...rightBoxes.descender, minX: rightBoxes.descender.minX + deltaX, maxX: rightBoxes.descender.maxX + deltaX } : null;

            let isInvalid = false;
            // Check for hard collisions in non-x-height zones.
            if (doBBoxesCollide(leftBoxes.ascender, rBoxAscenderT) || doBBoxesCollide(leftBoxes.descender, rBoxDescenderT)) {
                isInvalid = true;
            } else {
                // Check if the gap in the x-height zone is acceptable.
                if (rBoxXHeightT && leftBoxes.xHeight) {
                    const currentGap = rBoxXHeightT.minX - leftBoxes.xHeight.maxX;
                    if (currentGap < targetDistance) {
                        isInvalid = true; // Kerned too tight, gap is smaller than desired.
                    }
                } else {
                    // Fallback for glyphs without significant x-height content.
                    // Measure the gap between the full bounding boxes.
                    const rBoxFullT = { ...rightBoxes.full, minX: rightBoxes.full.minX + deltaX, maxX: rightBoxes.full.maxX + deltaX };
                    const currentFullGap = rBoxFullT.minX - leftBoxes.full.maxX;
                    if (currentFullGap < targetDistance) {
                        isInvalid = true;
                    }
                }
            }

            if (isInvalid) {
                low = kMid + 1;
            } else {
                bestK = kMid;
                high = kMid - 1;
            }
        }
        
        // Only add if kerning is actually needed (bestK is negative)
        if (bestK < 0) {
            newKerningMap.set(`${leftChar.unicode}-${rightChar.unicode}`, bestK);
        }
        
        const progressPercentage = Math.round(((index + 1) / totalPairs) * 100);
        onProgress(progressPercentage);
        
        if ((index + 1) % 5 === 0) {
             await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    return newKerningMap;
}