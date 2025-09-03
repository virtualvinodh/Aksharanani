import React, { useRef, useEffect } from 'react';
import { Character } from '../types';
import { useTheme } from '../contexts/ThemeContext';
import { renderPaths } from '../services/glyphRenderService';
import { PREVIEW_CANVAS_SIZE, DRAWING_CANVAS_SIZE } from '../constants';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useSettings } from '../contexts/SettingsContext';

interface CharacterCardProps {
  character: Character;
  onSelect: (character: Character) => void;
}

const CharacterCard: React.FC<CharacterCardProps> = ({ character, onSelect }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const { glyphDataMap } = useGlyphData();
  const { settings } = useSettings();
  
  const glyphData = glyphDataMap.get(character.unicode);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas || !settings) return;

    ctx.clearRect(0, 0, PREVIEW_CANVAS_SIZE, PREVIEW_CANVAS_SIZE);

    if (!glyphData || glyphData.paths.length === 0 || glyphData.paths.every(p => (p.points?.length || 0) === 0 && (p.segmentGroups?.length || 0) === 0)) {
        return;
    }

    const scale = PREVIEW_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
    
    ctx.save();
    ctx.scale(scale, scale);
    renderPaths(ctx, glyphData.paths, {
        strokeThickness: settings.strokeThickness,
        color: theme === 'dark' ? '#E2E8F0' : '#1F2937'
    });
    ctx.restore();
    
  }, [glyphData, settings, theme]);

  if (!settings) return null;

  return (
    <div
      onClick={() => onSelect(character)}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 hover:border-indigo-500 cursor-pointer transition-all duration-200 aspect-square"
    >
      <div className="w-full h-full flex items-center justify-center">
        <canvas ref={canvasRef} width={PREVIEW_CANVAS_SIZE} height={PREVIEW_CANVAS_SIZE}></canvas>
      </div>
      <div className="text-center mt-2">
        <p 
          className="text-2xl font-bold text-gray-900 dark:text-white"
          style={{
            fontFamily: 'var(--guide-font-family)',
            fontFeatureSettings: 'var(--guide-font-feature-settings)'
          }}
        >
          {character.name}
        </p>
        {settings.editorMode === 'advanced' && (
            <p className="text-xs text-gray-500 dark:text-gray-400">U+{character.unicode.toString(16).toUpperCase().padStart(4, '0')}</p>
        )}
      </div>
    </div>
  );
};

export default React.memo(CharacterCard);
