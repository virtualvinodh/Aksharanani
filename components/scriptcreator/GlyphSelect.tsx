import React, { useMemo } from 'react';
import { CharacterSet } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';

interface GlyphSelectProps {
    characterSets: CharacterSet[];
    value: string;
    onChange: (value: string) => void;
    label: string;
    className?: string;
    groups?: Record<string, string[]>;
}

const GlyphSelect: React.FC<GlyphSelectProps> = ({ characterSets, value, onChange, label, className, groups }) => {
    const { t } = useLocale();
    const allChars = useMemo(() => {
        return characterSets.flatMap(cs => cs.characters).sort((a, b) => a.name.localeCompare(b.name));
    }, [characterSets]);

    return (
        <select
            value={value}
            onChange={e => onChange(e.target.value)}
            aria-label={label}
            className={`w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600 ${className}`}
        >
            <option value="">{label}</option>
            {groups && Object.keys(groups).length > 0 && (
                <optgroup label={t('glyphGroups')}>
                    {Object.keys(groups).map(groupName => (
                        <option key={`group-${groupName}`} value={`$${groupName}`}>
                            @{groupName}
                        </option>
                    ))}
                </optgroup>
            )}
            <optgroup label={t('characters')}>
                {allChars.map(char => (
                    <option key={char.unicode || char.name} value={char.name}>
                        {char.name}
                    </option>
                ))}
            </optgroup>
        </select>
    );
};

export default GlyphSelect;