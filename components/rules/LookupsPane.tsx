import React, { useState, useMemo } from 'react';
import { useLocale } from '../../contexts/LocaleContext';
import { AddIcon, EditIcon, SaveIcon, TrashIcon } from '../../constants';
import RuleEditor, { RuleType } from '../RuleEditor';
import ExistingRuleDisplay from './ExistingRuleDisplay';
import { Character, CharacterSet, GlyphData } from '../../types';

interface LookupsPaneProps {
    lookups: Record<string, any>;
    activeLookup: string | null;
    setActiveLookup: (name: string | null) => void;
    onAddLookup: (name: string) => boolean;
    onUpdateLookup: (oldName: string, newName: string) => boolean;
    onDeleteLookup: (name: string) => void;
    onSaveRule: (lookupName: string, rule: any, type: RuleType, context: 'lookup') => void;
    onUpdateRule: (lookupName: string, oldKey: string, rule: any, type: RuleType, context: 'lookup') => void;
    onDeleteRule: (context: 'lookup', lookupName: string, key: string, type: RuleType) => void;
    allCharacterSets: CharacterSet[];
    allCharsByName: Map<string, Character>;
    glyphDataMap: Map<number, GlyphData>;
    strokeThickness: number;
    groups: Record<string, string[]>;
}

