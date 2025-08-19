import React, { useState, useMemo, useEffect, useRef } from 'react';
import { CharacterSet, Character } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';
import { useLayout } from '../../contexts/LayoutContext';
import { AddIcon, TrashIcon, EditIcon, SaveIcon } from '../../constants';

interface CharactersPaneProps {
    sets: CharacterSet[];
    onAddSet: () => void;
    onUpdateSetName: (index: number, newName: string) => void;
    onDeleteSet: (index: number) => void;
    onAddChar: (setIndex: number, newChar: Character) => void;
    onUpdateChar: (setIndex: number, charIndex: number, updatedChar: Character) => void;
    onDeleteChar: (setIndex: number, charIndex: number) => void;
    allChars: Character[];
}

const NEW_CHAR_STATE = { unicode: '', name: '', glyphClass: 'base' as const, lsb: '', rsb: '', advWidth: '', composite: [] as string[] };

const AddCharacterForm: React.FC<any> = ({ setIndex, onAddChar, allCharsByName, allCharsByUnicode, allChars }) => {
    const { t } = useLocale();
    const { showNotification } = useLayout();
    const [newChar, setNewChar] = useState(NEW_CHAR_STATE);
    const [isAddingComponent, setIsAddingComponent] = useState(false);
    const [componentSearchTerm, setComponentSearchTerm] = useState('');
    const [activeSearchIndex, setActiveSearchIndex] = useState(0);
    const componentAdderRef = useRef<HTMLDivElement>(null);
    const componentInputRef = useRef<HTMLInputElement>(null);

    const filteredChars = useMemo(() => {
        const currentComponents = newChar.composite;
        const availableChars = allChars.filter(c => !currentComponents.includes(c.name));
    
        if (!componentSearchTerm) {
            return availableChars;
        }
        return availableChars.filter(c => c.name.toLowerCase().includes(componentSearchTerm.toLowerCase()));
    }, [componentSearchTerm, allChars, newChar.composite]);

    useEffect(() => {
        if (isAddingComponent) {
            componentInputRef.current?.focus();
        }
    }, [isAddingComponent]);
    
    useEffect(() => {
        setActiveSearchIndex(0);
    }, [filteredChars]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
          if (isAddingComponent && componentAdderRef.current && !componentAdderRef.current.contains(event.target as Node)) {
            setIsAddingComponent(false);
            setComponentSearchTerm('');
          }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isAddingComponent]);

    const handleAddComponent = (name: string) => {
        setNewChar(c => ({...c, composite: [...c.composite, name]}));
        setComponentSearchTerm('');
        componentInputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && filteredChars.length > 0 && activeSearchIndex >= 0 && activeSearchIndex < filteredChars.length) {
            e.preventDefault();
            handleAddComponent(filteredChars[activeSearchIndex].name);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveSearchIndex(i => (i + 1) % filteredChars.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveSearchIndex(i => (i - 1 + filteredChars.length) % filteredChars.length);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsAddingComponent(false);
            setComponentSearchTerm('');
        }
    };


    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
    
        const trimmedName = newChar.name.trim();
        if (!trimmedName) {
            showNotification(t('errorNameRequired'), 'error');
            return;
        }
    
        if (allCharsByName.has(trimmedName)) {
            showNotification(t('errorNameExists'), 'error');
            return;
        }
    
        let unicodeVal: number | undefined = undefined;
        let isPuaAssigned = false;
        const trimmedUnicode = newChar.unicode.trim();
    
        if (trimmedUnicode) {
            if (!/^[0-9a-fA-F]{1,6}$/.test(trimmedUnicode)) {
                showNotification(t('errorInvalidCodepoint'), 'error');
                return;
            }
            unicodeVal = parseInt(trimmedUnicode, 16);
            if (allCharsByUnicode.has(unicodeVal)) {
                const existingChar = allCharsByUnicode.get(unicodeVal);
                showNotification(t('errorUnicodeExists') + ` (Used by '${existingChar?.name}')`, 'error');
                return;
            }
        } else if ([...trimmedName].length === 1) {
            const derivedUnicode = trimmedName.codePointAt(0)!;
             if (allCharsByUnicode.has(derivedUnicode)) {
                showNotification(t('errorUnicodeFromCharExists', { char: trimmedName, codepoint: derivedUnicode.toString(16).toUpperCase() }), 'error');
                return;
             }
            unicodeVal = derivedUnicode;
        } else {
            isPuaAssigned = true;
        }
    
        const charToAdd: Character = {
            name: trimmedName,
            glyphClass: newChar.glyphClass,
            isPuaAssigned: isPuaAssigned,
            ...(newChar.lsb && { lsb: parseInt(newChar.lsb) }),
            ...(newChar.rsb && { rsb: parseInt(newChar.rsb) }),
            ...(newChar.advWidth && { advWidth: parseInt(newChar.advWidth) }),
            ...(newChar.composite.length > 0 && { composite: newChar.composite }),
        };

        if (unicodeVal !== undefined) {
            charToAdd.unicode = unicodeVal;
        }
    
        onAddChar(setIndex, charToAdd);
        setNewChar(NEW_CHAR_STATE);
    };

    const handleRemoveComponent = (index: number) => {
        setNewChar(c => ({...c, composite: c.composite.filter((_, i) => i !== index)}));
    };

    return (
       <tr>
           <td className="p-1"><input type="text" placeholder={t('glyphNamePlaceholder')} value={newChar.name} onChange={e => setNewChar(c => ({...c, name: e.target.value}))} className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/></td>
            <td className="p-1"><input type="text" placeholder={t('unicodeHexPlaceholder')} value={newChar.unicode} onChange={e => setNewChar(c => ({...c, unicode: e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '')}))} className="w-20 p-1 border rounded dark:bg-gray-700 dark:border-gray-600 font-mono"/></td>
            <td className="p-1"><select value={newChar.glyphClass} onChange={e => setNewChar(c => ({...c, glyphClass: e.target.value as any}))} className="w-full p-1 border rounded dark:bg-gray-700 dark:border-gray-600"><option value="base">base</option><option value="mark">mark</option><option value="ligature">ligature</option></select></td>
            <td className="p-1"><input type="number" placeholder="30" value={newChar.lsb} onChange={e => setNewChar(c => ({...c, lsb: e.target.value}))} className="w-16 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/></td>
            <td className="p-1"><input type="number" placeholder="30" value={newChar.rsb} onChange={e => setNewChar(c => ({...c, rsb: e.target.value}))} className="w-16 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/></td>
            <td className="p-1"><input type="number" placeholder="600" value={newChar.advWidth} onChange={e => setNewChar(c => ({...c, advWidth: e.target.value}))} className="w-20 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"/></td>
            <td className="p-1">
                <div className="flex flex-wrap items-center gap-1">
                    {newChar.composite.map((compName: string, index: number) => (
                        <div key={index} className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 text-sm font-semibold px-2 py-1 rounded">
                            <span>{compName}</span>
                            <button type="button" onClick={() => handleRemoveComponent(index)} className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                            </button>
                        </div>
                    ))}
                    {isAddingComponent
                        ? (
                            <div ref={componentAdderRef} className="relative z-10 flex items-center gap-1">
                                <input
                                    ref={componentInputRef}
                                    type="text"
                                    value={componentSearchTerm}
                                    onChange={e => setComponentSearchTerm(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder={t('selectOrTypeGlyph')}
                                    className="w-32 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                                    autoComplete="off"
                                />
                                {filteredChars.length > 0 && (
                                    <ul className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                        {filteredChars.map((char, index) => (
                                            <li
                                                key={char.unicode || char.name}
                                                onClick={() => handleAddComponent(char.name)}
                                                onMouseEnter={() => setActiveSearchIndex(index)}
                                                className={`p-2 cursor-pointer text-gray-900 dark:text-gray-200 ${index === activeSearchIndex ? 'bg-indigo-100 dark:bg-indigo-700' : 'hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                            >
                                                {char.name}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )
                        : <button type="button" onClick={() => setIsAddingComponent(true)} className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600"><AddIcon className="w-4 h-4" /></button>
                    }
                </div>
            </td>
            <td className="p-1"><button type="button" onClick={handleFormSubmit} title={t('addCharacter')} className="p-2 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full"><AddIcon /></button></td>
       </tr>
    );
};

const CharactersPane: React.FC<CharactersPaneProps> = ({ sets, onAddSet, onUpdateSetName, onDeleteSet, onAddChar, onUpdateChar, onDeleteChar, allChars }) => {
    const { t } = useLocale();
    const [editingChar, setEditingChar] = useState<{setIndex: number, charIndex: number, data: any} | null>(null);
    const [isAddingComponent, setIsAddingComponent] = useState(false);
    const [componentSearchTerm, setComponentSearchTerm] = useState('');
    const [activeSearchIndex, setActiveSearchIndex] = useState(0);
    const componentAdderRef = useRef<HTMLDivElement>(null);
    const componentInputRef = useRef<HTMLInputElement>(null);

    const allCharsByName = useMemo(() => new Map(allChars.map((c: Character) => [c.name, c])), [allChars]);
    const allCharsByUnicode = useMemo(() => new Map(allChars.filter((c: Character) => c.unicode !== undefined && !c.isPuaAssigned).map((c: Character) => [c.unicode!, c])), [allChars]);

    const filteredChars = useMemo(() => {
        const currentComponents = editingChar?.data.composite || [];
        const availableChars = allChars.filter(c => !currentComponents.includes(c.name));

        if (!componentSearchTerm) {
            return availableChars;
        }
        return availableChars.filter(c => c.name.toLowerCase().includes(componentSearchTerm.toLowerCase()));
    }, [componentSearchTerm, allChars, editingChar]);
    
    useEffect(() => {
        setActiveSearchIndex(0);
    }, [filteredChars]);

    useEffect(() => {
        if (isAddingComponent) {
            componentInputRef.current?.focus();
        }
    }, [isAddingComponent]);
    
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (isAddingComponent && componentAdderRef.current && !componentAdderRef.current.contains(event.target as Node)) {
                setIsAddingComponent(false);
                setComponentSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isAddingComponent]);
    
    const handleAddComponent = (name: string) => {
        if (!editingChar) return;
        setEditingChar(s => s ? { ...s, data: { ...s.data, composite: [...s.data.composite, name] } } : null);
        setComponentSearchTerm('');
        componentInputRef.current?.focus();
    };
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && filteredChars.length > 0 && activeSearchIndex >= 0 && activeSearchIndex < filteredChars.length) {
            e.preventDefault();
            handleAddComponent(filteredChars[activeSearchIndex].name);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveSearchIndex(i => (i + 1) % filteredChars.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveSearchIndex(i => (i - 1 + filteredChars.length) % filteredChars.length);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            setIsAddingComponent(false);
            setComponentSearchTerm('');
        }
    };


    const handleStartEdit = (setIndex: number, charIndex: number, char: Character) => {
        setEditingChar({ setIndex, charIndex, data: {
            name: char.name || '',
            unicode: char.unicode !== undefined && !char.isPuaAssigned ? char.unicode.toString(16).toUpperCase() : '',
            glyphClass: char.glyphClass || 'base',
            lsb: char.lsb ?? '',
            rsb: char.rsb ?? '',
            advWidth: char.advWidth ?? '',
            composite: char.composite || []
        }});
        setIsAddingComponent(false);
        setComponentSearchTerm('');
    };

    const handleSaveEdit = () => {
        if (!editingChar) return;
        const { setIndex, charIndex, data } = editingChar;
        const charToUpdate = sets[setIndex].characters[charIndex];
        
        const updatedChar: Character = {
            ...charToUpdate,
            name: data.name,
            glyphClass: data.glyphClass,
            lsb: data.lsb !== '' ? parseInt(data.lsb) : undefined,
            rsb: data.rsb !== '' ? parseInt(data.rsb) : undefined,
            advWidth: data.advWidth !== '' ? parseInt(data.advWidth) : undefined,
            composite: data.composite.length > 0 ? data.composite : undefined,
        };
        
        const unicodeStr = data.unicode.trim();
        if (unicodeStr) {
            updatedChar.unicode = parseInt(unicodeStr, 16);
            updatedChar.isPuaAssigned = false;
        } else if ([...data.name].length === 1) {
            updatedChar.unicode = data.name.codePointAt(0);
            updatedChar.isPuaAssigned = false;
        } else {
            delete updatedChar.unicode;
            updatedChar.isPuaAssigned = true;
        }

        onUpdateChar(setIndex, charIndex, updatedChar);
        setEditingChar(null);
    };

    const isMismatched = (char: Character): boolean => {
        if (char.unicode === undefined || char.isPuaAssigned) {
            return false;
        }
        if ([...char.name].length !== 1) {
            return false;
        }
        return char.name.codePointAt(0) !== char.unicode;
    };
    
    const handleRemoveComponent = (index: number) => {
        if (!editingChar) return;
        setEditingChar(s => s ? { ...s, data: { ...s.data, composite: s.data.composite.filter((_: any, i: number) => i !== index) } } : null);
    };

    return <div className="space-y-6">
        <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow"><h3 className="text-xl font-bold mb-2">{t('charactersTabDescription')}</h3></div>
        {sets.map((set: CharacterSet, setIndex: number) => (
            <div key={setIndex} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="flex justify-between items-center mb-4">
                    <input type="text" value={set.nameKey} onChange={(e) => onUpdateSetName(setIndex, e.target.value)} className="text-xl font-bold p-1 -m-1 bg-transparent border-b-2 border-transparent focus:border-indigo-500 outline-none" />
                    <button onClick={() => onDeleteSet(setIndex)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><TrashIcon /></button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 dark:bg-gray-700"><tr>
                            <th className="p-2">{t('glyphName')}</th><th className="p-2">{t('unicode')}</th><th className="p-2">{t('glyphClass')}</th><th className="p-2">{t('lsb')}</th><th className="p-2">{t('rsb')}</th><th className="p-2">{t('advWidth')}</th><th className="p-2">{t('compositeComponents')}</th><th className="p-2">{t('actions')}</th>
                        </tr></thead>
                        <tbody>
                            {set.characters.map((char, charIndex) => (
                                editingChar?.setIndex === setIndex && editingChar?.charIndex === charIndex ? (
                                    <tr key={char.name + charIndex} className="bg-indigo-50 dark:bg-indigo-900/20">
                                        <td className="p-1"><input type="text" value={editingChar.data.name} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, name: e.target.value}} : null)} className="w-full p-1 border rounded dark:bg-gray-700"/></td>
                                        <td className="p-1"><input type="text" value={editingChar.data.unicode} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, unicode: e.target.value}} : null)} className="w-20 p-1 border rounded dark:bg-gray-700"/></td>
                                        <td className="p-1"><select value={editingChar.data.glyphClass} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, glyphClass: e.target.value as any}} : null)} className="w-full p-1 border rounded dark:bg-gray-700"><option>base</option><option>mark</option><option>ligature</option></select></td>
                                        <td className="p-1"><input type="number" value={editingChar.data.lsb} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, lsb: e.target.value}} : null)} className="w-16 p-1 border rounded dark:bg-gray-700"/></td>
                                        <td className="p-1"><input type="number" value={editingChar.data.rsb} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, rsb: e.target.value}} : null)} className="w-16 p-1 border rounded dark:bg-gray-700"/></td>
                                        <td className="p-1"><input type="number" value={editingChar.data.advWidth} onChange={e => setEditingChar(s => s ? {...s, data: {...s.data, advWidth: e.target.value}} : null)} className="w-20 p-1 border rounded dark:bg-gray-700"/></td>
                                        <td className="p-1">
                                            <div className="flex flex-wrap items-center gap-1">
                                                {editingChar.data.composite.map((compName: string, index: number) => (
                                                    <div key={index} className="flex items-center gap-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 text-sm font-semibold px-2 py-1 rounded">
                                                        <span>{compName}</span>
                                                        <button type="button" onClick={() => handleRemoveComponent(index)} className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300">
                                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                                        </button>
                                                    </div>
                                                ))}
                                                {isAddingComponent ? (
                                                    <div ref={componentAdderRef} className="relative z-10 flex items-center gap-1">
                                                        <input
                                                            ref={componentInputRef}
                                                            type="text"
                                                            value={componentSearchTerm}
                                                            onChange={e => setComponentSearchTerm(e.target.value)}
                                                            onKeyDown={handleKeyDown}
                                                            placeholder={t('selectOrTypeGlyph')}
                                                            className="w-32 p-1 border rounded dark:bg-gray-700 dark:border-gray-600"
                                                            autoComplete="off"
                                                        />
                                                        {filteredChars.length > 0 && (
                                                            <ul className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                                                                {filteredChars.map((char, index) => (
                                                                    <li
                                                                        key={char.unicode || char.name}
                                                                        onClick={() => handleAddComponent(char.name)}
                                                                        onMouseEnter={() => setActiveSearchIndex(index)}
                                                                        className={`p-2 cursor-pointer text-gray-900 dark:text-gray-200 ${index === activeSearchIndex ? 'bg-indigo-100 dark:bg-indigo-700' : 'hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                                                    >
                                                                        {char.name}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <button type="button" onClick={() => setIsAddingComponent(true)} className="w-8 h-8 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600"><AddIcon className="w-4 h-4" /></button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-1 flex items-center gap-1">
                                            <button onClick={handleSaveEdit} className="p-2 text-green-500 hover:bg-green-100 dark:hover:bg-green-900/50 rounded-full"><SaveIcon/></button>
                                            <button onClick={() => setEditingChar(null)} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full">{t('cancel')}</button>
                                        </td>
                                    </tr>
                                ) : (
                                <tr key={char.name + charIndex} className={`border-b dark:border-gray-700 ${isMismatched(char) ? 'bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-200' : ''}`}>
                                    <td className="p-2 font-xl font-bold">{char.name}</td><td className="p-2 font-mono">{char.unicode !== undefined && !char.isPuaAssigned ? `U+${char.unicode.toString(16).toUpperCase().padStart(4, '0')}` : '-'}</td><td className="p-2">{char.glyphClass}</td><td className="p-2">{char.lsb}</td><td className="p-2">{char.rsb}</td><td className="p-2">{char.advWidth}</td>
                                    <td className="p-2">
                                        <div className="flex flex-wrap gap-1">
                                            {char.composite?.map((comp, i) => (
                                                <span key={i} className="bg-gray-200 dark:bg-gray-600 text-xs font-semibold px-2 py-0.5 rounded">
                                                    {comp}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="p-2 flex items-center gap-1">
                                        <button onClick={() => handleStartEdit(setIndex, charIndex, char)} className="p-2 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-full"><EditIcon/></button>
                                        <button onClick={() => onDeleteChar(setIndex, charIndex)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full"><TrashIcon /></button>
                                    </td>
                                </tr>
                            )))}
                             <AddCharacterForm 
                                setIndex={setIndex} 
                                onAddChar={onAddChar}
                                allCharsByName={allCharsByName}
                                allCharsByUnicode={allCharsByUnicode}
                                allChars={allChars}
                            />
                        </tbody>
                    </table>
                </div>
            </div>
        ))}
        <button onClick={onAddSet} className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white font-semibold rounded-lg"><AddIcon /> {t('addCharacterSet')}</button>
    </div>;
};

export default CharactersPane;