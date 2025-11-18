
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import { Character, GlyphData, PositioningRules, ScriptConfig } from '../types';
import { useCharacter } from '../contexts/CharacterContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { SearchIcon, EditIcon, SettingsIcon, CompareIcon, TestIcon, ExportIcon, SaveIcon, LoadIcon, CodeBracketsIcon } from '../constants';
import { isGlyphDrawn } from '../utils/glyphUtils';
import { useSettings } from '../contexts/SettingsContext';
import { useRules } from '../contexts/RulesContext';

interface CommandPaletteProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectGlyph: (character: Character) => void;
    onSetWorkspace: (workspace: any) => void;
    onAction: (action: string) => void;
    positioningRules: PositioningRules[] | null;
    script: ScriptConfig;
    hasKerning: boolean;
}

interface SearchResult {
    id: string;
    type: 'glyph' | 'workspace' | 'action' | 'positioning';
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    onExecute: () => void;
    unicode?: number;
}

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onSelectGlyph, onSetWorkspace, onAction, positioningRules, script, hasKerning }) => {
    const { t } = useLocale();
    const { characterSets, allCharsByName } = useCharacter();
    const { glyphDataMap } = useGlyphData();
    const { settings } = useSettings();
    const { state: rulesState } = useRules();
    const { setPendingNavigationTarget } = useLayout();

    const inputRef = useRef<HTMLInputElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLUListElement>(null);
    
    // Optimization: Cache the full list of items in state so it doesn't re-compute on every parent render
    const [cachedItems, setCachedItems] = useState<SearchResult[]>([]);
    
    // Helper to resolve groups referenced in rules (e.g. $vowels) to individual character names
    const expandGroup = useMemo(() => (name: string): string[] => {
        if (!name.startsWith('$')) return [name];
        
        const groupName = name.substring(1);
        // 1. Check character sets (e.g. $vowels from characters.json)
        const charSet = characterSets?.find(s => s.nameKey === groupName);
        if (charSet) {
            return charSet.characters.map(c => c.name);
        }
        // 2. Check groups defined in rules.json (e.g. $consAll)
        // Access groups from the rules state if available
        const rulesGroups = rulesState.fontRules?.groups;
        if (rulesGroups && rulesGroups[groupName]) {
            // Recursively expand groups if a group contains other groups
            const members = rulesGroups[groupName] as string[];
            return members.flatMap(m => expandGroup(m));
        }
        
        return [];
    }, [characterSets, rulesState.fontRules]);

    // Build the static search index only when the palette opens.
    // This prevents the expensive glyphDataMap scan from running during drawing.
    useEffect(() => {
        if (isOpen) {
            const items: SearchResult[] = [];

            const isSimple = settings?.editorMode === 'simple';

            // 1. Workspaces
            items.push({ id: 'ws-drawing', type: 'workspace', title: t('workspaceDrawing'), icon: <EditIcon />, onExecute: () => onSetWorkspace('drawing') });
            
            if (positioningRules && positioningRules.length > 0) {
                items.push({ id: 'ws-positioning', type: 'workspace', title: t('workspacePositioning'), icon: <SettingsIcon />, onExecute: () => onSetWorkspace('positioning') });
            }
            
            const kerningLabel = isSimple ? t('workspaceSpacing') : t('workspaceKerning');
            const showKerning = hasKerning && (settings?.editorMode === 'advanced' || script.kerning === 'true');
            
            if (showKerning) {
                items.push({ id: 'ws-kerning', type: 'workspace', title: kerningLabel, icon: <SettingsIcon />, onExecute: () => onSetWorkspace('kerning') });
            }

            if (settings?.editorMode === 'advanced') {
                 items.push({ id: 'ws-rules', type: 'workspace', title: t('workspaceRules'), icon: <SettingsIcon />, onExecute: () => onSetWorkspace('rules') });
                 items.push({ id: 'ws-metrics', type: 'workspace', title: t('metrics'), icon: <SettingsIcon />, onExecute: () => onSetWorkspace('metrics') });
            }

            // 2. Actions
            items.push({ id: 'act-save', type: 'action', title: t('save'), icon: <SaveIcon />, onExecute: () => onAction('save') });
            items.push({ id: 'act-export-json', type: 'action', title: t('exportJson'), icon: <CodeBracketsIcon />, onExecute: () => onAction('export-json') });
            items.push({ id: 'act-load-json', type: 'action', title: t('load'), icon: <LoadIcon />, onExecute: () => onAction('load-json') });
            items.push({ id: 'act-export', type: 'action', title: t('exportOtf'), icon: <ExportIcon />, onExecute: () => onAction('export') });
            items.push({ id: 'act-test', type: 'action', title: t('testFont'), icon: <TestIcon />, onExecute: () => onAction('test') });
            if (settings?.editorMode === 'advanced') {
                items.push({ id: 'act-compare', type: 'action', title: t('compare'), icon: <CompareIcon />, onExecute: () => onAction('compare') });
            }
            items.push({ id: 'act-settings', type: 'action', title: t('settings'), icon: <SettingsIcon />, onExecute: () => onAction('settings') });

            // 3. Glyphs (Snapshot of drawn state at open time)
            if (characterSets) {
                characterSets.forEach(set => {
                    set.characters.forEach(char => {
                        if (!char.hidden) {
                            // We access glyphDataMap here, but only once when opening
                            items.push({
                                id: `glyph-${char.unicode}`,
                                type: 'glyph',
                                title: char.name,
                                subtitle: char.unicode ? `U+${char.unicode.toString(16).toUpperCase().padStart(4, '0')} • ${t(set.nameKey)}` : t(set.nameKey),
                                icon: <span className="font-bold text-lg">{char.name}</span>,
                                onExecute: () => onSelectGlyph(char),
                                unicode: char.unicode
                            });
                        }
                    });
                });
            }
            setCachedItems(items);
            
            setSearchTerm('');
            setActiveIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    // We intentionally exclude glyphDataMap from deps to avoid re-running on every stroke.
    // It updates only when isOpen becomes true.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, t, characterSets, settings, onSetWorkspace, onAction, onSelectGlyph, positioningRules, script, hasKerning]);

    
    const positioningResults = useMemo(() => {
        if (!searchTerm || !positioningRules) return [];
        // If user is in simple mode and script doesn't force complexity, maybe hide positioning details?
        // But the requirement is "Deep Linking", so we keep it accessible if rules exist.
        
        const results: SearchResult[] = [];
        const query = searchTerm.toLowerCase();
        let count = 0;
        const MAX_POS_RESULTS = 10;

        const getChar = (name: string) => allCharsByName.get(name);

        for (const rule of positioningRules) {
             const bases = rule.base.flatMap(b => expandGroup(b));
             const marks = (rule.mark || []).flatMap(m => expandGroup(m));
             
             for (const baseName of bases) {
                 for (const markName of marks) {
                     if (count >= MAX_POS_RESULTS) break;
                     
                     const pairName = baseName + markName;
                     
                     // Basic containment check (Scoring handled later)
                     if (pairName.toLowerCase().includes(query) || 
                         (baseName.toLowerCase().includes(query) && markName.toLowerCase().includes(query))) {
                         
                         const baseChar = getChar(baseName);
                         const markChar = getChar(markName);

                         if (baseChar && markChar) {
                             const pairId = `${baseChar.unicode}-${markChar.unicode}`;
                             results.push({
                                 id: `pos-${pairId}`,
                                 type: 'positioning',
                                 title: `${baseName} + ${markName}`,
                                 subtitle: t('positioning'),
                                 icon: <span className="flex gap-0.5"><span className="opacity-50">{baseName}</span><span>{markName}</span></span>,
                                 onExecute: () => {
                                     onSetWorkspace('positioning');
                                     setPendingNavigationTarget(pairId);
                                 }
                             });
                             count++;
                         }
                     }
                 }
             }
        }
        return results;

    }, [searchTerm, positioningRules, allCharsByName, t, onSetWorkspace, setPendingNavigationTarget, expandGroup]);

    const filteredItems = useMemo(() => {
        if (!searchTerm) {
            // Default view: Just Workspaces and Actions
            return cachedItems.filter(i => i.type === 'workspace' || i.type === 'action');
        }
        
        const lowerTerm = searchTerm.toLowerCase();
        const allCandidates = [...cachedItems, ...positioningResults];

        // Scoring Algorithm
        const scoredItems = allCandidates.map(item => {
            let score = 0;
            const titleLower = item.title.toLowerCase();
            const subLower = item.subtitle?.toLowerCase() || '';

            // 1. Title Matches (Highest Priority)
            if (titleLower === lowerTerm) score = 100; // Exact match
            else if (titleLower.startsWith(lowerTerm)) score = 80; // Starts with
            else if (titleLower.includes(lowerTerm)) score = 60; // Contains
            
            // 2. Subtitle Matches (Lowest Priority)
            // Only add score if no title match, to differentiate "found in subtitle" vs "found in title"
            else if (subLower.includes(lowerTerm)) score = 10;

            return { item, score };
        });

        // Filter out non-matches
        const matches = scoredItems.filter(i => i.score > 0);

        // Sort by Score Descending, then by Type Priority
        const typePriority = {
            glyph: 4,
            positioning: 3,
            workspace: 2,
            action: 1
        };

        matches.sort((a, b) => {
            if (a.score !== b.score) {
                return b.score - a.score; // Higher score first
            }
            // Tie-breaker: Type priority
            return typePriority[b.item.type] - typePriority[a.item.type];
        });

        return matches.map(m => m.item);

    }, [cachedItems, searchTerm, positioningResults]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => (prev + 1) % filteredItems.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredItems[activeIndex]) {
                filteredItems[activeIndex].onExecute();
                onClose();
            }
        } else if (e.key === 'Escape') {
            onClose();
        }
    };

    useEffect(() => {
        if (listRef.current) {
            const activeElement = listRef.current.children[activeIndex] as HTMLElement;
            if (activeElement) {
                activeElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[15vh] px-4">
             <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
             
             <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[80vh] animate-modal-enter">
                 <div className="flex items-center p-4 border-b border-gray-200 dark:border-gray-700 gap-3">
                    <SearchIcon />
                    <input 
                        ref={inputRef}
                        type="text" 
                        className="flex-grow bg-transparent text-lg placeholder-gray-400 dark:text-white focus:outline-none"
                        placeholder={t('searchChar') + " or command..."}
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button onClick={onClose} className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-gray-500 dark:text-gray-400">ESC</button>
                 </div>
                 
                 <div className="overflow-y-auto p-2">
                     {filteredItems.length > 0 ? (
                         <ul ref={listRef}>
                             {filteredItems.map((item, index) => (
                                 <li key={item.id}>
                                     <button
                                        onClick={() => { item.onExecute(); onClose(); }}
                                        className={`w-full flex items-center gap-4 p-3 rounded-lg text-left transition-colors ${index === activeIndex ? 'bg-indigo-600 text-white' : 'text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                                        onMouseEnter={() => setActiveIndex(index)}
                                     >
                                         <div className={`flex items-center justify-center w-8 h-8 rounded-md ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                                             {item.icon}
                                         </div>
                                         <div>
                                             <div className="font-semibold">{item.title}</div>
                                             {item.subtitle && <div className={`text-xs ${index === activeIndex ? 'text-indigo-200' : 'text-gray-500 dark:text-gray-400'}`}>{item.subtitle}</div>}
                                         </div>
                                         {item.type === 'workspace' && <span className={`ml-auto text-xs px-2 py-1 rounded-full ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>Go</span>}
                                         {item.type === 'action' && <span className={`ml-auto text-xs px-2 py-1 rounded-full ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>Run</span>}
                                         {item.type === 'positioning' && <span className={`ml-auto text-xs px-2 py-1 rounded-full ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>Edit</span>}
                                         {item.type === 'glyph' && <span className={`ml-auto text-xs px-2 py-1 rounded-full ${index === activeIndex ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-800'}`}>Edit</span>}
                                     </button>
                                 </li>
                             ))}
                         </ul>
                     ) : (
                         <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                             {t('noResultsFound')}
                         </div>
                     )}
                 </div>
             </div>
        </div>
    );
};

export default React.memo(CommandPalette);
