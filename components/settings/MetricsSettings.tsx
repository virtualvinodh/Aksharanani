import React from 'react';
import { FontMetrics } from '../../types';
import { useLocale } from '../../contexts/LocaleContext';

interface MetricsSettingsProps {
    metrics: FontMetrics;
    onMetricsChange: React.Dispatch<React.SetStateAction<FontMetrics>>;
}

const MetricsSettings: React.FC<MetricsSettingsProps> = ({ metrics, onMetricsChange }) => {
    const { t } = useLocale();
    
    const handleMetricsChange = (key: keyof FontMetrics, isNumeric: boolean = false) => (e: React.ChangeEvent<HTMLInputElement>) => {
        onMetricsChange(prev => ({
            ...prev,
            [key]: isNumeric ? Number(e.target.value) : e.target.value
        }));
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-6">
            <div>
                <label htmlFor="unitsPerEm" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsUnitsPerEm')}</label>
                <input type="number" id="unitsPerEm" value={metrics.unitsPerEm} onChange={handleMetricsChange('unitsPerEm', true)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="ascender" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsAscender')}</label>
                <input type="number" id="ascender" value={metrics.ascender} onChange={handleMetricsChange('ascender', true)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="descender" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsDescender')}</label>
                <input type="number" id="descender" value={metrics.descender} onChange={handleMetricsChange('descender', true)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="defaultAdvanceWidth" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsDefaultAdvanceWidth')}</label>
                <input type="number" id="defaultAdvanceWidth" value={metrics.defaultAdvanceWidth} onChange={handleMetricsChange('defaultAdvanceWidth', true)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="topLineY" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsTopLineY')}</label>
                <input type="number" id="topLineY" value={metrics.topLineY} onChange={handleMetricsChange('topLineY', true)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="baseLineY" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsBaseLineY')}</label>
                <input type="number" id="baseLineY" value={metrics.baseLineY} onChange={handleMetricsChange('baseLineY', true)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div className="sm:col-span-2">
                <label htmlFor="styleName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsStyleName')}</label>
                <input type="text" id="styleName" value={metrics.styleName} onChange={handleMetricsChange('styleName')} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="spaceAdvanceWidth" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsSpaceAdvanceWidth')}</label>
                <input type="number" id="spaceAdvanceWidth" value={metrics.spaceAdvanceWidth} onChange={handleMetricsChange('spaceAdvanceWidth', true)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="defaultLSB" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsDefaultLSB')}</label>
                <input type="number" id="defaultLSB" value={metrics.defaultLSB} onChange={handleMetricsChange('defaultLSB', true)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
            <div>
                <label htmlFor="defaultRSB" className="block text-sm font-medium text-gray-700 dark:text-gray-300">{t('fontMetricsDefaultRSB')}</label>
                <input type="number" id="defaultRSB" value={metrics.defaultRSB} onChange={handleMetricsChange('defaultRSB', true)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"/>
            </div>
        </div>
    );
};

export default React.memo(MetricsSettings);