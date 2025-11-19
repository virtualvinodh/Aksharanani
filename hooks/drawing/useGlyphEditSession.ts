
import { useState, useEffect, useRef, useCallback } from 'react';
import { Path, Character, GlyphData, AppSettings, FontMetrics, MarkAttachmentRules, CharacterSet } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import { isGlyphDrawn } from '../../utils/glyphUtils';
import { generateCompositeGlyphData } from '../../services/glyphRenderService';

interface UseGlyphEditSessionProps {
    character: Character;
    glyphData: GlyphData | undefined;
    allGlyphData: Map<number, GlyphData>;
    allCharacterSets: CharacterSet[];
    settings: AppSettings;
    metrics: FontMetrics;
    markAttachmentRules: MarkAttachmentRules | null;
    onSave: (unicode: number, newGlyphData: GlyphData, newBearings: { lsb?: number, rsb?: number }, onSuccess: () => void) => void;
    onNavigate: (character: Character) => void;
    onClose: () => void;
}

export const useGlyphEditSession = ({
    character,
    glyphData,
    allGlyphData,
    allCharacterSets,
    settings,
    metrics,
    markAttachmentRules,
    onSave,
    onNavigate,
    onClose
}: UseGlyphEditSessionProps) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();

    const [currentPaths, setCurrentPaths] = useState<Path[]>([]);
    const [initialPathsOnLoad, setInitialPathsOnLoad] = useState<Path[]>([]);
    const [history, setHistory] = useState<Path[][]>([[]]);
    const [historyIndex, setHistoryIndex] = useState(0);
    
    const [lsb, setLsb] = useState<number | undefined>(character.lsb);
    const [rsb, setRsb] = useState<number | undefined>(character.rsb);

    const [isTransitioning, setIsTransitioning] = useState(false);
    const prevCharUnicodeRef = useRef<number | undefined>(undefined);
    
    // Ref for autosave timer
    const autosaveTimeout = useRef<number | null>(null);
    
    // Navigation State
    const [pendingNavigation, setPendingNavigation] = useState<Character | null>(null);
    const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);

    // --- INITIALIZATION & LOADING ---
    useEffect(() => {
        const characterChanged = prevCharUnicodeRef.current !== character.unicode;
      
        const performUpdate = () => {
            // Clear any pending autosave when switching characters
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
                autosaveTimeout.current = null;
            }

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
            
            setLsb(character.lsb); 
            setRsb(character.rsb);
            
            if (isPrefilled && !character.link) {
                const componentNames = (character.composite || []).join(' + ');
                showNotification(t('compositeGlyphPrefilled', { components: componentNames }), 'info');
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
      
    }, [character, glyphData, allCharacterSets, markAttachmentRules, allGlyphData, settings.isPrefillEnabled, metrics, showNotification, t]);


    // --- SAVING ---
    const handleSave = useCallback((pathsToSave: Path[] = currentPaths) => {
        if (character.unicode === undefined) return;
        const onSuccess = () => {
            setInitialPathsOnLoad(JSON.parse(JSON.stringify(pathsToSave)));
        };
        onSave(character.unicode, { paths: pathsToSave }, { lsb, rsb }, onSuccess);
    }, [onSave, character.unicode, currentPaths, lsb, rsb]);

    // --- HISTORY MANAGEMENT ---
    const handlePathsChange = useCallback((newPaths: Path[]) => {
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newPaths);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setCurrentPaths(newPaths);

        // Autosave Logic - Disabling it for now - It is annoying that glyph saved message pops up constanlty
         if (settings.isAutosaveEnabled) {
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
            autosaveTimeout.current = window.setTimeout(() => {
                handleSave(newPaths);
            }, 500);
        } 
    }, [history, historyIndex, settings.isAutosaveEnabled, handleSave]);

    const undo = useCallback(() => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            const newPaths = history[newIndex];
            setCurrentPaths(newPaths);
            
            if (settings.isAutosaveEnabled) {
                if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
                autosaveTimeout.current = window.setTimeout(() => handleSave(newPaths), 500);
            }
        }
    }, [history, historyIndex, settings.isAutosaveEnabled, handleSave]);
    
    const redo = useCallback(() => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            const newPaths = history[newIndex];
            setCurrentPaths(newPaths);
            
            if (settings.isAutosaveEnabled) {
                if (autosaveTimeout.current) clearTimeout(autosaveTimeout.current);
                autosaveTimeout.current = window.setTimeout(() => handleSave(newPaths), 500);
            }
        }
    }, [history, historyIndex, settings.isAutosaveEnabled, handleSave]);

    const canUndo = historyIndex > 0;
    const canRedo = historyIndex < history.length - 1;

    // --- DIRTY STATE ---
    const hasPathChanges = JSON.stringify(currentPaths) !== JSON.stringify(initialPathsOnLoad);
    const hasBearingChanges = lsb !== character.lsb || rsb !== character.rsb;
    const hasUnsavedChanges = hasPathChanges || hasBearingChanges;

    // --- NAVIGATION INTERCEPTION ---
    const handleNavigationAttempt = useCallback((targetCharacter: Character | null) => {
        // targetCharacter === null means "Back" or "Close"
        
        const proceed = () => {
            if (targetCharacter) onNavigate(targetCharacter);
            else onClose();
        };

        if (settings.isAutosaveEnabled) {
            if (hasUnsavedChanges) handleSave();
            proceed();
        } else if (hasUnsavedChanges) {
            setPendingNavigation(targetCharacter); 
            setIsUnsavedModalOpen(true);
        } else {
            proceed();
        }
    }, [settings.isAutosaveEnabled, hasUnsavedChanges, handleSave, onNavigate, onClose]);

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
    };

    const handleRefresh = useCallback(() => {
        const allCharsByName = new Map<string, Character>();
        allCharacterSets.flatMap(set => set.characters).forEach(char => allCharsByName.set(char.name, char));
        
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
            handlePathsChange(compositeGlyphData.paths);
            setInitialPathsOnLoad(JSON.parse(JSON.stringify(compositeGlyphData.paths)));
        }
        showNotification(t('glyphRefreshedSuccess'), 'info');
      }, [character, allCharacterSets, allGlyphData, settings, metrics, markAttachmentRules, handlePathsChange, showNotification, t]);

    // Clean up timeout on unmount
    useEffect(() => {
        return () => {
            if (autosaveTimeout.current) {
                clearTimeout(autosaveTimeout.current);
            }
        };
    }, []);

    return {
        currentPaths,
        handlePathsChange,
        undo,
        redo,
        canUndo,
        canRedo,
        lsb,
        setLsb,
        rsb,
        setRsb,
        isTransitioning,
        hasUnsavedChanges,
        handleSave,
        handleRefresh,
        handleNavigationAttempt,
        // Unsaved Changes Modal Props
        isUnsavedModalOpen,
        closeUnsavedModal: () => setIsUnsavedModalOpen(false),
        confirmSave: handleConfirmSave,
        confirmDiscard: handleConfirmDiscard
    };
};
