



import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { getAccurateGlyphBBox, calculateDefaultMarkOffset } from '../services/glyphRenderService';
import { VEC } from '../utils/vectorUtils';
import { isGlyphDrawn } from '../utils/glyphUtils';

declare var paper: any;

interface DrawingModalProps {
  character: Character;
  characterSet: CharacterSet;
  glyphData: GlyphData | undefined;
  onSave: (unicode: number, newGlyphData: GlyphData, newBearings: { lsb?: number, rsb?: number }) => void;
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
}

const DrawingModal: React.FC<DrawingModalProps> = ({ character, characterSet, glyphData, onSave, onClose, onDelete, onNavigate, settings, metrics, allGlyphData, allCharacterSets, gridConfig, markAttachmentRules }) => {
  const [currentPaths, setCurrentPaths] = useState<Path[]>([]);
  const [initialPathsOnLoad, setInitialPathsOnLoad] = useState<Path[]>([]);
  const [history, setHistory] = useState<Path[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [currentTool, setCurrentTool] = useState<Tool>('pen');
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<Character | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const { t } = useLocale();
  const { showNotification } = useLayout();
  const { clipboard, dispatch: clipboardDispatch } = useClipboard();
  
  const [zoom, setZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
  const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
  const [isImageSelected, setIsImageSelected] = useState(false);
  
  // Image state
  const imageImportRef = useRef<HTMLInputElement>(null);
  const svgImportRef = useRef<HTMLInputElement>(null);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(0.5);
  const [imageTransform, setImageTransform] = useState<ImageTransform | null>(null);
  
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  
  // LSB/RSB state
  const [lsb, setLsb] = useState<number | undefined>(character.lsb);
  const [rsb, setRsb] = useState<number | undefined>(character.rsb);
  
  // Calligraphy state
  const [calligraphyAngle, setCalligraphyAngle] = useState<45 | 30 | 15>(45);

  const generateId = () => `${Date.now()}-${Math.random()}`;

  useEffect(() => {
    const loadedPaths = glyphData?.paths || [];
    let isPrefilled = false;
    let compositePaths: Path[] = [];

    // Prefill logic for composite characters that are empty
    if (character.composite && !isGlyphDrawn(glyphData)) {
        const allCharsMap = new Map<string, Character>();
        allCharacterSets.flatMap(set => set.characters).forEach(char => {
            allCharsMap.set(char.name, char);
        });

        let prefillSuccessful = true;

        // NEW: Check for base + mark composite with positioning rules
        if (character.composite.length === 2 && markAttachmentRules) {
            const baseChar = allCharsMap.get(character.composite[0]);
            const markChar = allCharsMap.get(character.composite[1]);

            if (baseChar && markChar && (baseChar.glyphClass === 'base' || baseChar.glyphClass === 'mark') && markChar.glyphClass === 'mark') {
                const baseGlyphData = allGlyphData.get(baseChar.unicode);
                const markGlyphData = allGlyphData.get(markChar.unicode);

                if (isGlyphDrawn(baseGlyphData) && isGlyphDrawn(markGlyphData)) {
                    const basePaths = JSON.parse(JSON.stringify(baseGlyphData!.paths));
                    const markPaths = JSON.parse(JSON.stringify(markGlyphData!.paths));
                    
                    const baseBbox = getAccurateGlyphBBox(basePaths, settings.strokeThickness);
                    const markBbox = getAccurateGlyphBBox(markPaths, settings.strokeThickness);
                    
                    const offset = calculateDefaultMarkOffset(
                        baseChar,
                        markChar,
                        baseBbox,
                        markBbox,
                        markAttachmentRules,
                        metrics,
                        allCharacterSets
                    );
                    
                    const finalMarkPaths = markPaths.map((p: Path) => ({
                        ...p,
                        id: generateId(),
                        points: p.points.map((pt: Point) => ({ x: pt.x + offset.x, y: pt.y + offset.y })),
                        segmentGroups: p.segmentGroups ? p.segmentGroups.map(group => group.map(seg => ({ ...seg, point: { x: seg.point.x + offset.x, y: seg.point.y + offset.y } }))) : undefined
                    }));
                    const basePathsWithNewIds = basePaths.map((p: Path) => ({...p, id: generateId()}));
                    compositePaths = [...basePathsWithNewIds, ...finalMarkPaths];
                    isPrefilled = true;
                }
            }
        }
        
        // Fallback to old logic for other composite types (e.g., base+base) or if new logic fails
        if (!isPrefilled) {
            let offsetX = 0;
            let lastBaseOffset = { x: 0 };
            const tempCompositePaths: Path[] = [];
            
            for (const componentName of character.composite) {
                const componentChar = allCharsMap.get(componentName);
                if (componentChar) {
                    const componentGlyphData = allGlyphData.get(componentChar.unicode);
                    if (isGlyphDrawn(componentGlyphData)) {
                        let processedPaths = JSON.parse(JSON.stringify(componentGlyphData!.paths));

                        if (character.compositeTransform) {
                            const [scale, yOffset] = character.compositeTransform;
                            const componentBbox = getAccurateGlyphBBox(processedPaths, settings.strokeThickness);
                            
                            if (componentBbox) {
                                const centerX = componentBbox.x + componentBbox.width / 2;
                                const centerY = componentBbox.y + componentBbox.height / 2;
                                
                                const transformPoint = (p: Point) => {
                                    const translated = VEC.sub(p, { x: centerX, y: centerY });
                                    const scaled = VEC.scale(translated, scale);
                                    return VEC.add(scaled, { x: centerX, y: centerY });
                                };

                                processedPaths = processedPaths.map((p: Path) => ({
                                    ...p,
                                    points: p.points.map(transformPoint),
                                    segmentGroups: p.segmentGroups ? p.segmentGroups.map((group: Segment[]) => group.map(seg => ({
                                        ...seg,
                                        point: transformPoint(seg.point),
                                        handleIn: VEC.scale(seg.handleIn, scale),
                                        handleOut: VEC.scale(seg.handleOut, scale)
                                    }))) : undefined
                                }));
                                
                                const newBaselineY = centerY + (metrics.baseLineY - centerY) * scale;
                                const targetBaselineY = metrics.baseLineY + yOffset;
                                const finalYShift = targetBaselineY - newBaselineY;
                                
                                processedPaths = processedPaths.map((p: Path) => ({
                                    ...p,
                                    points: p.points.map((pt: Point) => ({ ...pt, y: pt.y + finalYShift })),
                                    segmentGroups: p.segmentGroups ? p.segmentGroups.map((group: Segment[]) => group.map(seg => ({ ...seg, point: { x: seg.point.x, y: seg.point.y + finalYShift } }))) : undefined
                                }));
                            }
                        }

                        const originalPaths = processedPaths;
                        const componentBbox = getAccurateGlyphBBox(originalPaths, settings.strokeThickness);
                        let currentOffset = (componentChar.glyphClass === 'base' && componentBbox) ? (offsetX - componentBbox.x) : lastBaseOffset.x;
                        if (componentChar.glyphClass === 'base') lastBaseOffset.x = currentOffset;

                        const newPaths = JSON.parse(JSON.stringify(originalPaths)).map((p: Path) => ({
                            ...p,
                            id: generateId(),
                            points: p.points.map((pt: Point) => ({ x: pt.x + currentOffset, y: pt.y })),
                            segmentGroups: p.segmentGroups ? p.segmentGroups.map((group: Segment[]) => group.map(seg => ({ ...seg, point: { x: seg.point.x + currentOffset, y: seg.point.y } }))) : undefined
                        }));
                        tempCompositePaths.push(...newPaths);

                        if (componentChar.glyphClass === 'base' && componentBbox) {
                            offsetX = currentOffset + componentBbox.x + componentBbox.width;
                        }
                    } else { prefillSuccessful = false; break; }
                } else { prefillSuccessful = false; break; }
            }
            if (prefillSuccessful) {
                compositePaths = tempCompositePaths;
                isPrefilled = true;
            }
        }

        if (isPrefilled && compositePaths.length > 0) {
            let finalPaths = compositePaths;
            const fullBbox = getAccurateGlyphBBox(compositePaths, settings.strokeThickness);
            if (fullBbox) {
                const centerX = fullBbox.x + fullBbox.width / 2;
                const canvasCenter = DRAWING_CANVAS_SIZE / 2;
                const shiftX = canvasCenter - centerX;
                const shiftY = 0; // Do not center vertically
                finalPaths = compositePaths.map(p => ({
                    ...p,
                    points: p.points.map(pt => ({ x: pt.x + shiftX, y: pt.y + shiftY })),
                    segmentGroups: p.segmentGroups ? p.segmentGroups.map((group: Segment[]) => group.map(seg => ({ ...seg, point: { x: seg.point.x + shiftX, y: seg.point.y + shiftY } }))) : undefined
                }));
            }
            setCurrentPaths(finalPaths);
            setHistory([finalPaths]);
            setHistoryIndex(0);
        }
    }

    if (!isPrefilled) {
        setInitialPathsOnLoad(JSON.parse(JSON.stringify(loadedPaths)));
        setCurrentPaths(loadedPaths);
        setHistory([loadedPaths]);
        setHistoryIndex(0);
        setCurrentTool('pen');
    }

    setLsb(character.lsb);
    setRsb(character.rsb);
    setZoom(1);
    setViewOffset({ x: 0, y: 0 });
    setSelectedPathIds(new Set());
    setIsImageSelected(false);
    setBackgroundImage(null);
    setImageTransform(null);
    setBackgroundImageOpacity(0.5);
    setPendingNavigation(null);
    setIsUnsavedModalOpen(false);

    if (isPrefilled) {
        setInitialPathsOnLoad(JSON.parse(JSON.stringify(glyphData?.paths || [])));
        showNotification(t('compositeGlyphPrefilled'), 'info');
        // Only switch to select tool if it's a multi-component composite
        if (character.composite && character.composite.length > 1) {
            setTimeout(() => setCurrentTool('select'), 0);
        } else {
            // Single-component composites should default to pen mode for editing/adding.
            setCurrentTool('pen');
        }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, glyphData, allCharacterSets, markAttachmentRules, allGlyphData, settings.strokeThickness, metrics, showNotification, t]);


  const hasPathChanges = JSON.stringify(currentPaths) !== JSON.stringify(initialPathsOnLoad);
  const hasBearingChanges = lsb !== character.lsb || rsb !== character.rsb;
  const hasUnsavedChanges = hasPathChanges || hasBearingChanges;

  const handlePathsChange = useCallback((newPaths: Path[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newPaths);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      setCurrentPaths(newPaths);
  }, [history, historyIndex]);
  
  const handleClear = () => {
    handlePathsChange([]);
  };
  
  const handleUndo = useCallback(() => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setCurrentPaths(history[newIndex]);
      }
  }, [history, historyIndex]);
  
  const handleRedo = useCallback(() => {
      if (historyIndex < history.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setCurrentPaths(history[newIndex]);
      }
  }, [history, historyIndex]);
  
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

  const handleSave = useCallback(() => {
    onSave(character.unicode, { paths: currentPaths }, { lsb, rsb });
    setInitialPathsOnLoad(JSON.parse(JSON.stringify(currentPaths)));
    character.lsb = lsb; 
    character.rsb = rsb;
    showNotification(t('saveGlyphSuccess'));
  }, [onSave, character, currentPaths, lsb, rsb, showNotification, t]);

  const handleNavigation = useCallback((targetCharacter: Character) => {
    if (settings.isAutosaveEnabled) {
      if (hasUnsavedChanges) {
        onSave(character.unicode, { paths: currentPaths }, { lsb, rsb });
      }
      onNavigate(targetCharacter);
    } else if (hasUnsavedChanges) {
      setPendingNavigation(targetCharacter);
      setIsUnsavedModalOpen(true);
    } else {
      onNavigate(targetCharacter);
    }
  }, [settings.isAutosaveEnabled, hasUnsavedChanges, onSave, character, currentPaths, lsb, rsb, onNavigate]);

  const handleBackClick = () => {
    setPendingNavigation(null); // Ensure we know the action is to close
    if (settings.isAutosaveEnabled) {
        if (hasUnsavedChanges) {
            onSave(character.unicode, { paths: currentPaths }, { lsb, rsb });
        }
        onClose();
        return;
    }
    if (hasUnsavedChanges) {
        setIsUnsavedModalOpen(true);
    } else {
        onClose();
    }
  };

  const handleConfirmSave = () => {
    handleSave();
    if (pendingNavigation) {
      onNavigate(pendingNavigation);
    } else {
      onClose();
    }
    setIsUnsavedModalOpen(false);
    setPendingNavigation(null);
  };

  const handleConfirmDiscard = () => {
    if (pendingNavigation) {
        onNavigate(pendingNavigation);
    } else {
        onClose();
    }
    setIsUnsavedModalOpen(false);
    setPendingNavigation(null);
  }
  
  const handleCloseUnsavedModal = () => {
    setIsUnsavedModalOpen(false);
    setPendingNavigation(null);
  }

  // --- Image Handlers ---
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
    // Reset file input value to allow re-uploading the same file
    if(imageImportRef.current) imageImportRef.current.value = "";
  };
  
  const handleClearImage = () => {
      setBackgroundImage(null);
      setImageTransform(null);
  };
  
  const handleImageImportClick = () => imageImportRef.current?.click();
  const handleSvgImportClick = () => svgImportRef.current?.click();

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


  // --- Clipboard Handlers ---
  const handleCopy = useCallback(() => {
    if (currentPaths.length === 0) return;
    let pathsToCopy: Path[];

    if (selectedPathIds.size === 0) {
      // If nothing is selected, copy the whole glyph
      pathsToCopy = currentPaths;
      showNotification(t('copiedGlyph'));
    } else {
      // If something is selected, copy only the selection
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
      handlePathsChange(newPaths); // This will update history
      setSelectedPathIds(new Set()); // Clear selection
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

      // Select the newly pasted paths
      const newSelectedIds = new Set(pastedPaths.map(p => p.id));
      setSelectedPathIds(newSelectedIds);
      showNotification(t('pastedSelection'));
  }, [clipboard, currentPaths, handlePathsChange, showNotification, t]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const currentIndex = characterSet.characters.findIndex(c => c.unicode === character.unicode);
  const prevCharacter = currentIndex > 0 ? characterSet.characters[currentIndex - 1] : null;
  const nextCharacter = currentIndex < characterSet.characters.length - 1 ? characterSet.characters[currentIndex + 1] : null;

  // --- KEYBOARD SHORTCUTS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }
      
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCtrlOrCmd = isMac ? e.metaKey : e.ctrlKey;

      let handled = false;

      if (isCtrlOrCmd) {
        switch (e.key.toLowerCase()) {
          case 'z':
            if (e.shiftKey) { if (canRedo) handleRedo(); } 
            else { if (canUndo) handleUndo(); }
            handled = true;
            break;
          case 'c':
            handleCopy();
            handled = true;
            break;
          case 'x':
            if (selectedPathIds.size > 0) handleCut();
            handled = true;
            break;
          case 'v':
            if (clipboard) handlePaste();
            handled = true;
            break;
        }
      } else {
        switch (e.key) {
          case 'ArrowLeft':
            if (prevCharacter) { handleNavigation(prevCharacter); handled = true; }
            break;
          case 'ArrowRight':
            if (nextCharacter) { handleNavigation(nextCharacter); handled = true; }
            break;
          case 'Delete':
          case 'Backspace':
            if (selectedPathIds.size > 0) {
              const newPaths = currentPaths.filter(p => !selectedPathIds.has(p.id));
              handlePathsChange(newPaths);
              setSelectedPathIds(new Set());
              handled = true;
            }
            break;
        }
      }
      
      if (handled) e.preventDefault();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canUndo, canRedo, handleUndo, handleRedo, 
    handleCopy, handleCut, handlePaste, clipboard, selectedPathIds,
    prevCharacter, nextCharacter, handleNavigation, currentPaths, handlePathsChange
  ]);


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
    />
  );
  
  const mainContent = isLargeScreen ? (
    <main className="flex-grow flex flex-row justify-center p-4 gap-4 overflow-hidden bg-gray-100 dark:bg-black/20">
      <div className="flex flex-col justify-center">
        <DrawingToolbar
          currentTool={currentTool}
          setCurrentTool={setCurrentTool}
          settings={settings}
          isLargeScreen={isLargeScreen}
          onUndo={handleUndo}
          canUndo={canUndo}
          onRedo={handleRedo}
          canRedo={canRedo}
          onCut={handleCut}
          selectedPathIds={selectedPathIds}
          onCopy={handleCopy}
          onPaste={handlePaste}
          clipboard={clipboard}
          onZoom={handleZoom}
          onImageImportClick={handleImageImportClick}
          onSvgImportClick={handleSvgImportClick}
          calligraphyAngle={calligraphyAngle}
          setCalligraphyAngle={setCalligraphyAngle}
        />
      </div>
      <div className="flex-1 min-w-0 min-h-0 flex justify-center items-center">
        <div className="rounded-md overflow-hidden shadow-lg aspect-square max-w-full max-h-full">
          {canvasComponent}
        </div>
      </div>
    </main>
  ) : (
    <main className="flex-grow flex flex-col p-4 gap-4 overflow-hidden bg-gray-100 dark:bg-black/20">
      <DrawingToolbar
        currentTool={currentTool}
        setCurrentTool={setCurrentTool}
        settings={settings}
        isLargeScreen={isLargeScreen}
        onUndo={handleUndo}
        canUndo={canUndo}
        onRedo={handleRedo}
        canRedo={canRedo}
        onCut={handleCut}
        selectedPathIds={selectedPathIds}
        onCopy={handleCopy}
        onPaste={handlePaste}
        clipboard={clipboard}
        onZoom={handleZoom}
        onImageImportClick={handleImageImportClick}
        onSvgImportClick={handleSvgImportClick}
        calligraphyAngle={calligraphyAngle}
        setCalligraphyAngle={setCalligraphyAngle}
      />
      <div className="flex-1 min-h-0 w-full flex justify-center items-center">
        <div className="rounded-md overflow-hidden shadow-lg aspect-square max-w-full max-h-full">
          {canvasComponent}
        </div>
      </div>
    </main>
  );

  return (
    <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col">
      <input type="file" ref={imageImportRef} onChange={handleImageImport} className="hidden" accept="image/png, image/jpeg, image/gif, image/bmp" />
      <input type="file" ref={svgImportRef} onChange={handleSvgImport} className="hidden" accept="image/svg+xml" />

      <DrawingModalHeader
        character={character}
        prevCharacter={prevCharacter}
        nextCharacter={nextCharacter}
        onBackClick={handleBackClick}
        onNavigate={handleNavigation}
        settings={settings}
        metrics={metrics}
        lsb={lsb}
        setLsb={setLsb}
        rsb={rsb}
        setRsb={setRsb}
        onDeleteClick={() => setIsDeleteConfirmOpen(true)}
        onClear={handleClear}
        onSave={handleSave}
      />

      {mainContent}

      <ImageControlPanel
        backgroundImage={backgroundImage}
        backgroundImageOpacity={backgroundImageOpacity}
        setBackgroundImageOpacity={setBackgroundImageOpacity}
        onClearImage={handleClearImage}
      />

      <UnsavedChangesModal
        isOpen={isUnsavedModalOpen}
        onClose={handleCloseUnsavedModal}
        onSave={handleConfirmSave}
        onDiscard={handleConfirmDiscard}
      />

      <DeleteConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => {
            onDelete(character.unicode);
            setIsDeleteConfirmOpen(false);
        }}
        character={character}
        isStandardGlyph={!character.isCustom}
      />
      
    </div>
  );
};

export default React.memo(DrawingModal);