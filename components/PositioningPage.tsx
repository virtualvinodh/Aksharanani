





import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { CopyIcon, LeftArrowIcon, RightArrowIcon } from '../constants';
import CombinationCard from './CombinationCard';
import { AppSettings, Character, CharacterSet, FontMetrics, GlyphData, MarkAttachmentRules, MarkPositioningMap, Path, Point, PositioningRules, AttachmentClass } from '../types';
import PositioningEditorPage from './PositioningEditorPage';
import { usePositioning } from '../contexts/PositioningContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useCharacter } from '../contexts/CharacterContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { useHorizontalScroll } from '../hooks/useHorizontalScroll';
import { getGlyphBBoxOfPoints, calculateDefaultMarkOffset } from '../services/glyphRenderService';
import { updatePositioningAndCascade } from '../services/positioningService';


// Main Positioning Page Component
interface PositioningPageProps {
    positioningRules: PositioningRules[] | null;
    markAttachmentRules: MarkAttachmentRules | null;
    markAttachmentClasses: AttachmentClass[] | null;
    baseAttachmentClasses: AttachmentClass[] | null;
    fontRules: any;
}

const PositioningPage: React.FC<PositioningPageProps> = ({
    positioningRules, markAttachmentRules, fontRules, markAttachmentClasses, baseAttachmentClasses
}) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const { glyphDataMap, dispatch: glyphDataDispatch } = useGlyphData();
    const { markPositioningMap, dispatch: positioningDispatch } = usePositioning();
    const { characterSets, dispatch: characterDispatch } = useCharacter();
    const { settings, metrics } = useSettings();

    const [viewBy, setViewBy] = useState<'base' | 'mark'>('base');
    const [activeTab, setActiveTab] = useState(0);
    const [editingPair, setEditingPair] = useState<{ base: Character, mark: Character, ligature: Character } | null>(null);
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [isReuseModalOpen, setIsReuseModalOpen] = useState(false);
    const [reuseSourceItem, setReuseSourceItem] = useState<Character | null>(null);
    
    const navContainerRef = useRef<HTMLDivElement>(null);
    const { visibility: showNavArrows, handleScroll } = useHorizontalScroll(navContainerRef);
    
    const allChars = useMemo<Map<string, Character>>(() => new Map(characterSets!.flatMap(set => set.characters).map(char => [char.name, char])), [characterSets]);

    const positioningData = useMemo(() => {
        const newLigaturesByKey = new Map<string, Character>();

        let puaCounter = 0xE000 - 1;
        characterSets!.forEach(set => {
            set.characters.forEach(char => {
                if (char.unicode >= 0xE000 && char.unicode <= 0xF8FF) {
                    puaCounter = Math.max(puaCounter, char.unicode);
                }
            });
        });

        const rulesLigas = { 
            ...(fontRules?.tml2?.abvs?.liga || {}), 
            ...(fontRules?.tml2?.psts?.liga || {}), 
            ...(fontRules?.tml2?.haln?.liga || {}) 
        };

        const componentsToLigs = new Map<string, string>();
        for (const ligName in rulesLigas) {
            const components = rulesLigas[ligName];
            if (Array.isArray(components) && components.length === 2) {
                componentsToLigs.set(components.join('-'), ligName);
            }
        }
        
        if (positioningRules) {
            for (const rule of positioningRules) {
                const allPossibleMarks = rule.mark || [];
                for (const baseName of rule.base) {
                    for (const markName of allPossibleMarks) {
                        const baseChar = allChars.get(baseName);
                        const markChar = allChars.get(markName);

                        if (!baseChar || !markChar) continue;

                        const pairKey = `${baseChar.unicode}-${markChar.unicode}`;
                        
                        let targetLigature: Character | undefined;
                        let targetLigatureName: string | undefined;

                        // 1. Check ligatureMap for an explicit name.
                        targetLigatureName = rule.ligatureMap?.[baseName]?.[markName];
                        
                        // 2. If not found, check font rules for a pre-defined ligature.
                        if (!targetLigatureName) {
                            const componentKey = `${baseChar.name}-${markChar.name}`;
                            targetLigatureName = componentsToLigs.get(componentKey);
                        }

                        // 3. If a name is found (from either source), try to find the character.
                        if (targetLigatureName) {
                            targetLigature = allChars.get(targetLigatureName);
                        }

                        // 4. If no character was found by name, fall back to default behavior
                        //    or create a new PUA character if an explicit name was given.
                        if (!targetLigature) {
                            // Use the explicit name if provided, otherwise concatenate
                            const finalLigatureName = targetLigatureName || (baseChar.name + markChar.name);
                            const existingChar = allChars.get(finalLigatureName);

                            if (existingChar) {
                                targetLigature = existingChar;
                            } else {
                                // Create a new PUA character.
                                puaCounter++;
                                targetLigature = {
                                    name: finalLigatureName,
                                    unicode: puaCounter,
                                    glyphClass: 'ligature',
                                    composite: [baseName, markName]
                                };
                            }
                        }

                        if (targetLigature) {
                            newLigaturesByKey.set(pairKey, targetLigature);
                        }
                    }
                }
            }
        }
        return { allLigaturesByKey: newLigaturesByKey };

    }, [characterSets, allChars, positioningRules, fontRules]);
    
    const isGlyphDrawn = useCallback((char: Character): boolean => {
        const glyph = glyphDataMap.get(char.unicode);
        return !!(glyph && glyph.paths.length > 0 && glyph.paths.some(p => p.points.length > 0));
    }, [glyphDataMap]);
    
    const navItems = useMemo(() => {
        if (!positioningRules) return [];
        const items = new Map<number, Character>();
        
        const sourceSet = viewBy === 'base'
            ? new Set(positioningRules.flatMap(r => r.base))
            : new Set(positioningRules.flatMap(r => r.mark));

        sourceSet.forEach(name => {
            const char = allChars.get(name);
            if (char && isGlyphDrawn(char)) {
                items.set(char.unicode, char);
            }
        });

        return Array.from(items.values()).sort((a, b) => a.unicode - b.unicode);
    }, [positioningRules, allChars, viewBy, isGlyphDrawn]);

    useEffect(() => {
        setActiveTab(0);
    }, [viewBy]);
    
    const activeItem = navItems[activeTab];

    const displayedCombinations = useMemo(() => {
        if (!activeItem || !positioningRules) return [];
    
        const combinations: { base: Character; mark: Character; ligature: Character }[] = [];
        const addedLigatures = new Set<number>();
    
        for (const rule of positioningRules) {
            const ruleBases = rule.base || [];
            const ruleMarks = rule.mark || [];
    
            if (viewBy === 'base' && ruleBases.includes(activeItem.name)) {
                for (const markName of ruleMarks) {
                    const markChar = allChars.get(markName);
                    if (markChar) {
                        const ligature = positioningData.allLigaturesByKey.get(`${activeItem.unicode}-${markChar.unicode}`);
                        if (ligature && !addedLigatures.has(ligature.unicode)) {
                            combinations.push({ base: activeItem, mark: markChar, ligature });
                            addedLigatures.add(ligature.unicode);
                        }
                    }
                }
            } else if (viewBy === 'mark' && ruleMarks.includes(activeItem.name)) {
                for (const baseName of ruleBases) {
                    const baseChar = allChars.get(baseName);
                    if (baseChar) {
                        const ligature = positioningData.allLigaturesByKey.get(`${baseChar.unicode}-${activeItem.unicode}`);
                        if (ligature && !addedLigatures.has(ligature.unicode)) {
                            combinations.push({ base: baseChar, mark: activeItem, ligature });
                            addedLigatures.add(ligature.unicode);
                        }
                    }
                }
            }
        }
        return combinations;
    }, [activeItem, positioningRules, viewBy, allChars, positioningData.allLigaturesByKey]);

    const savePositioningUpdate = useCallback((
        baseChar: Character,
        markChar: Character,
        targetLigature: Character, 
        newGlyphData: GlyphData, 
        newOffset: Point, 
        newBearings: { lsb?: number, rsb?: number }
    ) => {
        if (!characterSets) return;
        const {
            updatedMarkPositioningMap,
            updatedGlyphDataMap,
            updatedCharacterSets
        } = updatePositioningAndCascade({
            baseChar, markChar, targetLigature, newGlyphData, newOffset, newBearings,
            allChars,
            allLigaturesByKey: positioningData.allLigaturesByKey,
            markAttachmentClasses,
            baseAttachmentClasses,
            markPositioningMap,
            glyphDataMap,
            characterSets
        });

        positioningDispatch({ type: 'SET_MAP', payload: updatedMarkPositioningMap });
        glyphDataDispatch({ type: 'SET_MAP', payload: updatedGlyphDataMap });
        characterDispatch({ type: 'SET_CHARACTER_SETS', payload: updatedCharacterSets });
        
    }, [characterSets, allChars, positioningData.allLigaturesByKey, markAttachmentClasses, baseAttachmentClasses, markPositioningMap, glyphDataMap, positioningDispatch, glyphDataDispatch, characterDispatch]);

    const handleSavePair = useCallback((targetLigature: Character, newGlyphData: GlyphData, newOffset: Point, newBearings: { lsb?: number, rsb?: number }) => {
        if (!editingPair) return;
        savePositioningUpdate(editingPair.base, editingPair.mark, targetLigature, newGlyphData, newOffset, newBearings);
    }, [editingPair, savePositioningUpdate]);

    const handleConfirmPosition = useCallback((base: Character, mark: Character, ligature: Character) => {
        const baseGlyph = glyphDataMap.get(base.unicode);
        const markGlyph = glyphDataMap.get(mark.unicode);
        if (!baseGlyph || !markGlyph || !metrics || !characterSets) return;

        const baseBbox = getGlyphBBoxOfPoints(baseGlyph.paths);
        const markBbox = getGlyphBBoxOfPoints(markGlyph.paths);
        const offset = calculateDefaultMarkOffset(base, mark, baseBbox, markBbox, markAttachmentRules, metrics, characterSets);
    
        const transformedMarkPaths = JSON.parse(JSON.stringify(markGlyph.paths)).map((p: Path) => ({
            ...p,
            points: p.points.map((pt: Point) => ({ x: pt.x + offset.x, y: pt.y + offset.y }))
        }));
        const combinedPaths = [...baseGlyph.paths, ...transformedMarkPaths];
        const newGlyphData = { paths: combinedPaths };
    
        const newBearings = { lsb: ligature.lsb, rsb: ligature.rsb };
    
        savePositioningUpdate(base, mark, ligature, newGlyphData, offset, newBearings);
        showNotification(`${t('saveGlyphSuccess')} for ${ligature.name}`, 'success');
    }, [glyphDataMap, markAttachmentRules, savePositioningUpdate, showNotification, t, metrics, characterSets]);

    const handleOpenReuseModal = (sourceItem: Character) => {
        setReuseSourceItem(sourceItem);
        setIsReuseModalOpen(true);
    };
    
    const fullyPositionedItems = useMemo(() => {
        return navItems.filter(item => {
            // Find all combinations for this item
            const combinations: { base: Character; mark: Character }[] = [];
            positioningRules?.forEach(rule => {
                if ((viewBy === 'base' && rule.base.includes(item.name)) || (viewBy === 'mark' && rule.mark.includes(item.name))) {
                    const otherSet = viewBy === 'base' ? rule.mark : rule.base;
                    otherSet.forEach(otherName => {
                        const otherChar = allChars.get(otherName);
                        if(otherChar) {
                            combinations.push({
                                base: viewBy === 'base' ? item : otherChar,
                                mark: viewBy === 'base' ? otherChar : item
                            });
                        }
                    });
                }
            });
            // Check if all of its combinations are positioned
            return combinations.length > 0 && combinations.every(combo =>
                markPositioningMap.has(`${combo.base.unicode}-${combo.mark.unicode}`)
            );
        }).filter(item => item.unicode !== reuseSourceItem?.unicode);
    }, [navItems, positioningRules, viewBy, allChars, markPositioningMap, reuseSourceItem]);
    
    const handleCopyPositions = (copyFromItem: Character) => {
        if (!reuseSourceItem) return;

        const newMarkPositioningMap = new Map(markPositioningMap);
        const newGlyphDataMap = new Map(glyphDataMap);
        const ligaturesToAddOrUpdate: Character[] = [];

        const targetCombinations = displayedCombinations;
        
        let positionsCopiedCount = 0;

        targetCombinations.forEach(targetCombo => {
            const otherChar = viewBy === 'base' ? targetCombo.mark : targetCombo.base;
            const sourceBase = viewBy === 'base' ? copyFromItem : otherChar;
            const sourceMark = viewBy === 'base' ? otherChar : copyFromItem;
            
            const sourceKey = `${sourceBase.unicode}-${sourceMark.unicode}`;
            const sourceOffset = markPositioningMap.get(sourceKey);

            if (sourceOffset) {
                const targetKey = `${targetCombo.base.unicode}-${targetCombo.mark.unicode}`;
                newMarkPositioningMap.set(targetKey, sourceOffset);

                const baseGlyph = glyphDataMap.get(targetCombo.base.unicode);
                const markGlyph = glyphDataMap.get(targetCombo.mark.unicode);
                if (baseGlyph && markGlyph) {
                    const transformedMarkPaths = JSON.parse(JSON.stringify(markGlyph.paths)).map((p: Path) => ({
                        ...p,
                        points: p.points.map((pt: Point) => ({ x: pt.x + sourceOffset.x, y: pt.y + sourceOffset.y }))
                    }));
                    const combinedPaths = [...baseGlyph.paths, ...transformedMarkPaths];
                    newGlyphDataMap.set(targetCombo.ligature.unicode, { paths: combinedPaths });
                    ligaturesToAddOrUpdate.push(targetCombo.ligature);
                    positionsCopiedCount++;
                }
            }
        });

        if (positionsCopiedCount > 0) {
            positioningDispatch({ type: 'SET_MAP', payload: newMarkPositioningMap });
            glyphDataDispatch({ type: 'SET_MAP', payload: newGlyphDataMap });

            characterDispatch({ type: 'UPDATE_CHARACTER_SETS', payload: (prevSets: CharacterSet[] | null) => {
                if (!prevSets) return null;
                const updatedSets: CharacterSet[] = JSON.parse(JSON.stringify(prevSets));
                const allExistingChars = new Map<number, Character>();
                updatedSets.forEach(set => set.characters.forEach(char => allExistingChars.set(char.unicode, char)));

                const DYNAMIC_LIGATURES_KEY = 'dynamicLigatures';
                let dynamicSet = updatedSets.find(s => s.nameKey === DYNAMIC_LIGATURES_KEY);
                if (!dynamicSet) {
                    dynamicSet = { nameKey: DYNAMIC_LIGATURES_KEY, characters: [] };
                    updatedSets.push(dynamicSet);
                }
                
                ligaturesToAddOrUpdate.forEach(ligature => {
                    if (!allExistingChars.has(ligature.unicode)) {
                        dynamicSet!.characters.push(ligature);
                        allExistingChars.set(ligature.unicode, ligature);
                    }
                });

                return updatedSets;
            }});

            showNotification(t('positionsCopied'), 'success');
        } else {
            showNotification(t('noPositionsToCopy'), 'info');
        }

        setIsReuseModalOpen(false);
        setReuseSourceItem(null);
    };

    const handleNavigatePair = (newIndex: number) => {
        if (newIndex >= 0 && newIndex < displayedCombinations.length) {
            setEditingPair(displayedCombinations[newIndex]);
            setEditingIndex(newIndex);
        }
    };
    
    if (!settings || !metrics) return null;

    if (editingPair && editingIndex !== null) {
        return (
            <PositioningEditorPage
                baseChar={editingPair.base}
                markChar={editingPair.mark}
                targetLigature={editingPair.ligature}
                glyphDataMap={glyphDataMap}
                markPositioningMap={markPositioningMap}
                onSave={handleSavePair}
                onClose={() => { setEditingPair(null); setEditingIndex(null); }}
                settings={settings}
                metrics={metrics}
                markAttachmentRules={markAttachmentRules}
                positioningRules={positioningRules}
                allChars={allChars}
                allPairs={displayedCombinations}
                currentIndex={editingIndex}
                onNavigate={handleNavigatePair}
                characterSets={characterSets!}
            />
        );
    }

    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex justify-center items-center gap-4 mb-4">
                    <button onClick={() => setViewBy('base')} className={`px-4 py-2 rounded-md font-semibold ${viewBy === 'base' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{t('viewByBase')}</button>
                    <button onClick={() => setViewBy('mark')} className={`px-4 py-2 rounded-md font-semibold ${viewBy === 'mark' ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>{t('viewByMark')}</button>
                </div>
                <div className="relative">
                    {showNavArrows.left && (
                         <button onClick={() => handleScroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-800/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-800"><LeftArrowIcon className="h-5 w-5"/></button>
                    )}
                    <div ref={navContainerRef} className="flex space-x-1 overflow-x-auto no-scrollbar py-1">
                       {navItems.map((item, index) => (
                            <button
                                key={item.unicode}
                                onClick={() => setActiveTab(index)}
                                className={`flex-shrink-0 px-3 py-2 text-lg font-bold rounded-md whitespace-nowrap transition-colors ${activeTab === index ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                                style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}
                            >
                                {item.name}
                            </button>
                        ))}
                    </div>
                    {showNavArrows.right && (
                        <button onClick={() => handleScroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white/70 dark:bg-gray-800/70 p-1 rounded-full shadow-md hover:bg-white dark:hover:bg-gray-800"><RightArrowIcon className="h-5 w-5"/></button>
                    )}
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-6">
                {!activeItem && (
                    <div className="text-center p-8 bg-gray-100 dark:bg-gray-800 rounded-lg">
                        <p className="text-gray-600 dark:text-gray-400">
                            {viewBy === 'base' ? t('positioningNoBasesDrawn') : t('positioningNoMarksDrawn')}
                        </p>
                    </div>
                )}
                
                {activeItem && (
                    <div key={activeItem.unicode}>
                        <div className="flex items-center gap-2 mb-4">
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                                {t('combinationsFor', { item: activeItem.name })}
                            </h2>
                            <button
                                onClick={() => handleOpenReuseModal(activeItem)}
                                title={t('copyPositionsFrom')}
                                className="p-2 text-gray-400 hover:text-indigo-500 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                                <CopyIcon />
                            </button>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-4">
                            {displayedCombinations.map(({ base, mark, ligature }, index) => {
                                const baseIsDrawn = isGlyphDrawn(base);
                                const markIsDrawn = isGlyphDrawn(mark);
                                const canEdit = baseIsDrawn && markIsDrawn;
                                const isPositioned = markPositioningMap.has(`${base.unicode}-${mark.unicode}`);

                                return (
                                    <CombinationCard
                                        key={ligature.unicode}
                                        baseChar={base}
                                        markChar={mark}
                                        ligature={ligature}
                                        glyphDataMap={glyphDataMap}
                                        strokeThickness={settings.strokeThickness}
                                        isPositioned={isPositioned}
                                        canEdit={canEdit}
                                        onClick={() => {
                                            if (canEdit) {
                                                setEditingPair({ base, mark, ligature });
                                                setEditingIndex(index);
                                            }
                                        }}
                                        onConfirmPosition={() => handleConfirmPosition(base, mark, ligature)}
                                        markAttachmentRules={markAttachmentRules}
                                        markPositioningMap={markPositioningMap}
                                        characterSets={characterSets!}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
            
            {isReuseModalOpen && reuseSourceItem && (
                <div className="fixed inset-0 bg-gray-900/80 z-50 flex items-center justify-center p-4" onClick={() => setIsReuseModalOpen(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                        <header className="p-4 border-b dark:border-gray-700">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{t('copyFrom', { consonantName: reuseSourceItem.name })}</h3>
                        </header>
                        <div className="p-4 max-h-[60vh] overflow-y-auto">
                            {fullyPositionedItems.length > 0 ? (
                                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
                                    {fullyPositionedItems.map(item => (
                                        <div key={item.unicode} onClick={() => handleCopyPositions(item)} className="p-2 flex flex-col items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer transition-colors">
                                            <div className="w-16 h-16 text-4xl flex items-center justify-center font-bold text-gray-800 dark:text-gray-200" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>
                                                {item.name}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-center py-8">{t('noCompleteSources')}</p>
                            )}
                        </div>
                        <footer className="p-4 border-t dark:border-gray-700 flex justify-end">
                            <button onClick={() => setIsReuseModalOpen(false)} className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600">{t('cancel')}</button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(PositioningPage);
