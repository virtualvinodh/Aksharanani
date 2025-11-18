

import React, { useState, useMemo, useCallback } from 'react';
import { useCharacter } from '../contexts/CharacterContext';
import { useGlyphData } from '../contexts/GlyphDataContext';
import { useSettings } from '../contexts/SettingsContext';
import { useLocale } from '../contexts/LocaleContext';
import { Character, GlyphData } from '../types';
import { isGlyphDrawn } from '../utils/glyphUtils';
import GlyphTile from './GlyphTile';
import Modal from './Modal';
import { EditIcon, CheckCircleIcon } from '../constants';
import { useLayout } from '../contexts/LayoutContext';

interface MetricsWorkspaceProps {
    // Add props if needed
}

const MetricsWorkspace: React.FC<MetricsWorkspaceProps> = () => {
    const { characterSets, dispatch: characterDispatch } = useCharacter();
    const { glyphDataMap } = useGlyphData();
    const { settings, metrics } = useSettings();
    const { t } = useLocale();
    const { showNotification } = useLayout();

    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedUnicodes, setSelectedUnicodes] = useState<Set<number>>(new Set());
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // Filter to only drawn characters
    const drawnCharacters = useMemo(() => {
        if (!characterSets) return [];
        return characterSets
            .flatMap(set => set.characters)
            .filter(char => char.unicode !== undefined && !char.hidden && isGlyphDrawn(glyphDataMap.get(char.unicode)))
            .sort((a, b) => a.unicode! - b.unicode!);
    }, [characterSets, glyphDataMap]);

    const toggleSelection = (unicode: number) => {
        if (!selectionMode) return;
        setSelectedUnicodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(unicode)) newSet.delete(unicode);
            else newSet.add(unicode);
            return newSet;
        });
    };

    const handleBulkEdit = () => {
        if (selectedUnicodes.size === 0) return;
        setIsEditModalOpen(true);
    };
    
    const handleSaveMetrics = (newLSB: string, newRSB: string, newAdvWidth: string) => {
        const lsbVal = newLSB.trim() === '' ? undefined : parseInt(newLSB, 10);
        const rsbVal = newRSB.trim() === '' ? undefined : parseInt(newRSB, 10);
        const advVal = newAdvWidth.trim() === '' ? undefined : parseInt(newAdvWidth, 10);

        selectedUnicodes.forEach(unicode => {
             characterDispatch({ 
                 type: 'UPDATE_CHARACTER_BEARINGS', 
                 payload: { 
                     unicode, 
                     lsb: lsbVal, // undefined means "don't change" in this context, need to handle merging manually?
                                  // Actually UPDATE_CHARACTER_BEARINGS in CharacterContext overwrites.
                                  // We need to read the current char to merge if we want "leave blank to keep".
                                  // BUT, the reducer logic handles undefined payload fields by deleting them (reset to default).
                                  // Wait, we want "if blank, DON'T TOUCH", not "if blank, reset to default".
                 } 
            });
            // Since the reducer overwrites or deletes based on presence, we need a slightly smarter dispatch loop or updated reducer.
            // Let's stick to the logic: "If input is empty, do nothing for that field."
            
            // We need to be careful. The reducer expects `lsb?: number`. If we pass undefined, it might reset.
            // Let's check the reducer...
            // Reducer: if (action.payload.lsb !== undefined) newChar.lsb = action.payload.lsb; else delete newChar.lsb;
            // This means passing undefined RESETS to default. This is NOT what we want for bulk edit "leave unchanged".
            // We need to pass the *existing* value if we want to keep it, OR update the reducer.
            // Updating reducer is riskier. Let's look up the char.
        });
        
        // To implement "leave unchanged", we iterate here.
        const updates: {unicode: number, lsb?: number, rsb?: number, advWidth?: number}[] = [];
        
        selectedUnicodes.forEach(unicode => {
             const char = drawnCharacters.find(c => c.unicode === unicode);
             if (char) {
                 const updatePayload: any = { unicode };
                 let hasUpdate = false;
                 
                 if (lsbVal !== undefined) { updatePayload.lsb = lsbVal; hasUpdate = true; }
                 else { updatePayload.lsb = char.lsb; } // Keep existing

                 if (rsbVal !== undefined) { updatePayload.rsb = rsbVal; hasUpdate = true; }
                 else { updatePayload.rsb = char.rsb; } // Keep existing
                 
                 if (hasUpdate) {
                     characterDispatch({ type: 'UPDATE_CHARACTER_BEARINGS', payload: updatePayload });
                 }
             }
        });
        
        showNotification(t('updateComplete'), 'success');
        setIsEditModalOpen(false);
        setSelectionMode(false);
        setSelectedUnicodes(new Set());
    };

    return (
        <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
            <div className="p-4 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('fontMetrics')}</h2>
                {!selectionMode ? (
                    <button 
                        onClick={() => setSelectionMode(true)} 
                        className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        {t('edit')}
                    </button>
                ) : (
                    <button 
                        onClick={() => { setSelectionMode(false); setSelectedUnicodes(new Set()); }} 
                        className="px-4 py-2 bg-gray-500 text-white font-semibold rounded-lg hover:bg-gray-600 transition-colors"
                    >
                        {t('cancel')}
                    </button>
                )}
            </div>

            <div className="flex-grow overflow-y-auto p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {drawnCharacters.map(char => (
                        <div 
                            key={char.unicode}
                            onClick={() => toggleSelection(char.unicode!)}
                            className={`relative bg-white dark:bg-gray-800 border rounded-lg p-4 flex items-center gap-4 transition-all ${selectionMode ? 'cursor-pointer' : ''} ${selectedUnicodes.has(char.unicode!) ? 'ring-2 ring-indigo-500 border-transparent' : 'border-gray-200 dark:border-gray-700'}`}
                        >
                            {selectionMode && (
                                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selectedUnicodes.has(char.unicode!) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-400'}`}>
                                    {selectedUnicodes.has(char.unicode!) && <CheckCircleIcon className="w-4 h-4 text-white" />}
                                </div>
                            )}
                            <div className="w-16 h-16 flex-shrink-0">
                                <GlyphTile character={char} glyphData={glyphDataMap.get(char.unicode!)} strokeThickness={settings?.strokeThickness || 15} />
                            </div>
                            <div className="flex-grow min-w-0">
                                <h3 className="font-bold text-lg truncate" style={{ fontFamily: 'var(--guide-font-family)', fontFeatureSettings: 'var(--guide-font-feature-settings)' }}>{char.name}</h3>
                                <div className="text-xs text-gray-500 dark:text-gray-400 grid grid-cols-2 gap-1 mt-1">
                                    <span>LSB: <span className="font-mono text-gray-800 dark:text-gray-200">{char.lsb ?? metrics?.defaultLSB}</span></span>
                                    <span>RSB: <span className="font-mono text-gray-800 dark:text-gray-200">{char.rsb ?? metrics?.defaultRSB}</span></span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {selectionMode && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-gray-800 border-t dark:border-gray-700 shadow-lg flex justify-between items-center z-10">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                        {selectedUnicodes.size} selected
                    </span>
                    <button 
                        onClick={handleBulkEdit}
                        disabled={selectedUnicodes.size === 0}
                        className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow"
                    >
                        Edit Properties
                    </button>
                </div>
            )}

            <BulkEditModal 
                isOpen={isEditModalOpen} 
                onClose={() => setIsEditModalOpen(false)} 
                onSave={handleSaveMetrics}
                count={selectedUnicodes.size}
            />
        </div>
    );
};

const BulkEditModal: React.FC<{ isOpen: boolean, onClose: () => void, onSave: (l: string, r: string, w: string) => void, count: number }> = ({ isOpen, onClose, onSave, count }) => {
    const { t } = useLocale();
    const [lsb, setLsb] = useState('');
    const [rsb, setRsb] = useState('');
    const [width, setWidth] = useState('');

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Edit ${count} Glyphs`} footer={
            <>
                <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded-lg">{t('cancel')}</button>
                <button onClick={() => onSave(lsb, rsb, width)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg">{t('save')}</button>
            </>
        }>
            <div className="space-y-4">
                <p className="text-sm text-gray-500">Leave fields blank to keep existing values.</p>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Left Side Bearing</label>
                        <input type="number" value={lsb} onChange={e => setLsb(e.target.value)} placeholder="Unchanged" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Right Side Bearing</label>
                        <input type="number" value={rsb} onChange={e => setRsb(e.target.value)} placeholder="Unchanged" className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default MetricsWorkspace;
