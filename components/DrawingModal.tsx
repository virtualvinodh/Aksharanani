
import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { Character, GlyphData, Path, FontMetrics, Tool, AppSettings, CharacterSet, ImageTransform, Point, MarkAttachmentRules, Segment } from '../types';
import DrawingCanvas from './DrawingCanvas';
import { DRAWING_CANVAS_SIZE } from '../constants';
import { useLocale } from '../contexts/LocaleContext';
import UnsavedChangesModal from './UnsavedChangesModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import DrawingModalHeader from './DrawingModalHeader';
import DrawingToolbar from './DrawingToolbar';
import ImageControlPanel from './ImageControlPanel';
import { useClipboard } from '../contexts/ClipboardContext';
import { useLayout } from '../contexts/LayoutContext';
import { VEC } from '../utils/vectorUtils';
import { isGlyphDrawn } from '../utils/glyphUtils';
import Modal from './Modal';
import ImageTracerModal from './modals/ImageTracerModal';
import { useGlyphEditSession } from '../hooks/drawing/useGlyphEditSession';
import { useDrawingShortcuts } from '../hooks/drawing/useDrawingShortcuts';
import { generateId } from '../hooks/drawingTools/types';

declare var paper: any;

interface DrawingModalProps {
  character: Character;
  characterSet: CharacterSet;
  glyphData: GlyphData | undefined;
  onSave: (unicode: number, newGlyphData: GlyphData, newBearings: { lsb?: number, rsb?: number }, onSuccess: () => void) => void;
  onClose: () => void;
  onDelete: (unicode: number) => void;
  onNavigate: (character: Character) => void;
  settings: AppSettings;
  metrics: FontMetrics;
  allGlyphData: Map<number, GlyphData>;
  allCharacterSets: CharacterSet[];
  gridConfig: { characterNameSize: number };
  clipboard: Path[] | null;
  setClipboard: (paths: Path[] | null) => void;
  markAttachmentRules: MarkAttachmentRules | null;
  onUnlockGlyph: (unicode: number) => void;
  onRelinkGlyph: (unicode: number) => void;
}