const LookupsPane: React.FC<LookupsPaneProps> = ({
    lookups, activeLookup, setActiveLookup, onAddLookup, onUpdateLookup, onDeleteLookup,
    onSaveRule, onUpdateRule, onDeleteRule, allCharacterSets, allCharsByName,
    glyphDataMap, strokeThickness, groups
}) => {
    const { t } = useLocale();
    const [isAdding, setIsAdding] = useState(false);
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState('');
    const [addingRuleType, setAddingRuleType] = useState<RuleType | null>(null);
    const [editingRule, setEditingRule] = useState<{ key: string, type: RuleType } | null>(null);
    
    const activeLookupData = useMemo(() => {
        if (!activeLookup || !lookups[activeLookup]) return {};
        return lookups[activeLookup];
    }, [lookups, activeLookup]);

    const activeLigatureRules = useMemo(() => activeLookupData.liga || {}, [activeLookupData]);
    const activeContextualRules = useMemo(() => activeLookupData.context || {}, [activeLookupData]);
    const activeMultipleRules = useMemo(() => activeLookupData.multi || {}, [activeLookupData]);
    const activeSingleRules = useMemo(() => activeLookupData.single || {}, [activeLookupData]);


    const handleAddClick = () => {
        setIsAdding(true);
        setInputValue('');
    };

    const handleEditClick = (key: string) => {
        setEditingKey(key);
        setInputValue(key);
    };

    const handleSave = () => {
        if (isAdding) {
            if (onAddLookup(inputValue)) {
                setIsAdding(false);
            }
        } else if (editingKey) {
            if (onUpdateLookup(editingKey, inputValue)) {
                setEditingKey(null);
            }
        }
    };

    const handleCancel = () => {
        setIsAdding(false);
        setEditingKey(null);
        setInputValue('');
    };

    const handleSelectLookup = (key: string) => {
        setActiveLookup(key);
        setAddingRuleType(null);
        setEditingRule(null);
    };

    const renderRuleSection = (title: string, rules: { [key: string]: any }, ruleType: RuleType) => {
        const hasExistingRules = Object.keys(rules).length > 0;
        const isAddingThisType = addingRuleType === ruleType && !editingRule;
        const isEditingThisType = editingRule?.type === ruleType;
    
        if (!hasExistingRules && !isAddingThisType && !isEditingThisType) {
            return null;
        }
    
        return (
            <>
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 border-b pb-2">{title}</h3>
                <div className="space-y-4">
                    {isAddingThisType && activeLookup && (
                        <RuleEditor
                            isNew={true}
                            ruleType={addingRuleType!} 
                            onSave={(newRule, type) => { onSaveRule(activeLookup, newRule, type, 'lookup'); setAddingRuleType(null); }}
                            onCancel={() => setAddingRuleType(null)}
                            allCharacterSets={allCharacterSets}
                            allCharsByName={allCharsByName}
                            glyphDataMap={glyphDataMap}
                            strokeThickness={strokeThickness}
                            showNotification={() => {}}
                            mode="editing"
                            groups={groups}
                        />
                    )}
                    {Object.entries(rules).map(([key, value]) => (
                        editingRule?.key === key && editingRule?.type === ruleType ? (
                            <RuleEditor
                                key={key}
                                isNew={false}
                                ruleKey={key}
                                ruleValue={value}
                                ruleType={ruleType}
                                onSave={(updatedRule, type) => { onUpdateRule(activeLookup!, key, updatedRule, type, 'lookup'); setEditingRule(null); }}
                                onCancel={() => setEditingRule(null)}
                                allCharacterSets={allCharacterSets}
                                allCharsByName={allCharsByName}
                                glyphDataMap={glyphDataMap}
                                strokeThickness={strokeThickness}
                                showNotification={() => {}}
                                mode="editing"
                                groups={groups}
                            />
                        ) : (
                            <ExistingRuleDisplay
                                key={key}
                                ruleKey={key}
                                ruleValue={value}
                                ruleType={ruleType}
                                onEdit={() => setEditingRule({ key, type: ruleType })}
                                onDelete={() => onDeleteRule('lookup', activeLookup!, key, ruleType)}
                                allCharsByName={allCharsByName}
                                glyphDataMap={glyphDataMap}
                                strokeThickness={strokeThickness}
                                mode="editing"
                            />
                        )
                    ))}
                </div>
            </>
        );
      };

    return (
        <div className="flex h-full">
            {/* Sidebar */}
            <aside className="w-64 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 p-4 border-r dark:border-gray-700">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-lg font-bold">{t('lookups')}</h2>
                    <button onClick={handleAddClick} disabled={isAdding || !!editingKey} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"><AddIcon className="w-5 h-5"/></button>
                </div>
                <div className="space-y-2">
                    {Object.keys(lookups).map(key => (
                        editingKey === key ? (
                            <div key={key} className="flex items-center gap-1">
                                <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSave()} className="w-full p-1 text-sm border rounded dark:bg-gray-900 dark:border-gray-600" />
                                <button onClick={handleSave} className="p-1 text-green-500"><SaveIcon /></button>
                                <button onClick={handleCancel} className="p-1 text-red-500"><TrashIcon /></button>
                            </div>
                        ) : (
                            <div key={key} onClick={() => handleSelectLookup(key)} className={`group p-2 rounded-md cursor-pointer flex justify-between items-center ${activeLookup === key ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                                <span className="font-mono text-sm text-gray-800 dark:text-gray-200">{key}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); handleEditClick(key); }} className="p-1 text-gray-500 hover:text-indigo-500"><EditIcon /></button>
                                    <button onClick={(e) => { e.stopPropagation(); onDeleteLookup(key); }} className="p-1 text-gray-500 hover:text-red-500"><TrashIcon /></button>
                                </div>
                            </div>
                        )
                    ))}
                    {isAdding && (
                         <div className="flex items-center gap-1">
                            <input type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} autoFocus onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="new_lookup" className="w-full p-1 text-sm border rounded dark:bg-gray-900 dark:border-gray-600" />
                            <button onClick={handleSave} className="p-1 text-green-500"><SaveIcon /></button>
                            <button onClick={handleCancel} className="p-1 text-red-500"><TrashIcon /></button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-6 overflow-y-auto">
                {activeLookup ? (
                     <div className="space-y-6">
                        {!addingRuleType && !editingRule && (
                            <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                                <div className="hidden md:flex items-center justify-center gap-4">
                                    <span className="font-semibold text-gray-600 dark:text-gray-400">{t('addNewRule')}:</span>
                                    <button onClick={() => setAddingRuleType('single')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewSingleRule')}</button>
                                    <button onClick={() => setAddingRuleType('ligature')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewLigatureRule')}</button>
                                    <button onClick={() => setAddingRuleType('contextual')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewContextualRule')}</button>
                                    <button onClick={() => setAddingRuleType('multiple')} className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewMultipleRule')}</button>
                                </div>
                                 <div className="md:hidden flex flex-col items-center gap-4"><span className="font-semibold text-gray-600 dark:text-gray-400">{t('addNewRule')}:</span><div className="grid grid-cols-2 gap-2 w-full">
                                    <button onClick={() => setAddingRuleType('single')} className="px-2 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewSingleRule')}</button>
                                    <button onClick={() => setAddingRuleType('ligature')} className="px-2 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewLigatureRule')}</button>
                                    <button onClick={() => setAddingRuleType('contextual')} className="px-2 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewContextualRule')}</button>
                                    <button onClick={() => setAddingRuleType('multiple')} className="px-2 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">{t('addNewMultipleRule')}</button>
                                </div></div>
                            </div>
                        )}
                        {renderRuleSection(t('singleSubstitutionRules'), activeSingleRules, 'single')}
                        {renderRuleSection(t('multipleSubstitutionRules'), activeMultipleRules, 'multiple')}
                        {renderRuleSection(t('contextualRules'), activeContextualRules, 'contextual')}
                        {renderRuleSection(t('ligatureRules'), activeLigatureRules, 'ligature')}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        Select a lookup to view its rules, or add a new one.
                    </div>
                )}
            </main>
        </div>
    );
};

export default React.memo(LookupsPane);