import React, { useState, useRef, useEffect } from 'react';
import { Tool, AppSettings, Path } from '../types';
import { PenIcon, EraserIcon, LineIcon, CircleIcon, DotIcon, UndoIcon, RedoIcon, CurveIcon, SelectIcon, ZoomInIcon, ZoomOutIcon, PanIcon, ImageIcon, ControlPointsIcon, CutIcon, CopyIcon, PasteIcon, EllipseIcon, CalligraphyIcon } from '../constants';
import { useLocale } from '../contexts/LocaleContext';

interface DrawingToolbarProps {
  currentTool: Tool;
  setCurrentTool: (tool: Tool) => void;
  settings: AppSettings;
  isLargeScreen: boolean;
  
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  
  onCut: () => void;
  selectedPathIds: Set<string>;
  onCopy: () => void;
  onPaste: () => void;
  clipboard: Path[] | null;
  
  onZoom: (factor: number) => void;
  onImageImportClick: () => void;
  
  calligraphyAngle: 45 | 30 | 15;
  setCalligraphyAngle: (angle: 45 | 30 | 15) => void;
}

const ToolButton: React.FC<{ tool: Tool, currentTool: Tool, label: string, onClick: (tool: Tool) => void, children: React.ReactNode }> = React.memo(({ tool, currentTool, label, onClick, children }) => {
  const isActive = currentTool === tool;
  return (
    <button
      onClick={() => onClick(tool)}
      title={label}
      className={`p-2 rounded-md transition-colors ${
        isActive
          ? 'bg-indigo-600 text-white'
          : 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-500'
      }`}
    >
      {children}
    </button>
  );
});

const ActionButton: React.FC<{ onClick: () => void, title: string, disabled?: boolean, children: React.ReactNode }> = React.memo(({ onClick, title, disabled, children }) => (
  <button
    onClick={onClick}
    title={title}
    disabled={disabled}
    className="p-2 rounded-md transition-colors bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {children}
  </button>
));