const DrawingModal: React.FC<DrawingModalProps> = ({ character, characterSet, glyphData, onSave, onClose, onDelete, onNavigate, settings, metrics, allGlyphData, allCharacterSets, gridConfig, markAttachmentRules, onUnlockGlyph, onRelinkGlyph }) => {
  const { t } = useLocale();
  const { showNotification, modalOriginRect } = useLayout();
  const { clipboard, dispatch: clipboardDispatch } = useClipboard();
  
  const [currentTool, setCurrentTool] = useState<Tool>('pen');
  const [zoom, setZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
  const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
  const [isImageSelected, setIsImageSelected] = useState(false);
  const [animationClass, setAnimationClass] = useState('');
  const [calligraphyAngle, setCalligraphyAngle] = useState<45 | 30 | 15>(45);
  
  // Image state
  const imageImportRef = useRef<HTMLInputElement>(null);
  const svgImportRef = useRef<HTMLInputElement>(null);
  const imageTraceRef = useRef<HTMLInputElement>(null);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(0.5);
  const [imageTransform, setImageTransform] = useState<ImageTransform | null>(null);
  
  // Trace Modal State
  const [isTracerModalOpen, setIsTracerModalOpen] = useState(false);
  const [tracerImageSrc, setTracerImageSrc] = useState<string | null>(null);

  // Confirmation Modals
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isUnlockConfirmOpen, setIsUnlockConfirmOpen] = useState(false);
  const [isRelinkConfirmOpen, setIsRelinkConfirmOpen] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<number | null>(null);
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  
  const isLocked = !!character.link;
  const isComposite = !!character.composite && character.composite.length > 0;
  const isInitiallyDrawn = useMemo(() => isGlyphDrawn(glyphData), [glyphData]);

  const visibleCharactersForNav = useMemo(() => characterSet.characters.filter(c => !c.hidden), [characterSet]);
  const currentIndex = visibleCharactersForNav.findIndex(c => c.unicode === character.unicode);
  const prevCharacter = currentIndex > 0 ? visibleCharactersForNav[currentIndex - 1] : null;
  const nextCharacter = currentIndex < visibleCharactersForNav.length - 1 ? visibleCharactersForNav[currentIndex + 1] : null;


  // --- Use extracted session hook ---
  const {
    currentPaths, handlePathsChange, undo, redo, canUndo, canRedo,
    lsb, setLsb, rsb, setRsb, isTransitioning,
    handleSave, handleRefresh, handleNavigationAttempt,
    isUnsavedModalOpen, closeUnsavedModal, confirmSave, confirmDiscard
  } = useGlyphEditSession({
      character, glyphData, allGlyphData, allCharacterSets, settings, metrics, markAttachmentRules,
      onSave, onNavigate, onClose: () => triggerClose(onClose)
  });

  // Animation handling
  useLayoutEffect(() => {
    if (modalOriginRect && modalRef.current) {
        const modalEl = modalRef.current;
        const originX = modalOriginRect.left + modalOriginRect.width / 2;
        const originY = modalOriginRect.top + modalOriginRect.height / 2;
        const scaleX = modalOriginRect.width / window.innerWidth;
        const scaleY = modalOriginRect.height / window.innerHeight;

        modalEl.style.setProperty('--modal-origin-x', `${originX}px`);
        modalEl.style.setProperty('--modal-origin-y', `${originY}px`);
        modalEl.style.setProperty('--modal-scale-x', scaleX.toFixed(5));
        modalEl.style.setProperty('--modal-scale-y', scaleY.toFixed(5));
        
        setAnimationClass('animate-modal-enter');
        animationTimeoutRef.current = window.setTimeout(() => {
            setAnimationClass('');
        }, 300);
    }
    return () => { if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current); };
  }, [modalOriginRect, character.unicode]);

  // Reset tool/view on char change
  useEffect(() => {
    if (character.link) {
        setCurrentTool('select');
    } else {
        setCurrentTool('pen');
    }
    setZoom(1); setViewOffset({ x: 0, y: 0 }); setSelectedPathIds(new Set()); setIsImageSelected(false);
    setBackgroundImage(null); setImageTransform(null); setBackgroundImageOpacity(0.5);
    
    if (character.link) {
        const componentNames = character.link.join(' + ');
        showNotification(t('linkedGlyphLocked', { components: componentNames }), 'info');
    }
  }, [character, showNotification, t]);


  // --- Action Handlers ---
  const handleClear = () => handlePathsChange([]);
  
  const handleZoom = (factor: number) => {
      const newZoom = Math.max(0.1, Math.min(10, zoom * factor));
      const center = { x: DRAWING_CANVAS_SIZE / 2, y: DRAWING_CANVAS_SIZE / 2 };
      const newOffset = {
          x: center.x - (center.x - viewOffset.x) * (newZoom / zoom),
          y: center.y - (center.y - viewOffset.y) * (newZoom / zoom)
      };
      setZoom(newZoom);
      setViewOffset(newOffset);
  };

  const triggerClose = useCallback((postAnimationCallback: () => void) => {
    if (modalOriginRect) {
        setAnimationClass('animate-modal-exit');
        animationTimeoutRef.current = window.setTimeout(() => {
            setAnimationClass('');
            postAnimationCallback();
        }, 300);
    } else {
        postAnimationCallback();
    }
  }, [modalOriginRect]);


  const handleImageImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const imgSrc = e.target?.result as string;
      setBackgroundImage(imgSrc);
      const img = new Image();
      img.onload = () => {
          const canvasAspectRatio = DRAWING_CANVAS_SIZE / DRAWING_CANVAS_SIZE;
          const imageAspectRatio = img.width / img.height;
          let width, height;
          if (imageAspectRatio > canvasAspectRatio) {
              width = DRAWING_CANVAS_SIZE * 0.9;
              height = (DRAWING_CANVAS_SIZE * 0.9) / imageAspectRatio;
          } else {
              height = DRAWING_CANVAS_SIZE * 0.9;
              width = (DRAWING_CANVAS_SIZE * 0.9) * imageAspectRatio;
          }
          const x = (DRAWING_CANVAS_SIZE - width) / 2;
          const y = (DRAWING_CANVAS_SIZE - height) / 2;
          setImageTransform({ x, y, width, height, rotation: 0 });
      };
      img.src = imgSrc;
    };
    reader.readAsDataURL(file);
    if(imageImportRef.current) imageImportRef.current.value = "";
  };

  const handleSvgImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const svgText = e.target?.result as string;
        if (!svgText) return;
        
        const paperScope = new paper.PaperScope();
        paperScope.setup(new paper.Size(DRAWING_CANVAS_SIZE, DRAWING_CANVAS_SIZE));
        
        const importedItem = paperScope.project.importSVG(svgText, { expandShapes: true });
        if (!importedItem || importedItem.bounds.width === 0 || importedItem.bounds.height === 0) {
            showNotification(t('errorInvalidSvg'), 'error');
            return;
        }

        const bounds = importedItem.bounds;
        const availableHeight = metrics.baseLineY - metrics.topLineY;
        const scale = availableHeight / bounds.height;
        importedItem.scale(scale, new paper.Point(0,0));
        
        const newBounds = importedItem.bounds;
        const targetCenter = {
            x: DRAWING_CANVAS_SIZE / 2,
            y: metrics.topLineY + availableHeight / 2
        };
        const translation = VEC.sub(targetCenter, {x: newBounds.center.x, y: newBounds.center.y});
        importedItem.translate(new paper.Point(translation.x, translation.y));
        
        const newPaths: Path[] = [];
        const extractPaths = (item: any) => {
            if (item.className === 'CompoundPath') {
                 const segmentGroups: Segment[][] = item.children.map((child: any) =>
                    child.segments.map((seg: any) => ({
                        point: { x: seg.point.x, y: seg.point.y },
                        handleIn: { x: seg.handleIn.x, y: seg.handleIn.y },
                        handleOut: { x: seg.handleOut.x, y: seg.handleOut.y }
                    }))
                );
                newPaths.push({ id: generateId(), type: 'outline', points: [], segmentGroups: segmentGroups });
            } else if (item.className === 'Path') {
                const segments: Segment[] = item.segments.map((seg: any) => ({
                    point: { x: seg.point.x, y: seg.point.y },
                    handleIn: { x: seg.handleIn.x, y: seg.handleIn.y },
                    handleOut: { x: seg.handleOut.x, y: seg.handleOut.y }
                }));
                 newPaths.push({ id: generateId(), type: 'outline', points: [], segmentGroups: [segments] });
            } else if (item.children) {
                item.children.forEach(extractPaths);
            }
        };
        extractPaths(importedItem);
        handlePathsChange([...currentPaths, ...newPaths]);
        setCurrentTool('select');
        setTimeout(() => { setSelectedPathIds(new Set(newPaths.map(p => p.id))); }, 0);
        showNotification(t('svgImportSuccess'), 'info');
    };
    reader.readAsText(file);
    if(svgImportRef.current) svgImportRef.current.value = "";
  };

  const handleImageTraceFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const imgSrc = e.target?.result as string;
        setTracerImageSrc(imgSrc);
        setIsTracerModalOpen(true);
    };
    reader.readAsDataURL(file);
    if (imageTraceRef.current) imageTraceRef.current.value = "";
  };

  const handleInsertTracedSVG = (newPaths: Path[]) => {
      handlePathsChange([...currentPaths, ...newPaths]);
      setCurrentTool('select');
      setTimeout(() => { setSelectedPathIds(new Set(newPaths.map(p => p.id))); }, 0);
  };

  // --- Operations ---
  const handleCopy = useCallback(() => {
    if (currentPaths.length === 0) return;
    let pathsToCopy: Path[];
    if (selectedPathIds.size === 0) {
      pathsToCopy = currentPaths;
      showNotification(t('copiedGlyph'));
    } else {
      pathsToCopy = currentPaths.filter(p => selectedPathIds.has(p.id));
      showNotification(t('copiedSelection'));
    }
    clipboardDispatch({ type: 'SET_CLIPBOARD', payload: JSON.parse(JSON.stringify(pathsToCopy)) });
  }, [currentPaths, selectedPathIds, clipboardDispatch, showNotification, t]);

  const handleCut = useCallback(() => {
      if (selectedPathIds.size === 0) return;
      const pathsToCut = currentPaths.filter(p => selectedPathIds.has(p.id));
      clipboardDispatch({ type: 'SET_CLIPBOARD', payload: JSON.parse(JSON.stringify(pathsToCut)) });
      const newPaths = currentPaths.filter(p => !selectedPathIds.has(p.id));
      handlePathsChange(newPaths);
      setSelectedPathIds(new Set());
      showNotification(t('cutSelection'));
  }, [selectedPathIds, currentPaths, clipboardDispatch, handlePathsChange, showNotification, t]);

  const handlePaste = useCallback(() => {
      if (!clipboard) return;
      const pastedPaths = clipboard.map(p => ({
          ...p,
          id: generateId(),
          points: p.points.map(pt => ({ x: pt.x + 10, y: pt.y + 10 })),
          segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({...seg, point: { x: seg.point.x + 10, y: seg.point.y + 10 }}))) : undefined
      }));
      const newPaths = [...currentPaths, ...pastedPaths];
      handlePathsChange(newPaths);
      const newSelectedIds = new Set(pastedPaths.map(p => p.id));
      setSelectedPathIds(newSelectedIds);
      showNotification(t('pastedSelection'));
  }, [clipboard, currentPaths, handlePathsChange, showNotification, t]);

  const handleDeleteSelection = () => {
      if (selectedPathIds.size > 0) {
        const newPaths = currentPaths.filter(p => !selectedPathIds.has(p.id));
        handlePathsChange(newPaths);
        setSelectedPathIds(new Set());
      }
  };

  const moveSelection = useCallback((delta: Point) => {
    const movedPaths = currentPaths.map(p => {
      if (selectedPathIds.has(p.id)) {
        return {
          ...p,
          points: p.points.map(pt => VEC.add(pt, delta)),
          segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({
            ...seg,
            point: VEC.add(seg.point, delta)
          }))) : undefined,
        };
      }
      return p;
    });
    handlePathsChange(movedPaths);
  }, [currentPaths, selectedPathIds, handlePathsChange]);

  const handleGroup = useCallback(() => {
    const newGroupId = generateId();
    const newPaths = currentPaths.map(p => selectedPathIds.has(p.id) ? { ...p, groupId: newGroupId } : p);
    handlePathsChange(newPaths);
    showNotification(t('groupedSuccess'));
  }, [currentPaths, selectedPathIds, handlePathsChange, showNotification, t]);

  const handleUngroup = useCallback(() => {
    const affectedGroupIds = new Set<string>();
    currentPaths.forEach(p => { if (selectedPathIds.has(p.id) && p.groupId) affectedGroupIds.add(p.groupId); });
    const newPaths = currentPaths.map(p => (p.groupId && affectedGroupIds.has(p.groupId) ? (({ groupId, ...rest }) => rest)(p) : p));
    handlePathsChange(newPaths);
    showNotification(t('ungroupedSuccess'));
  }, [currentPaths, selectedPathIds, handlePathsChange, showNotification, t]);

  const canGroup = useMemo(() => {
      if (selectedPathIds.size < 2) return false;
      const selectedPaths = currentPaths.filter(p => selectedPathIds.has(p.id));
      if (selectedPaths.length < 2) return false;
      const firstGroupId = selectedPaths[0].groupId;
      return !firstGroupId || selectedPaths.some(p => p.groupId !== firstGroupId);
  }, [selectedPathIds, currentPaths]);

  const canUngroup = useMemo(() => {
      if (selectedPathIds.size === 0) return false;
      return currentPaths.some(p => selectedPathIds.has(p.id) && p.groupId);
  }, [selectedPathIds, currentPaths]);

  const handleConfirmUnlock = () => {
    onUnlockGlyph(character.unicode!);
    setIsUnlockConfirmOpen(false);
    showNotification(t('glyphUnlockedSuccess'), 'success');
  };

  const handleConfirmRelink = () => {
    onRelinkGlyph(character.unicode!);
    setIsRelinkConfirmOpen(false);
    showNotification(t('glyphRelinkedSuccess'), 'success');
  };


  // --- Shortcuts Hook ---
  useDrawingShortcuts({
      onUndo: undo,
      onRedo: redo,
      onCopy: handleCopy,
      onCut: handleCut,
      onPaste: handlePaste,
      onDelete: handleDeleteSelection,
      onMoveSelection: moveSelection,
      onNavigatePrev: () => handleNavigationAttempt(prevCharacter),
      onNavigateNext: () => handleNavigationAttempt(nextCharacter),
      canUndo,
      canRedo,
      hasSelection: selectedPathIds.size > 0,
      hasClipboard: !!clipboard,
      canNavigatePrev: !!prevCharacter,
      canNavigateNext: !!nextCharacter
  });

  const canvasComponent = (
     <DrawingCanvas 
        width={DRAWING_CANVAS_SIZE} 
        height={DRAWING_CANVAS_SIZE} 
        paths={currentPaths}
        onPathsChange={handlePathsChange}
        metrics={metrics}
        tool={currentTool}
        zoom={zoom}
        setZoom={setZoom}
        viewOffset={viewOffset}
        setViewOffset={setViewOffset}
        settings={settings}
        allGlyphData={allGlyphData}
        allCharacterSets={allCharacterSets}
        currentCharacter={character}
        gridConfig={gridConfig}
        backgroundImage={backgroundImage}
        backgroundImageOpacity={backgroundImageOpacity}
        imageTransform={imageTransform}
        onImageTransformChange={setImageTransform}
        selectedPathIds={selectedPathIds}
        onSelectionChange={setSelectedPathIds}
        isImageSelected={isImageSelected}
        onImageSelectionChange={setIsImageSelected}
        lsb={lsb}
        rsb={rsb}
        calligraphyAngle={calligraphyAngle}
        isInitiallyDrawn={isInitiallyDrawn}
        transformMode={isLocked ? 'move-only' : 'all'}
    />
  );
  
  const mainContentClasses = `flex-grow overflow-hidden bg-gray-100 dark:bg-black/20 transition-opacity duration-150 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`;

  return (
    <div ref={modalRef} className={`fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col ${animationClass}`}>
      {/* Hidden Inputs */}
      <input type="file" ref={imageImportRef} onChange={handleImageImport} className="hidden" accept="image/png, image/jpeg, image/gif, image/bmp" />
      <input type="file" ref={svgImportRef} onChange={handleSvgImport} className="hidden" accept="image/svg+xml" />
      <input type="file" ref={imageTraceRef} onChange={handleImageTraceFileChange} className="hidden" accept="image/png, image/jpeg, image/gif, image/bmp" />

      <DrawingModalHeader
        character={character}
        prevCharacter={prevCharacter}
        nextCharacter={nextCharacter}
        onBackClick={() => handleNavigationAttempt(null)}
        onNavigate={handleNavigationAttempt}
        settings={settings}
        metrics={metrics}
        lsb={lsb}
        setLsb={setLsb}
        rsb={rsb}
        setRsb={setRsb}
        onDeleteClick={() => setIsDeleteConfirmOpen(true)}
        onClear={handleClear}
        onSave={handleSave}
        isLocked={isLocked}
        isComposite={isComposite}
        onRefresh={handleRefresh}
      />

      <main className={isLargeScreen ? `${mainContentClasses} flex flex-row justify-center p-4 gap-4` : `${mainContentClasses} flex flex-col p-4 gap-4`}>
        {isLargeScreen ? (
             <div className="flex flex-col justify-center">
                 <DrawingToolbar
                    character={character}
                    currentTool={currentTool}
                    setCurrentTool={setCurrentTool}
                    settings={settings}
                    isLargeScreen={true}
                    onUndo={undo} canUndo={canUndo} onRedo={redo} canRedo={canRedo}
                    onCut={handleCut} selectedPathIds={selectedPathIds} onCopy={handleCopy} onPaste={handlePaste} clipboard={clipboard}
                    onGroup={handleGroup} canGroup={canGroup} onUngroup={handleUngroup} canUngroup={canUngroup}
                    onZoom={handleZoom}
                    onImageImportClick={() => imageImportRef.current?.click()}
                    onSvgImportClick={() => svgImportRef.current?.click()}
                    onImageTraceClick={() => imageTraceRef.current?.click()}
                    calligraphyAngle={calligraphyAngle} setCalligraphyAngle={setCalligraphyAngle}
                    onUnlockClick={() => setIsUnlockConfirmOpen(true)} onRelinkClick={() => setIsRelinkConfirmOpen(true)}
                 />
             </div>
        ) : (
             <DrawingToolbar
                character={character}
                currentTool={currentTool}
                setCurrentTool={setCurrentTool}
                settings={settings}
                isLargeScreen={false}
                onUndo={undo} canUndo={canUndo} onRedo={redo} canRedo={canRedo}
                onCut={handleCut} selectedPathIds={selectedPathIds} onCopy={handleCopy} onPaste={handlePaste} clipboard={clipboard}
                onGroup={handleGroup} canGroup={canGroup} onUngroup={handleUngroup} canUngroup={canUngroup}
                onZoom={handleZoom}
                onImageImportClick={() => imageImportRef.current?.click()}
                onSvgImportClick={() => svgImportRef.current?.click()}
                onImageTraceClick={() => imageTraceRef.current?.click()}
                calligraphyAngle={calligraphyAngle} setCalligraphyAngle={setCalligraphyAngle}
                onUnlockClick={() => setIsUnlockConfirmOpen(true)} onRelinkClick={() => setIsRelinkConfirmOpen(true)}
            />
        )}
        <div className="flex-1 min-w-0 min-h-0 flex justify-center items-center">
            <div className="rounded-md overflow-hidden shadow-lg aspect-square max-w-full max-h-full">
                {canvasComponent}
            </div>
        </div>
      </main>

      <ImageControlPanel
        backgroundImage={backgroundImage}
        backgroundImageOpacity={backgroundImageOpacity}
        setBackgroundImageOpacity={setBackgroundImageOpacity}
        onClearImage={() => { setBackgroundImage(null); setImageTransform(null); }}
      />

      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        onClose={closeUnsavedModal}
        onSave={confirmSave}
        onDiscard={confirmDiscard}
      />

      <DeleteConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => { onDelete(character.unicode!); setIsDeleteConfirmOpen(false); }}
        character={character}
        isStandardGlyph={!character.isCustom}
      />

      <Modal isOpen={isUnlockConfirmOpen} onClose={() => setIsUnlockConfirmOpen(false)} title={t('unlockGlyphTitle')} titleClassName="text-yellow-600 dark:text-yellow-400" footer={<><button onClick={() => setIsUnlockConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('cancel')}</button><button onClick={handleConfirmUnlock} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg">{t('unlock')}</button></>}>
        <p>{t('unlockGlyphMessage')}</p>
      </Modal>
      
      <Modal isOpen={isRelinkConfirmOpen} onClose={() => setIsRelinkConfirmOpen(false)} title={t('relinkGlyphTitle')} titleClassName="text-yellow-600 dark:text-yellow-400" footer={<><button onClick={() => setIsRelinkConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('cancel')}</button><button onClick={handleConfirmRelink} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg">{t('relink')}</button></>}>
        <p>{t('relinkGlyphMessage')}</p>
      </Modal>

      <ImageTracerModal
        isOpen={isTracerModalOpen}
        onClose={() => setIsTracerModalOpen(false)}
        imageSrc={tracerImageSrc}
        onInsertSVG={handleInsertTracedSVG}
        drawingCanvasSize={DRAWING_CANVAS_SIZE}
        metrics={metrics}
      />
      
    </div>
  );
};

export default React.memo(DrawingModal);
