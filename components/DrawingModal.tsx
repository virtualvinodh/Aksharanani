

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { Character, GlyphData, Path, FontMetrics, Tool, AppSettings, CharacterSet, ImageTransform, Point, MarkAttachmentRules, Segment } from '../types';
import DrawingCanvas from './DrawingCanvas';
import { DRAWING_CANVAS_SIZE, LockClosedIcon, LockOpenIcon } from '../constants';
import { useLocale } from '../contexts/LocaleContext';
import UnsavedChangesModal from './UnsavedChangesModal';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { useMediaQuery } from '../hooks/useMediaQuery';
import DrawingModalHeader from './DrawingModalHeader';
import DrawingToolbar from './DrawingToolbar';
import ImageControlPanel from './ImageControlPanel';
import { useClipboard } from '../contexts/ClipboardContext';
import { useLayout } from '../contexts/LayoutContext';
import { generateCompositeGlyphData } from '../services/glyphRenderService';
import { VEC } from '../utils/vectorUtils';
import { isGlyphDrawn } from '../utils/glyphUtils';
import Modal from './Modal';
import { SpinnerIcon } from '../constants';
import { traceImageToSVG } from '../services/imageTracerService';

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
  onUnlockGlyph: (unicode: number) => void;
}

const DrawingModal: React.FC<DrawingModalProps> = ({ character, characterSet, glyphData, onSave, onClose, onDelete, onNavigate, settings, metrics, allGlyphData, allCharacterSets, gridConfig, markAttachmentRules, onUnlockGlyph }) => {
  const [currentPaths, setCurrentPaths] = useState<Path[]>([]);
  const [initialPathsOnLoad, setInitialPathsOnLoad] = useState<Path[]>([]);
  const [history, setHistory] = useState<Path[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [currentTool, setCurrentTool] = useState<Tool>('pen');
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<Character | null>(null);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isUnlockConfirmOpen, setIsUnlockConfirmOpen] = useState(false);

  const { t } = useLocale();
  const { showNotification, modalOriginRect } = useLayout();
  const { clipboard, dispatch: clipboardDispatch } = useClipboard();
  
  const [zoom, setZoom] = useState(1);
  const [viewOffset, setViewOffset] = useState<Point>({ x: 0, y: 0 });
  const [selectedPathIds, setSelectedPathIds] = useState<Set<string>>(new Set());
  const [isImageSelected, setIsImageSelected] = useState(false);
  
  const [animationClass, setAnimationClass] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<number | null>(null);

  // Image state
  const imageImportRef = useRef<HTMLInputElement>(null);
  const svgImportRef = useRef<HTMLInputElement>(null);
  const imageTraceRef = useRef<HTMLInputElement>(null);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(0.5);
  const [imageTransform, setImageTransform] = useState<ImageTransform | null>(null);
  
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  
  // LSB/RSB state
  const [lsb, setLsb] = useState<number | undefined>(character.lsb);
  const [rsb, setRsb] = useState<number | undefined>(character.rsb);
  
  // Calligraphy state
  const [calligraphyAngle, setCalligraphyAngle] = useState<45 | 30 | 15>(45);
  
  // State for seamless navigation transition
  const prevCharUnicodeRef = useRef<number | undefined>(undefined);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const [isLocked, setIsLocked] = useState(false);

  const isInitiallyDrawn = useMemo(() => isGlyphDrawn(glyphData), [glyphData]);

  // Image Tracer Modal State
  const [isTracerModalOpen, setIsTracerModalOpen] = useState(false);
  const [tracerImageSrc, setTracerImageSrc] = useState<string | null>(null);
  const [tracerPreview, setTracerPreview] = useState<string | null>(null);
  const [isTracing, setIsTracing] = useState(false);
  const [traceOptions, setTraceOptions] = useState({ ltres: 1, qtres: 1, pathomit: 8 });
  const [traceRemoveBackground, setTraceRemoveBackground] = useState(true);
  const traceTimeoutRef = useRef<number | null>(null);


  const generateId = () => `${Date.now()}-${Math.random()}`;

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
            setAnimationClass(''); // Remove class after animation to prevent re-triggering
        }, 300);
    }
    return () => {
        if (animationTimeoutRef.current) clearTimeout(animationTimeoutRef.current);
    };
  // Rerun animation logic only when the character (and thus the origin rect) changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOriginRect, character.unicode]);
  
  // This effect sets the initial lock state and shows the notification, but ONLY when the character changes.
  useEffect(() => {
    const isLinked = !!character.link;
    setIsLocked(isLinked);
    if (isLinked) {
        showNotification(t('linkedGlyphLocked'), 'info');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character.unicode]); 

  useEffect(() => {
    const characterChanged = prevCharUnicodeRef.current !== character.unicode;
  
    const performUpdate = () => {
        const loadedPaths = glyphData?.paths || [];
        let isPrefilled = false;

        const allCharsByName = new Map<string, Character>();
        allCharacterSets.flatMap(set => set.characters).forEach(char => allCharsByName.set(char.name, char));

        const prefillSource = character.link || character.composite;
        const isPrefillEnabled = settings.isPrefillEnabled !== false;

        if (isPrefillEnabled && prefillSource && !isGlyphDrawn(glyphData)) {
            const compositeGlyphData = generateCompositeGlyphData({
                character,
                allCharsByName,
                allGlyphData,
                settings,
                metrics,
                markAttachmentRules,
                allCharacterSets
            });
            
            if (compositeGlyphData) {
                isPrefilled = true;
                setCurrentPaths(compositeGlyphData.paths);
                setHistory([compositeGlyphData.paths]);
                setHistoryIndex(0);
            }
        }
        
        if (!isPrefilled) {
            setInitialPathsOnLoad(JSON.parse(JSON.stringify(loadedPaths)));
            setCurrentPaths(loadedPaths);
            setHistory([loadedPaths]);
            setHistoryIndex(0);
        }
        
        // Determine the correct tool after loading paths
        if (character.link) {
            setCurrentTool('select');
        } else if (isPrefilled) {
            if (prefillSource && prefillSource.length > 1) {
                setTimeout(() => {
                    setCurrentTool('select');
                }, 0);
            } else {
                setCurrentTool('pen');
            }
        } else {
            setCurrentTool('pen');
        }
        
        setLsb(character.lsb); setRsb(character.rsb); setZoom(1); setViewOffset({ x: 0, y: 0 }); setSelectedPathIds(new Set()); setIsImageSelected(false);
        setBackgroundImage(null); setImageTransform(null); setBackgroundImageOpacity(0.5); setPendingNavigation(null); setIsUnsavedModalOpen(false);
        if (isPrefilled && !character.link) {
            setInitialPathsOnLoad(JSON.parse(JSON.stringify(glyphData?.paths || [])));
            showNotification(t('compositeGlyphPrefilled'), 'info');
        }
    };
    
    if (prevCharUnicodeRef.current !== undefined && characterChanged) {
        setIsTransitioning(true);
        setTimeout(() => {
            performUpdate();
            setTimeout(() => setIsTransitioning(false), 50);
        }, 150);
    } else {
        performUpdate();
    }

    prevCharUnicodeRef.current = character.unicode;
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character, glyphData, allCharacterSets, markAttachmentRules, allGlyphData, settings.isPrefillEnabled, settings.strokeThickness, metrics, showNotification, t]);

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

  const handleNavigation = useCallback((targetCharacter: Character) => {
    const navigateAction = () => onNavigate(targetCharacter);
    if (settings.isAutosaveEnabled) {
      if (hasUnsavedChanges) {
        handleSave();
      }
      navigateAction();
    } else if (hasUnsavedChanges) {
      setPendingNavigation(targetCharacter);
      setIsUnsavedModalOpen(true);
    } else {
      navigateAction();
    }
  }, [settings.isAutosaveEnabled, hasUnsavedChanges, handleSave, onNavigate]);

  const handleBackClick = () => {
    setPendingNavigation(null); // Ensure we know the action is to close
    if (settings.isAutosaveEnabled) {
        if (hasUnsavedChanges) {
            handleSave();
        }
        triggerClose(onClose);
        return;
    }
    if (hasUnsavedChanges) {
        setIsUnsavedModalOpen(true);
    } else {
        triggerClose(onClose);
    }
  };

  const handleConfirmSave = () => {
    handleSave();
    if (pendingNavigation) {
      onNavigate(pendingNavigation);
    } else {
      triggerClose(onClose);
    }
    setIsUnsavedModalOpen(false);
    setPendingNavigation(null);
  };

  const handleConfirmDiscard = () => {
    if (pendingNavigation) {
        onNavigate(pendingNavigation);
    } else {
        triggerClose(onClose);
    }
    setIsUnsavedModalOpen(false);
    setPendingNavigation(null);
  };
  
  const handleCloseUnsavedModal = () => {
    setIsUnsavedModalOpen(false);
    setPendingNavigation(null);
  };

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

  const handleImageTraceClick = () => imageTraceRef.current?.click();

  const handleImageTraceFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const imgSrc = e.target?.result as string;
        setTracerImageSrc(imgSrc);
        setTracerPreview(null);
        setIsTracerModalOpen(true);
    };
    reader.readAsDataURL(file);
    if (imageTraceRef.current) imageTraceRef.current.value = "";
  };

  useEffect(() => {
    if (!isTracerModalOpen || !tracerImageSrc) return;
    
    let isCancelled = false;
    setIsTracing(true);
    if (traceTimeoutRef.current) clearTimeout(traceTimeoutRef.current);

    traceTimeoutRef.current = window.setTimeout(async () => {
        try {
            const svgString = await traceImageToSVG(tracerImageSrc, traceOptions, traceRemoveBackground);
            if (!isCancelled) {
                setTracerPreview(svgString);
            }
        } catch (error) {
            if (!isCancelled) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown tracing error';
                showNotification(errorMessage, 'error');
            }
        } finally {
            if (!isCancelled) {
                setIsTracing(false);
            }
        }
    }, 300); // Debounce tracing

    return () => {
        isCancelled = true;
        if (traceTimeoutRef.current) clearTimeout(traceTimeoutRef.current);
    };
  }, [isTracerModalOpen, tracerImageSrc, traceOptions, traceRemoveBackground, showNotification]);

  const handleInsertTracedSVG = () => {
    if (!tracerPreview) return;

    const paperScope = new paper.PaperScope();
    paperScope.setup(new paper.Size(DRAWING_CANVAS_SIZE, DRAWING_CANVAS_SIZE));
    const importedItem = paperScope.project.importSVG(tracerPreview, { expandShapes: true });

    if (!importedItem || importedItem.bounds.width === 0 || importedItem.bounds.height === 0) {
        showNotification(t('errorInvalidSvg'), 'error');
        setIsTracerModalOpen(false);
        return;
    }

    const bounds = importedItem.bounds;
    const availableHeight = metrics.baseLineY - metrics.topLineY;
    const scale = availableHeight / bounds.height;
    importedItem.scale(scale, new paper.Point(0, 0));
    const newBounds = importedItem.bounds;
    const targetCenter = { x: DRAWING_CANVAS_SIZE / 2, y: metrics.topLineY + availableHeight / 2 };
    const translation = VEC.sub(targetCenter, { x: newBounds.center.x, y: newBounds.center.y });
    importedItem.translate(new paper.Point(translation.x, translation.y));
    const newPaths: Path[] = [];
    const extractPaths = (item: any) => {
        if (item.className === 'CompoundPath') {
            const segmentGroups: Segment[][] = item.children.map((child: any) => child.segments.map((seg: any) => ({ point: { x: seg.point.x, y: seg.point.y }, handleIn: { x: seg.handleIn.x, y: seg.handleIn.y }, handleOut: { x: seg.handleOut.x, y: seg.handleOut.y } })));
            newPaths.push({ id: generateId(), type: 'outline', points: [], segmentGroups: segmentGroups });
        } else if (item.className === 'Path') {
            const segments: Segment[] = item.segments.map((seg: any) => ({ point: { x: seg.point.x, y: seg.point.y }, handleIn: { x: seg.handleIn.x, y: seg.handleIn.y }, handleOut: { x: seg.handleOut.x, y: seg.handleOut.y } }));
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
    setIsTracerModalOpen(false);
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

  // --- Grouping Handlers ---
  const handleGroup = useCallback(() => {
    const newGroupId = generateId();
    const newPaths = currentPaths.map(p => {
        if (selectedPathIds.has(p.id)) {
            return { ...p, groupId: newGroupId };
        }
        return p;
    });
    handlePathsChange(newPaths);
    showNotification(t('groupedSuccess'));
  }, [currentPaths, selectedPathIds, handlePathsChange, showNotification, t]);

  const handleUngroup = useCallback(() => {
    const affectedGroupIds = new Set<string>();
    currentPaths.forEach(p => {
        if (selectedPathIds.has(p.id) && p.groupId) {
            affectedGroupIds.add(p.groupId);
        }
    });

    const newPaths = currentPaths.map(p => {
        if (p.groupId && affectedGroupIds.has(p.groupId)) {
            const { groupId, ...rest } = p;
            return rest;
        }
        return p;
    });
    handlePathsChange(newPaths);
    showNotification(t('ungroupedSuccess'));
  }, [currentPaths, selectedPathIds, handlePathsChange, showNotification, t]);
  
  const canGroup = useMemo(() => {
      if (selectedPathIds.size < 2) return false;
      const selectedPaths = currentPaths.filter(p => selectedPathIds.has(p.id));
      const firstGroupId = selectedPaths[0].groupId;
      // Enable grouping if there's no group ID, or if not all selected paths share the same group ID.
      return !firstGroupId || selectedPaths.some(p => p.groupId !== firstGroupId);
  }, [selectedPathIds, currentPaths]);

  const canUngroup = useMemo(() => {
      if (selectedPathIds.size === 0) return false;
      return currentPaths.some(p => selectedPathIds.has(p.id) && p.groupId);
  }, [selectedPathIds, currentPaths]);


  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const visibleCharactersForNav = useMemo(() => characterSet.characters.filter(c => !c.hidden), [characterSet]);
  const currentIndex = visibleCharactersForNav.findIndex(c => c.unicode === character.unicode);
  const prevCharacter = currentIndex > 0 ? visibleCharactersForNav[currentIndex - 1] : null;
  const nextCharacter = currentIndex < visibleCharactersForNav.length - 1 ? visibleCharactersForNav[currentIndex + 1] : null;
  
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
            if (selectedPathIds.size > 0) {
              moveSelection({ x: e.shiftKey ? -10 : -1, y: 0 });
              handled = true;
            } else if (prevCharacter) {
              handleNavigation(prevCharacter);
              handled = true;
            }
            break;
          case 'ArrowRight':
            if (selectedPathIds.size > 0) {
              moveSelection({ x: e.shiftKey ? 10 : 1, y: 0 });
              handled = true;
            } else if (nextCharacter) {
              handleNavigation(nextCharacter);
              handled = true;
            }
            break;
          case 'ArrowUp':
            if (selectedPathIds.size > 0) {
              moveSelection({ x: 0, y: e.shiftKey ? -10 : -1 });
              handled = true;
            }
            break;
          case 'ArrowDown':
            if (selectedPathIds.size > 0) {
              moveSelection({ x: 0, y: e.shiftKey ? 10 : 1 });
              handled = true;
            }
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
    prevCharacter, nextCharacter, handleNavigation, currentPaths, handlePathsChange,
    moveSelection
  ]);

  const handleUnlock = () => {
    setIsUnlockConfirmOpen(true);
  };

  const handleConfirmUnlock = () => {
    onUnlockGlyph(character.unicode);
    setIsLocked(false);
    setIsUnlockConfirmOpen(false);
    showNotification(t('glyphUnlockedSuccess'), 'success');
  };

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

  const mainContent = isLargeScreen ? (
    <main className={`${mainContentClasses} flex flex-row justify-center p-4 gap-4`}>
      <div className="flex flex-col justify-center">
        <DrawingToolbar
          character={character}
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
          onGroup={handleGroup}
          canGroup={canGroup}
          onUngroup={handleUngroup}
          canUngroup={canUngroup}
          onZoom={handleZoom}
          onImageImportClick={handleImageImportClick}
          onSvgImportClick={handleSvgImportClick}
          onImageTraceClick={handleImageTraceClick}
          calligraphyAngle={calligraphyAngle}
          setCalligraphyAngle={setCalligraphyAngle}
          isLocked={isLocked}
          onUnlockClick={handleUnlock}
        />
      </div>
      <div className="flex-1 min-w-0 min-h-0 flex justify-center items-center">
        <div className="rounded-md overflow-hidden shadow-lg aspect-square max-w-full max-h-full">
          {canvasComponent}
        </div>
      </div>
    </main>
  ) : (
    <main className={`${mainContentClasses} flex flex-col p-4 gap-4`}>
      <DrawingToolbar
        character={character}
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
        onGroup={handleGroup}
        canGroup={canGroup}
        onUngroup={handleUngroup}
        canUngroup={canUngroup}
        onZoom={handleZoom}
        onImageImportClick={handleImageImportClick}
        onSvgImportClick={handleSvgImportClick}
        onImageTraceClick={handleImageTraceClick}
        calligraphyAngle={calligraphyAngle}
        setCalligraphyAngle={setCalligraphyAngle}
        isLocked={isLocked}
        onUnlockClick={handleUnlock}
      />
      <div className="flex-1 min-h-0 w-full flex justify-center items-center">
        <div className="rounded-md overflow-hidden shadow-lg aspect-square max-w-full max-h-full">
          {canvasComponent}
        </div>
      </div>
    </main>
  );

  return (
    <div ref={modalRef} className={`fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col ${animationClass}`}>
      <input type="file" ref={imageImportRef} onChange={handleImageImport} className="hidden" accept="image/png, image/jpeg, image/gif, image/bmp" />
      <input type="file" ref={svgImportRef} onChange={handleSvgImport} className="hidden" accept="image/svg+xml" />
      <input type="file" ref={imageTraceRef} onChange={handleImageTraceFileChange} className="hidden" accept="image/png, image/jpeg, image/gif, image/bmp" />

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

      <Modal
        isOpen={isUnlockConfirmOpen}
        onClose={() => setIsUnlockConfirmOpen(false)}
        title={t('unlockGlyphTitle')}
        titleClassName="text-yellow-600 dark:text-yellow-400"
        footer={<>
            <button onClick={() => setIsUnlockConfirmOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors">{t('cancel')}</button>
            <button onClick={handleConfirmUnlock} className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">{t('unlock')}</button>
        </>}
      >
        <p>{t('unlockGlyphMessage')}</p>
      </Modal>

        {isTracerModalOpen && (
            <Modal
                isOpen={isTracerModalOpen}
                onClose={() => setIsTracerModalOpen(false)}
                title={t('traceImageTitle')}
                size="xl"
                footer={<>
                    <button onClick={() => setIsTracerModalOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg">{t('cancel')}</button>
                    <button onClick={handleInsertTracedSVG} disabled={isTracing || !tracerPreview} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg disabled:bg-indigo-400">{t('insertAsVectorPath')}</button>
                </>}
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border p-2 rounded-md dark:border-gray-700">
                        <h4 className="font-semibold mb-2">{t('originalImage')}</h4>
                        <img src={tracerImageSrc || ''} alt="Original for tracing" className="w-full h-auto object-contain max-h-64" />
                    </div>
                    <div className="border p-2 rounded-md dark:border-gray-700">
                        <h4 className="font-semibold mb-2">{t('livePreview')}</h4>
                        <div className="w-full h-64 bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
                            {isTracing ? <SpinnerIcon /> : (tracerPreview && <div className="w-full h-full" dangerouslySetInnerHTML={{ __html: tracerPreview }} />)}
                        </div>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="text-sm font-medium">{t('detailLevel')}: {traceOptions.ltres}</label>
                        <input type="range" min="0" max="10" step="0.5" value={traceOptions.ltres} onChange={e => setTraceOptions(o => ({...o, ltres: parseFloat(e.target.value)}))} className="w-full accent-indigo-600" />
                    </div>
                    <div>
                        <label className="text-sm font-medium">{t('noiseReduction')}: {traceOptions.qtres}</label>
                        <input type="range" min="0" max="10" step="0.5" value={traceOptions.qtres} onChange={e => setTraceOptions(o => ({...o, qtres: parseFloat(e.target.value)}))} className="w-full accent-indigo-600" />
                    </div>
                    <div>
                        <label className="text-sm font-medium">{t('cornerSmoothing')}: {traceOptions.pathomit}</label>
                        <input type="range" min="0" max="16" step="1" value={traceOptions.pathomit} onChange={e => setTraceOptions(o => ({...o, pathomit: parseInt(e.target.value)}))} className="w-full accent-indigo-600" />
                    </div>
                </div>
                <div className="mt-4">
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                        <input
                            type="checkbox"
                            checked={traceRemoveBackground}
                            onChange={e => setTraceRemoveBackground(e.target.checked)}
                            className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600"
                        />
                        <span>{t('removeWhiteBackground')}</span>
                    </label>
                </div>
            </Modal>
        )}
      
    </div>
  );
};

export default React.memo(DrawingModal);