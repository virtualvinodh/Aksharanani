
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Character, GlyphData, FontMetrics, RecommendedKerning } from '../types';
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
    
    const [activeView, setActiveView] = useState<'recommended' | 'custom'>('recommended');
    const [filterStatus, setFilterStatus] = useState<'all' | 'kerned' | 'unkerned'>('all');

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

    const recommendedPairs = useMemo(() => {
        if (!recommendedKerning) return [];
        return recommendedKerning.map(([left, right]) => ({
            left: allCharsByName.get(left)!,
            right: allCharsByName.get(right)!,
        })).filter(pair => pair.left && pair.right && isGlyphDrawn(pair.left) && isGlyphDrawn(pair.right));
    }, [recommendedKerning, isGlyphDrawn, allCharsByName]);

    const allPairsWithKerningValues = useMemo(() => {
        const pairs = new Set<string>();
        recommendedPairs.forEach(pair => pairs.add(`${pair.left.unicode}-${pair.right.unicode}`));
        kerningMap.forEach((_, key) => pairs.add(key));
        
        return Array.from(pairs).map(key => {
            const [leftUnicode, rightUnicode] = key.split('-').map(Number);
            const left = allCharsByUnicode.get(leftUnicode);
            const right = allCharsByUnicode.get(rightUnicode);
            if (left && right && isGlyphDrawn(left) && isGlyphDrawn(right)) {
                return { left, right };
            }
            return null;
        }).filter((p): p is { left: Character, right: Character } => p !== null)
          .sort((a, b) => a.left.unicode - b.left.unicode || a.right.unicode - b.right.unicode);
    }, [recommendedPairs, kerningMap, allCharsByUnicode, isGlyphDrawn]);

    const filteredReviewPairs = useMemo(() => {
        if (filterStatus === 'all') return allPairsWithKerningValues;
        
        return allPairsWithKerningValues.filter(pair => {
            const key = `${pair.left.unicode}-${pair.right.unicode}`;
            const hasKerning = kerningMap.has(key);
            if (filterStatus === 'kerned') return hasKerning;
            if (filterStatus === 'unkerned') return !hasKerning;
            return true;
        });
    }, [allPairsWithKerningValues, filterStatus, kerningMap]);

    const customPairs = useMemo(() => {
        const customList: { left: Character, right: Character }[] = [];
        if (selectedLeftChars.size > 0 && selectedRightChars.size > 0) {
            for (const leftUnicode of selectedLeftChars) {
                for (const rightUnicode of selectedRightChars) {
                    const left = allCharsByUnicode.get(leftUnicode)!;
                    const right = allCharsByUnicode.get(rightUnicode)!;
                    if (left && right) {
                        customList.push({ left, right });
                    }
                }
            }
        }
        return customList.sort((a, b) => a.left.unicode - b.left.unicode || a.right.unicode - b.right.unicode);
    }, [selectedLeftChars, selectedRightChars, allCharsByUnicode]);

    const allPairsToDisplay = useMemo(() => {
        return activeView === 'recommended' ? filteredReviewPairs : customPairs;
    }, [activeView, filteredReviewPairs, customPairs]);

    const totalPages = useMemo(() => Math.ceil(allPairsToDisplay.length / PAGE_SIZE), [allPairsToDisplay.length, PAGE_SIZE]);

    useEffect(() => {
        setCurrentPage(1);
    }, [allPairsToDisplay]);

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
                <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center flex-wrap gap-4">
                    {activeView === 'recommended' && (
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('filter')}:</span>
                            <div className="flex items-center p-0.5 bg-gray-200 dark:bg-gray-900 rounded-md">
                                <button onClick={() => setFilterStatus('all')} className={`px-3 py-1 text-xs rounded-md ${filterStatus === 'all' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}>{t('filterAll')}</button>
                                <button onClick={() => setFilterStatus('kerned')} className={`px-3 py-1 text-xs rounded-md ${filterStatus === 'kerned' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}>{t('filterKerned')}</button>
                                <button onClick={() => setFilterStatus('unkerned')} className={`px-3 py-1 text-xs rounded-md ${filterStatus === 'unkerned' ? 'bg-white dark:bg-gray-700 shadow' : ''}`}>{t('filterUnkerned')}</button>
                            </div>
                        </div>
                    )}
                    <div className={activeView === 'custom' ? 'w-full flex justify-end' : ''}>
                        <button 
                            onClick={handleAutoKern} 
                            disabled={isAutoKerning}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:bg-teal-400 disabled:cursor-wait transition-colors"
                        >
                            <SparklesIcon />
                            {isAutoKerning ? t('autoKerningInProgress') : t('autoKern')} 
                        </button>
                    </div>
                </div>
                
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
                           {activeView === 'recommended' 
                                ? "No pairs match the current filter."
                                : t('kerningCustomSubtitle')
                           }
                        </p>
                     </div>
                )}
            </>
        )
    };
    
    return (
        <div className="w-full h-full flex flex-col">
            <div className="p-4 border-b dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('kerningWorkspaceTitle')}</h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                           {activeView === 'recommended' ? t('kerningRecommendedSubtitle') : t('kerningCustomSubtitle')}
                        </p>
                    </div>
                    <div className="flex items-center p-1 bg-gray-200 dark:bg-gray-900 rounded-lg">
                        <button onClick={() => setActiveView('recommended')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeView === 'recommended' ? 'bg-white dark:bg-gray-700 shadow' : 'text-gray-600 dark:text-gray-300'}`}>{t('recommended')}</button>
                        <button onClick={() => setActiveView('custom')} className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${activeView === 'custom' ? 'bg-white dark:bg-gray-700 shadow' : 'text-gray-600 dark:text-gray-300'}`}>{t('customPairGenerator')}</button>
                    </div>
                </div>
            </div>
            <div className="flex flex-1 overflow-hidden">
                {activeView === 'custom' && (
                    <div className="hidden lg:flex lg:w-64 flex-shrink-0 h-full">
                        <CharacterSelectionPanel
                            title={t('leftChar')}
                            characters={drawnCharacters}
                            selectedChars={selectedLeftChars}
                            onSelectionChange={handleLeftSelectionChange}
                            onSelectAll={() => setSelectedLeftChars(new Set(drawnCharacters.map(c => c.unicode)))}
                            onSelectNone={() => setSelectedLeftChars(new Set())}
                        />
                    </div>
                )}
                <main className="flex-1 flex flex-col overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
                    {activeView === 'custom' && (
                        <div className="block lg:hidden p-4 space-y-4 border-b dark:border-gray-700">
                            <CharacterSelectionRow
                                title={t('leftChar')}
                                characters={drawnCharacters}
                                selectedChars={selectedLeftChars}
                                onSelectionChange={handleLeftSelectionChange}
                                onSelectAll={() => setSelectedLeftChars(new Set(drawnCharacters.map(c => c.unicode)))}
                                onSelectNone={() => setSelectedLeftChars(new Set())}
                            />
                            <CharacterSelectionRow
                                title={t('rightChar')}
                                characters={drawnCharacters}
                                selectedChars={selectedRightChars}
                                onSelectionChange={handleRightSelectionChange}
                                onSelectAll={() => setSelectedRightChars(new Set(drawnCharacters.map(c => c.unicode)))}
                                onSelectNone={() => setSelectedRightChars(new Set())}
                            />
                        </div>
                    )}
                    <div className="flex-grow">
                        {renderContent()}
                    </div>
                </main>
                {activeView === 'custom' && (
                    <div className="hidden lg:flex lg:w-64 flex-shrink-0 h-full">
                        <CharacterSelectionPanel
                            title={t('rightChar')}
                            characters={drawnCharacters}
                            selectedChars={selectedRightChars}
                            onSelectionChange={handleRightSelectionChange}
                            onSelectAll={() => setSelectedRightChars(new Set(drawnCharacters.map(c => c.unicode)))}
                            onSelectNone={() => setSelectedRightChars(new Set())}
                        />
                    </div>
                )}
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