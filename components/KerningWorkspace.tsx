import React from 'react';
import KerningPage from './KerningPage';
import { RecommendedKerning } from '../types';
import ProgressIndicator from './ProgressIndicator';

interface KerningWorkspaceProps {
    recommendedKerning: RecommendedKerning[] | null;
    kerningProgress: { completed: number; total: number };
}

const KerningWorkspace: React.FC<KerningWorkspaceProps> = (props) => {
    const { kerningProgress, ...kerningPageProps } = props;

    return (
        <div className="flex flex-col h-full overflow-hidden">
             <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <ProgressIndicator
                    completed={kerningProgress.completed}
                    total={kerningProgress.total}
                    progressTextKey="kerningProgress"
                />
            </div>
            <div className="flex-grow overflow-y-auto">
                <KerningPage {...kerningPageProps} />
            </div>
        </div>
    );
};

export default React.memo(KerningWorkspace);
