
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocale } from '../contexts/LocaleContext';
import { useLayout } from '../contexts/LayoutContext';
import { Character, GlyphData, PositioningRules } from '../types';
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

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onSelectGlyph, onSetWorkspace, onAction }) => {
    const { t } = useLocale();
    const { characterSets, allCharsByName } = useCharacter();
    const { glyphDataMap } = useGlyphData();
    const { settings } = useSettings();
    const { state: rulesState } = useRules();
    const inputRef = useRef<HTMLInputElement>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const listRef = useRef<HTMLUListElement>(null);
    
    const positioningRules = rulesState.fontRules ? (Object.values(rulesState.fontRules).find((v: any) => v.positioning) as any)?.positioning : null;


    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setActiveIndex(0);
            // Small timeout to ensure focus works after render transition
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    const allItems = useMemo(() => {
        const items: SearchResult[] = [];

        // 1. Workspaces
        items.push({ id: 'ws-drawing', type: 'workspace', title: t('workspaceDrawing'), icon: <EditIcon />, onExecute: () => onSetWorkspace('drawing') });
        
        if (positioningRules && positioningRules.length > 0) {
            items.push({ id: 'ws-positioning', type: 'workspace', title: t('workspacePositioning'), icon: <SettingsIcon />, onExecute: () => onSetWorkspace('positioning') });
        }
        
        const kerningLabel = settings?.editorMode === 'simple' ? t('workspaceSpacing') : t('workspaceKerning');
        items.push({ id: 'ws-kerning', type: 'workspace', title: kerningLabel, icon: <SettingsIcon />, onExecute: () => onSetWorkspace('kerning') });

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

        // 3. Glyphs (Lazy loading not needed for typical font sizes < 1000 glyphs)
        if (characterSets) {
            characterSets.forEach(set => {
                set.characters.forEach(char => {
                    if (!char.hidden) {
                        const isDrawn = isGlyphDrawn(glyphDataMap.get(char.unicode));
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

        return items;
    }, [t, characterSets, glyphDataMap, settings, onSetWorkspace, onAction, onSelectGlyph, positioningRules]);
    
    const positioningResults = useMemo(() => {
        if (!searchTerm || searchTerm.length < 2 || !positioningRules) return [];
        
        const results: SearchResult[] = [];
        // Only search for positioning if query looks like "base mark" or "ligature"
        const query = searchTerm.toLowerCase();
        
        // Very simple heuristic: check if input matches any positioning rule combination
        // This is a simplified O(N) scan. For very large fonts, an index would be better.
        // We limit results to avoid flooding.
        let count = 0;
        const MAX_POS_RESULTS = 10;

        // Flatten rules for searching
        // Optimization: Creates a list of {base, mark} pairs
        // Real implementation should probably memoize this flattened list if perf is an issue.
        
        // Helper to find char by name
        const getChar = (name: string) => allCharsByName.get(name);

        for (const rule of positioningRules) {
             const bases = rule.base;
             const marks = rule.mark || [];
             
             for (const baseName of bases) {
                 for (const markName of marks) {
                     if (count >= MAX_POS_RESULTS) break;
                     
                     const pairName = baseName + markName;
                     const baseChar = getChar(baseName);
                     const markChar = getChar(markName);
                     
                     if (baseChar && markChar && (
                         pairName.toLowerCase().includes(query) || 
                         (baseName.toLowerCase().includes(query) && markName.toLowerCase().includes(query))
                     )) {
                         results.push({
                             id: `pos-${baseName}-${markName}`,
                             type: 'positioning',
                             title: `${baseName} + ${markName}`,
                             subtitle: t('positioning'),
                             icon: <span className="flex gap-0.5"><span className="opacity-50">{baseName}</span><span>{markName}</span></span>,
                             onExecute: () => {
                                 onSetWorkspace('positioning');
                                 // Ideally we would also navigate to the specific pair.
                                 // For now, switching workspace is a good first step.
                                 // Future improvement: Pass a "targetPair" to the workspace.
                             }
                         });
                         count++;
                     }
                 }
             }
        }
        return results;

    }, [searchTerm, positioningRules, allCharsByName, t, onSetWorkspace]);

    const filteredItems = useMemo(() => {
        if (!searchTerm) return allItems.filter(i => i.type === 'workspace' || i.type === 'action');
        
        const lowerTerm = searchTerm.toLowerCase();
        const staticResults = allItems.filter(item => 
            item.title.toLowerCase().includes(lowerTerm) || 
            item.subtitle?.toLowerCase().includes(lowerTerm)
        );
        
        return [...staticResults, ...positioningResults];
    }, [allItems, searchTerm, positioningResults]);

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

    // Auto-scroll active item into view
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
