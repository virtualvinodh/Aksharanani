import React from 'react';
import { Character, GlyphData } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import GlyphTile from '../GlyphTile';
import { EditIcon, ClearIcon } from '../../constants';

type RuleType = 'ligature' | 'contextual' | 'multiple' | 'single';
type ContextualRuleValue = { replace: string[]; left?: string[]; right?: string[] };

interface ExistingRuleDisplayProps {
    ruleKey: string;
    ruleValue: any;
    ruleType: RuleType;
    onEdit: () => void;
    onDelete: () => void;
    allCharsByName: Map<string, Character>;
    glyphDataMap?: Map<number, GlyphData>;
    strokeThickness?: number;
    mode?: 'editing' | 'creating';
}

const GlyphDisplay: React.FC<{ char: Character, glyphData?: GlyphData, strokeThickness: number, mode: 'editing' | 'creating' }> = ({ char, glyphData, strokeThickness, mode }) => {
    if (mode === 'editing') {
        return <GlyphTile character={char} glyphData={glyphData} strokeThickness={strokeThickness} />;
    }
    return <span className="p-2 border rounded bg-gray-100 dark:bg-gray-700 font-semibold">{char.name}</span>;
};

const ExistingRuleDisplay: React.FC<ExistingRuleDisplayProps> = ({ 
    ruleKey, ruleValue, ruleType, onEdit, onDelete, allCharsByName, 
    glyphDataMap, strokeThickness = 15, mode = 'editing' 
}) => {
    const { t } = useLocale();

    const renderRuleContent = () => {
        if (ruleType === 'single') {
            const inputName = Array.isArray(ruleValue) ? (ruleValue as string[])[0] : null;
        
            if (inputName && (ruleKey.startsWith('$') || inputName.startsWith('$'))) {
                const inputIsGroup = inputName.startsWith('$');
                const outputIsGroup = ruleKey.startsWith('$');
                
                const inputDisplay = inputIsGroup ? `@${inputName.substring(1)}` : inputName;
                const outputDisplay = outputIsGroup ? `@${ruleKey.substring(1)}` : ruleKey;

                const inputChar = !inputIsGroup ? allCharsByName.get(inputDisplay) : null;
                const outputChar = !outputIsGroup ? allCharsByName.get(outputDisplay) : null;
        
                return (
                    <>
                        {inputIsGroup ? (
                            <span className="p-2 h-20 flex items-center border rounded bg-purple-100 dark:bg-purple-900/50 font-mono text-purple-800 dark:text-purple-200">{inputDisplay}</span>
                        ) : (
                            inputChar && <GlyphDisplay char={inputChar} glyphData={glyphDataMap?.get(inputChar.unicode)} strokeThickness={strokeThickness} mode={mode} />
                        )}
                        <span className="text-2xl font-bold mx-4 text-indigo-500 dark:text-indigo-400">→</span>
                         {outputIsGroup ? (
                            <span className="p-2 h-20 flex items-center border rounded bg-purple-100 dark:bg-purple-900/50 font-mono text-purple-800 dark:text-purple-200">{outputDisplay}</span>
                        ) : (
                            outputChar && <GlyphDisplay char={outputChar} glyphData={glyphDataMap?.get(outputChar.unicode)} strokeThickness={strokeThickness} mode={mode} />
                        )}
                    </>
                );
            }
        
            const inputChar = inputName ? allCharsByName.get(inputName) : null;
            const outputChar = allCharsByName.get(ruleKey);
            return (
                 <>
                    {inputChar && <GlyphDisplay char={inputChar} glyphData={glyphDataMap?.get(inputChar.unicode)} strokeThickness={strokeThickness} mode={mode} />}
                    <span className="text-2xl font-bold mx-4 text-indigo-500 dark:text-indigo-400">→</span>
                    {outputChar && <GlyphDisplay char={outputChar} glyphData={glyphDataMap?.get(outputChar.unicode)} strokeThickness={strokeThickness} mode={mode} />}
                 </>
            );
        }
        if (ruleType === 'ligature') {
            const ligChar = allCharsByName.get(ruleKey);
            return (
                <>
                    {(ruleValue as string[]).map((compName, index) => {
                        const char = allCharsByName.get(compName);
                        if (!char) return null;
                        return (
                            <React.Fragment key={index}>
                                <GlyphDisplay char={char} glyphData={glyphDataMap?.get(char.unicode)} strokeThickness={strokeThickness} mode={mode} />
                                {index < ruleValue.length - 1 && <span className="text-xl font-bold text-gray-400 dark:text-gray-500">+</span>}
                            </React.Fragment>
                        );
                    })}
                    <span className="text-2xl font-bold mx-4 text-indigo-500 dark:text-indigo-400">→</span>
                    {ligChar && <GlyphDisplay char={ligChar} glyphData={glyphDataMap?.get(ligChar.unicode)} strokeThickness={strokeThickness} mode={mode} />}
                </>
            );
        }
        if (ruleType === 'contextual') {
            const contextRule = ruleValue as ContextualRuleValue;
            return (
                <>
                     {(contextRule.left || []).map((name, i) => {
                         if (name.startsWith('@')) {
                            return <div key={`l-${i}`} className="opacity-60 flex items-center justify-center p-2 h-20 bg-purple-100 dark:bg-purple-900/50 rounded-lg"><span className="font-mono text-sm text-purple-800 dark:text-purple-200">{name}</span></div>;
                         }
                         const char = allCharsByName.get(name);
                         if (!char) return null;
                         return <div key={`l-${i}`} className="opacity-60"><GlyphDisplay char={char} glyphData={glyphDataMap?.get(char.unicode)} strokeThickness={strokeThickness} mode={mode} /></div>
                     })}
                     {(contextRule.replace || []).map((targetName, i) => {
                        const char = allCharsByName.get(targetName);
                        if (!char) return null;
                        return <GlyphDisplay key={`t-${i}`} char={char} glyphData={glyphDataMap?.get(char.unicode)} strokeThickness={strokeThickness} mode={mode} />;
                     })}
                     {(contextRule.right || []).map((name, i) => {
                         if (name.startsWith('@')) {
                            return <div key={`r-${i}`} className="opacity-60 flex items-center justify-center p-2 h-20 bg-purple-100 dark:bg-purple-900/50 rounded-lg"><span className="font-mono text-sm text-purple-800 dark:text-purple-200">{name}</span></div>;
                         }
                         const char = allCharsByName.get(name);
                         if (!char) return null;
                         return <div key={`r-${i}`} className="opacity-60"><GlyphDisplay char={char} glyphData={glyphDataMap?.get(char.unicode)} strokeThickness={strokeThickness} mode={mode} /></div>
                     })}
                    <span className="text-2xl font-bold mx-4 text-indigo-500 dark:text-indigo-400">→</span>
                    {(() => {
                        const char = allCharsByName.get(ruleKey);
                        if (!char) return null;
                        return <GlyphDisplay char={char} glyphData={glyphDataMap?.get(char.unicode)} strokeThickness={strokeThickness} mode={mode} />;
                    })()}
                </>
            );
        }
        if (ruleType === 'multiple') {
            const inputName = Array.isArray(ruleValue) ? (ruleValue as string[])[0] : null;
            const inputChar = inputName ? allCharsByName.get(inputName) : null;
            const outputChars = (ruleKey).split(',').map(name => allCharsByName.get(name.trim()));
            return (
                <>
                    {inputChar && <GlyphDisplay char={inputChar} glyphData={glyphDataMap?.get(inputChar.unicode)} strokeThickness={strokeThickness} mode={mode} />}
                    <span className="text-2xl font-bold mx-4 text-indigo-500 dark:text-indigo-400">→</span>
                    {outputChars.map((char, index) => {
                        if (!char) return null;
                        return <GlyphDisplay key={index} char={char} glyphData={glyphDataMap?.get(char.unicode)} strokeThickness={strokeThickness} mode={mode} />;
                    })}
                </>
            );
        }
        return null;
    };

    return (
        <div className="flex flex-wrap items-center gap-2 p-2 pr-4 bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            {renderRuleContent()}
            <div className="flex items-center gap-1 ml-auto">
                <button onClick={onEdit} title={t('edit')} className="p-2 text-gray-400 hover:text-indigo-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                    <EditIcon />
                </button>
                <button onClick={onDelete} title={t('deleteRule')} className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                    <ClearIcon />
                </button>
            </div>
        </div>
    );
};

export default React.memo(ExistingRuleDisplay);