import { GlyphData } from '../types';

/**
 * Checks if a glyph has been drawn, considering both freehand points and vector outlines.
 * @param glyphData The glyph data to check.
 * @returns True if the glyph has any drawable content, false otherwise.
 */
export const isGlyphDrawn = (glyphData: GlyphData | undefined): boolean => {
  if (!glyphData || !glyphData.paths || glyphData.paths.length === 0) {
    return false;
  }
  // A glyph is considered drawn if any of its paths have either freehand points or vector segment groups.
  return glyphData.paths.some(
    p => (p.points?.length || 0) > 0 || (p.segmentGroups?.length || 0) > 0
  );
};
