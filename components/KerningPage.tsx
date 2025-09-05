
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Character, GlyphData, FontMetrics, CharacterSet, KerningMap, RecommendedKerning, AppSettings } from '../types';
import { useLocale } from '../contexts/LocaleContext';
import { SparklesIcon, LeftArrowIcon, RightArrowIcon } from '../constants';
import { calculateAutoKerning } from '../services/kerningService';
import KerningModal from './KerningModal';
import PairCard from './PairCard';
import CharacterSelectionPanel from './kerning/CharacterSelectionPanel';
import CharacterSelectionRow from './kerning/CharacterSelectionRow';
import { useKerning } from '../contexts/KerningContext';
import { useCharacter } from '../contexts/CharacterContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLayout } from '../contexts/LayoutContext';
import { isGlyphDrawn as isGlyphDrawnUtil } from '../utils/glyphUtils';
import AutoKerningProgressModal from './AutoKerningProgressModal';
import { useMediaQuery } from '../hooks/useMediaQuery';

interface KerningPageProps {
  recommendedKerning: RecommendedKerning[] | null;
}

const KerningPage: React.FC<KerningPageProps> = ({ recommendedKerning }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const { characterSets, allCharsByName } = useCharacter();
    const { glyphDataMap } = useGlyphData();
    const { kerningMap, dispatch: kerningDispatch } = useKerning();
    const { settings, metrics } = useSettings();
    
    const [selectedPair, setSelectedPair] = useState<{ left: Character, right: Character } | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    const [selectedLeftChars, setSelectedLeftChars] = useState(new Set<number>());
    const [selectedRightChars, setSelectedRightChars] = useState(new Set<number>());
    const [isAutoKerning, setIsAutoKerning] = useState(false);
    const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
    const [kerningProgressValue, setKerningProgressValue] = useState(0);

    const [currentPage, setCurrentPage] = useState(1);
    const isLargeScreen = useMediaQuery('(min-width: 1024px)');
    const PAGE_SIZE = isLargeScreen ? 100 : 20;

    const allCharsByUnicode = useMemo(() => {
        const map = new Map<number, Character>();
        characterSets!.flatMap(set => set.characters).forEach(char => {
            map.set(char.unicode, char);
        });
        return map;
    }, [characterSets]);
    
    const isGlyphDrawn = useCallback((char: Character): boolean => {
        if (!char) return false;
        return isGlyphDrawnUtil(glyphDataMap.get(char.unicode));
    }, [glyphDataMap]);

    const drawnCharacters = useMemo(() => {
        return Array.from(allCharsByUnicode.values())
            .filter(char => isGlyphDrawn(char))
            .sort((a,b) => a.unicode - b.unicode);
    }, [allCharsByUnicode, isGlyphDrawn]);
    
    const areAllRecGlyphsDrawn = useMemo(() => {
        if (!recommendedKerning) return true;
        for (const [leftName, rightName] of recommendedKerning) {
            const leftChar = allCharsByName.get(leftName);
            const rightChar = allCharsByName.get(rightName);
            if (!leftChar || !rightChar || !isGlyphDrawn(leftChar) || !isGlyphDrawn(rightChar)) {
                return false; // Found a recommended pair with undrawn glyphs
            }
        }
        return true; // All recommended pairs have drawn glyphs
    }, [recommendedKerning, isGlyphDrawn, allCharsByName]);
    
    const drawnRecommendedKerning = useMemo(() => {
        if (!recommendedKerning) return [];
        return recommendedKerning.filter(([left, right]) => {
            const leftChar = allCharsByName.get(left);
            const rightChar = allCharsByName.get(right);
            return !!(leftChar && rightChar && isGlyphDrawn(leftChar) && isGlyphDrawn(rightChar));
        });
    }, [recommendedKerning, isGlyphDrawn, allCharsByName]);

    const allPairsToDisplay = useMemo(() => {
        const displayedPairs = new Set<string>();
        const combinedList: { left: Character, right: Character }[] = [];

        const addPair = (pair: { left: Character, right: Character }) => {
            if (!pair.left || !pair.right) return;
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            if (!displayedPairs.has(key)) {
                displayedPairs.add(key);
                combinedList.push(pair);
            }
        };

        // 1. Add drawn Recommended Pairs
        drawnRecommendedKerning
            .map(([left, right]) => ({
                left: allCharsByName.get(left)!,
                right: allCharsByName.get(right)!,
            }))
            .forEach(addPair);

        // 2. Add Applied Pairs
        for (const key of kerningMap.keys()) {
            const [leftUnicode, rightUnicode] = key.split('-').map(Number);
            addPair({
                left: allCharsByUnicode.get(leftUnicode)!,
                right: allCharsByUnicode.get(rightUnicode)!,
            });
        }

        // 3. Add Generated Pairs
        if (selectedLeftChars.size > 0 && selectedRightChars.size > 0) {
            for (const leftUnicode of selectedLeftChars) {
                for (const rightUnicode of selectedRightChars) {
                    addPair({
                        left: allCharsByUnicode.get(leftUnicode)!,
                        right: allCharsByUnicode.get(rightUnicode)!,
                    });
                }
            }
        }

        return combinedList;
    }, [drawnRecommendedKerning, kerningMap, selectedLeftChars, selectedRightChars, allCharsByUnicode, allCharsByName]);

    const totalPages = useMemo(() => Math.ceil(allPairsToDisplay.length / PAGE_SIZE), [allPairsToDisplay.length, PAGE_SIZE]);

    useEffect(() => {
        setCurrentPage(1);
    }, [allPairsToDisplay]); // Reset page when filters or total pairs change

    const paginatedPairs = useMemo(() => {
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        return allPairsToDisplay.slice(startIndex, startIndex + PAGE_SIZE);
    }, [currentPage, PAGE_SIZE, allPairsToDisplay]);


    const handlePairClick = (pair: { left: Character, right: Character }) => {
        setSelectedPair(pair);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedPair(null);
    };

    const handleSaveKerning = (value: number) => {
        if (selectedPair) {
            const key = `${selectedPair.left.unicode}-${selectedPair.right.unicode}`;
            const newMap = new Map(kerningMap);
            newMap.set(key, value);
            kerningDispatch({ type: 'SET_MAP', payload: newMap });
        }
        if (!settings?.isAutosaveEnabled) {
             handleCloseModal();
        }
    };

    const handleRemoveKerning = () => {
        if (selectedPair) {
            const key = `${selectedPair.left.unicode}-${selectedPair.right.unicode}`;
            const newMap = new Map(kerningMap);
            if (newMap.has(key)) {
                newMap.delete(key);
                kerningDispatch({ type: 'SET_MAP', payload: newMap });
            }
        }
        handleCloseModal();
    };

    const handleLeftSelectionChange = useCallback((unicode: number, isSelected: boolean) => {
        setSelectedLeftChars(prev => {
            const newSet = new Set(prev);
            isSelected ? newSet.add(unicode) : newSet.delete(unicode);
            return newSet;
        });
    }, []);

    const handleRightSelectionChange = useCallback((unicode: number, isSelected: boolean) => {
        setSelectedRightChars(prev => {
            const newSet = new Set(prev);
            isSelected ? newSet.add(unicode) : newSet.delete(unicode);
            return newSet;
        });
    }, []);

    const handleAutoKern = async () => {
        if (!metrics || !settings) return;
        setIsAutoKerning(true);
    
        const pairsToKern = allPairsToDisplay.filter(pair => {
            if (!pair.left || !pair.right) return false;
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            return !kerningMap.has(key) && isGlyphDrawn(pair.left) && isGlyphDrawn(pair.right);
        });
        
        if (pairsToKern.length === 0) {
            showNotification(t('noPairsToKern'), 'info');
            setIsAutoKerning(false);
            return;
        }

        setKerningProgressValue(0);
        setIsProgressModalOpen(true);
    
        const onProgressUpdate = (progress: number) => {
            setKerningProgressValue(progress);
        };
    
        const newKerningValues = await calculateAutoKerning(
            pairsToKern,
            glyphDataMap,
            metrics,
            settings.strokeThickness,
            onProgressUpdate
        );
    
        if (newKerningValues.size > 0) {
            kerningDispatch({ type: 'SET_MAP', payload: new Map([...kerningMap, ...newKerningValues]) });
            showNotification(t('autoKerningComplete', { count: newKerningValues.size }), 'success');
        } else {
            showNotification(t('autoKerningNoChange'), 'info');
        }
        
        setIsProgressModalOpen(false);
        setIsAutoKerning(false);
    };
    
    if (!settings || !metrics) return null;

    const renderContent = () => {
        if (drawnCharacters.length === 0) {
            return (
                <div className="text-center p-8 bg-gray-100 dark:bg-gray-800 rounded-lg m-4">
                    <p className="text-gray-600 dark:text-gray-400">{t('kerningNoCharsDrawn')}</p>
                </div>
            );
        }
        
        return (
            <>
                <div className="p-4 border-b dark:border-gray-700">
                    <button 
                        onClick={handleAutoKern} 
                        disabled={isAutoKerning}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:bg-teal-400 disabled:cursor-wait transition-colors"
                    >
                        <SparklesIcon />
                        {isAutoKerning ? t('autoKerningInProgress') : t('autoKern')} 
                    </button>
                </div>
                {!areAllRecGlyphsDrawn && (
                    <div className="mx-4 mt-4 p-3 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-md text-sm text-blue-700 dark:text-blue-300">
                        {t('kerningShowOnlyComplete')}
                    </div>
                )}
                {allPairsToDisplay.length > 0 ? (
                    <>
                        <div className="p-4 grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4">
                            {paginatedPairs.map((pair, index) => {
                                if (!pair.left || !pair.right) return null;
                                const key = `${pair.left.unicode}-${pair.right.unicode}`;
                                const isRec = recommendedKerning?.some(rec => rec[0] === pair.left.name && rec[1] === pair.right.name);
                                return (
                                    <PairCard
                                        key={key + index}
                                        pair={pair}
                                        onClick={() => handlePairClick(pair)}
                                        isRecommended={!!isRec}
                                        kerningValue={kerningMap.get(key)}
                                        glyphDataMap={glyphDataMap}
                                        strokeThickness={settings.strokeThickness}
                                        metrics={metrics}
                                    />
                                );
                            })}
                        </div>
                        {totalPages > 1 && (
                            <div className="p-4 flex justify-center items-center gap-4 text-sm">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <LeftArrowIcon className="h-4 w-4" />
                                    <span>{t('previous')}</span>
                                </button>
                                <span>
                                    {t('page')} {currentPage} / {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span>{t('next')}</span>
                                    <RightArrowIcon className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                     <div className="flex-grow flex items-center justify-center text-center p-8">
                        <p className="text-gray-500 dark:text-gray-400">
                           {t('kerningPageSubtitle')}
                        </p>
                     </div>
                )}
            </>
        )
    };
    
    return (
        <div className="w-full h-full flex flex-col">
            <div className="flex flex-1 overflow-hidden">
                {/* Desktop Left Panel */}
                <div className="hidden lg:flex lg:w-64 flex-shrink-0 h-full">
                    <CharacterSelectionPanel
                        title="Left Character"
                        characters={drawnCharacters}
                        selectedChars={selectedLeftChars}
                        onSelectionChange={handleLeftSelectionChange}
                        onSelectAll={() => setSelectedLeftChars(new Set(drawnCharacters.map(c => c.unicode)))}
                        onSelectNone={() => setSelectedLeftChars(new Set())}
                    />
                </div>
                <main className="flex-1 flex flex-col overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
                    {/* Mobile Selection Rows */}
                    <div className="block lg:hidden p-4 space-y-4 border-b dark:border-gray-700">
                        <CharacterSelectionRow
                            title="Left Character"
                            characters={drawnCharacters}
                            selectedChars={selectedLeftChars}
                            onSelectionChange={handleLeftSelectionChange}
                            onSelectAll={() => setSelectedLeftChars(new Set(drawnCharacters.map(c => c.unicode)))}
                            onSelectNone={() => setSelectedLeftChars(new Set())}
                        />
                        <CharacterSelectionRow
                            title="Right Character"
                            characters={drawnCharacters}
                            selectedChars={selectedRightChars}
                            onSelectionChange={handleRightSelectionChange}
                            onSelectAll={() => setSelectedRightChars(new Set(drawnCharacters.map(c => c.unicode)))}
                            onSelectNone={() => setSelectedRightChars(new Set())}
                        />
                    </div>
                     {/* Main Grid */}
                    <div className="flex-grow">
                        {renderContent()}
                    </div>
                </main>
                {/* Desktop Right Panel */}
                <div className="hidden lg:flex lg:w-64 flex-shrink-0 h-full">
                    <CharacterSelectionPanel
                        title="Right Character"
                        characters={drawnCharacters}
                        selectedChars={selectedRightChars}
                        onSelectionChange={handleRightSelectionChange}
                        onSelectAll={() => setSelectedRightChars(new Set(drawnCharacters.map(c => c.unicode)))}
                        onSelectNone={() => setSelectedRightChars(new Set())}
                    />
                </div>
            </div>
            {isModalOpen && selectedPair && (
                <KerningModal
                    pair={selectedPair}
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    onSave={handleSaveKerning}
                    onRemove={handleRemoveKerning}
                    initialValue={kerningMap.get(`${selectedPair.left.unicode}-${selectedPair.right.unicode}`) ?? 0}
                    glyphDataMap={glyphDataMap}
                    strokeThickness={settings.strokeThickness}
                    metrics={metrics}
                    settings={settings}
                />
            )}
            {isProgressModalOpen && (
                <AutoKerningProgressModal isOpen={isProgressModalOpen} progress={kerningProgressValue} />
            )}
        </div>
    );
};


export default React.memo(KerningPage);
