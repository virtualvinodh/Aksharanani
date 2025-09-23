
import React, { useState } from 'react';
import KerningPage from './KerningPage';
import { RecommendedKerning } from '../types';
import ProgressIndicator from './ProgressIndicator';
import { useSettings } from '../contexts/SettingsContext';
import { useLocale } from '../contexts/LocaleContext';

interface KerningWorkspaceProps {
    recommendedKerning: RecommendedKerning[] | null;
    kerningProgress: { completed: number; total: number };
}

const KerningWorkspace: React.FC<KerningWorkspaceProps> = (props) => {
    const { kerningProgress, ...kerningPageProps } = props;
    const { settings } = useSettings();
    const { t } = useLocale();
    const [activeTab, setActiveTab] = useState<'recommended' | 'all'>('recommended');

    if (!settings) return null;

    const progressTextKey = settings.editorMode === 'simple' ? "spacingProgress" : "kerningProgress";

    return (
        <div className="flex flex-col h-full overflow-hidden">
             <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <nav className="flex space-x-2 px-2 sm:px-4">
                    <button
                        onClick={() => setActiveTab('recommended')}
                        className={`flex-shrink-0 py-3 px-3 sm:px-4 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'recommended'
                                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                    >
                        {t('kerningRecommended')}
                    </button>
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`flex-shrink-0 py-3 px-3 sm:px-4 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'all'
                                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                        }`}
                    >
                        {t('kerningAllPairs')}
                    </button>
                </nav>
            </div>
             <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <ProgressIndicator
                    completed={kerningProgress.completed}
                    total={kerningProgress.total}
                    progressTextKey={progressTextKey}
                />
            </div>
            <div className="flex-grow overflow-y-auto">
                <KerningPage 
                    {...kerningPageProps} 
                    editorMode={settings.editorMode}
                    mode={activeTab}
                    showRecommendedLabel={activeTab === 'all'}
                />
            </div>
        </div>
    );
};

export default React.memo(KerningWorkspace);