const DrawingToolbar: React.FC<DrawingToolbarProps> = (props) => {
    const { t } = useLocale();
    const { currentTool, setCurrentTool, settings, isLargeScreen, onUndo, canUndo, onRedo, canRedo, onCut, selectedPathIds, onCopy, onPaste, clipboard, onZoom, onImageImportClick, calligraphyAngle, setCalligraphyAngle } = props;
    
    const [isAnglePickerOpen, setIsAnglePickerOpen] = useState(false);
    const calligraphyToolButtonRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (currentTool !== 'calligraphy') {
            setIsAnglePickerOpen(false);
        }
    }, [currentTool]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isAnglePickerOpen && calligraphyToolButtonRef.current && !calligraphyToolButtonRef.current.contains(event.target as Node)) {
                setIsAnglePickerOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isAnglePickerOpen]);

    const handleCalligraphyToolClick = () => {
        if (currentTool === 'calligraphy') {
            setIsAnglePickerOpen(prev => !prev);
        } else {
            setCurrentTool('calligraphy');
            setIsAnglePickerOpen(false);
        }
    };
    
    const commonTools = (
        <>
            <ToolButton tool="select" currentTool={currentTool} label="Select" onClick={setCurrentTool}><SelectIcon /></ToolButton>
            <ToolButton tool="pan" currentTool={currentTool} label={t('pan')} onClick={setCurrentTool}><PanIcon /></ToolButton>
            {settings.editorMode === 'advanced' && <ToolButton tool="edit" currentTool={currentTool} label={t('showControlPoints')} onClick={setCurrentTool}><ControlPointsIcon /></ToolButton>}
        </>
    );

    const drawingTools = (
        <>
            <ToolButton tool="pen" currentTool={currentTool} label="Pen" onClick={setCurrentTool}><PenIcon /></ToolButton>
            {settings.editorMode === 'advanced' && (
                <div className="relative" ref={calligraphyToolButtonRef}>
                    <button
                        onClick={handleCalligraphyToolClick}
                        title="Calligraphy Pen"
                        className={`p-2 rounded-md transition-colors ${
                        currentTool === 'calligraphy'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-white hover:bg-gray-400 dark:hover:bg-gray-500'
                        }`}
                    >
                        <CalligraphyIcon />
                    </button>
                    {isAnglePickerOpen && (
                        <div className={`absolute z-10 bg-white dark:bg-gray-700 rounded-md shadow-lg border dark:border-gray-600 p-1 flex gap-1 ${isLargeScreen ? 'left-full ml-2 top-0 flex-col' : 'bottom-full mb-2 left-1/2 -translate-x-1/2'}`}>
                            {[45, 30, 15].map((angle) => (
                                <button
                                    key={angle}
                                    onClick={() => { setCalligraphyAngle(angle as 45|30|15); setIsAnglePickerOpen(false); }}
                                    className={`px-3 py-1 text-sm rounded-md w-full text-left ${calligraphyAngle === angle ? 'bg-indigo-500 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                >
                                    {angle}°
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <ToolButton tool="line" currentTool={currentTool} label="Line" onClick={setCurrentTool}><LineIcon /></ToolButton>
            <ToolButton tool="circle" currentTool={currentTool} label="Circle" onClick={setCurrentTool}><CircleIcon /></ToolButton>
            <ToolButton tool="ellipse" currentTool={currentTool} label="Ellipse" onClick={setCurrentTool}><EllipseIcon /></ToolButton>
            <ToolButton tool="curve" currentTool={currentTool} label="Curve" onClick={setCurrentTool}><CurveIcon /></ToolButton>
            <ToolButton tool="dot" currentTool={currentTool} label="Dot" onClick={setCurrentTool}><DotIcon /></ToolButton>
            <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
            <ToolButton tool="eraser" currentTool={currentTool} label="Eraser" onClick={setCurrentTool}><EraserIcon /></ToolButton>
        </>
    );

    const actionTools = (
        <>
            <ActionButton onClick={onUndo} title="Undo" disabled={!canUndo}><UndoIcon /></ActionButton>
            <ActionButton onClick={onRedo} title="Redo" disabled={!canRedo}><RedoIcon /></ActionButton>
            <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
            <ActionButton onClick={onCut} title={t('cut')} disabled={selectedPathIds.size === 0}><CutIcon /></ActionButton>
            <ActionButton onClick={onCopy} title={t('copy')}><CopyIcon /></ActionButton>
            <ActionButton onClick={onPaste} title={t('paste')} disabled={!clipboard}><PasteIcon /></ActionButton>
            <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
            <ActionButton onClick={() => onZoom(1.25)} title={t('zoomIn')}><ZoomInIcon /></ActionButton>
            <ActionButton onClick={() => onZoom(0.8)} title={t('zoomOut')}><ZoomOutIcon /></ActionButton>
            <div className={`border-gray-400 dark:border-gray-600 ${isLargeScreen ? 'border-t w-full my-2' : 'border-l h-6 mx-2'}`}></div>
            <ActionButton onClick={onImageImportClick} title={t('importImage')}><ImageIcon/></ActionButton>
        </>
    );

    if(isLargeScreen) {
        return (
            <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-l-lg flex flex-row items-start justify-center gap-2 shadow-inner">
                <div className="flex flex-col items-center justify-center gap-2">
                    {commonTools}
                    <div className="border-t w-full border-gray-400 dark:border-gray-600 my-2"></div>
                    {drawingTools}
                </div>
                <div className="flex flex-col items-center justify-center gap-2">
                    {actionTools}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-100 dark:bg-gray-800 p-2 rounded-t-lg flex items-center justify-center flex-wrap gap-2 shadow-inner">
            {commonTools}
            <div className="border-l h-6 border-gray-400 dark:border-gray-600 mx-2"></div>
            {drawingTools}
            <div className="border-l h-6 border-gray-400 dark:border-gray-600 mx-2"></div>
            {actionTools}
        </div>
    );
};

export default React.memo(DrawingToolbar);