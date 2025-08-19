
import { useState, useCallback } from 'react';
import { Point } from '../../types';
import { VEC } from '../../utils/vectorUtils';

interface PanToolProps {
    viewOffset: Point;
    setViewOffset: (offset: Point) => void;
}

export const usePanTool = ({ viewOffset, setViewOffset }: PanToolProps) => {
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

    const startPan = useCallback((viewportPoint: Point) => {
        setIsPanning(true);
        setPanStart(viewportPoint);
    }, []);

    const move = useCallback((viewportPoint: Point) => {
        if (!isPanning) return;
        setViewOffset(VEC.add(viewOffset, VEC.sub(viewportPoint, panStart)));
        setPanStart(viewportPoint); // Update panStart for continuous panning
    }, [isPanning, panStart, setViewOffset, viewOffset]);

    const end = useCallback(() => {
        setIsPanning(false);
    }, []);

    return {
        isPanning,
        startPan,
        move,
        end,
    };
};
