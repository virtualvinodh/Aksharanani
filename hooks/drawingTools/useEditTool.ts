

import { useState, useEffect, useCallback } from 'react';
import { Path } from '../../types';
import { VEC } from '../../utils/vectorUtils';
import { distanceToSegment } from '../../utils/geometryUtils';
import { DraggedPointInfo, ToolHookProps } from './types';

export const useEditTool = ({ isDrawing, setIsDrawing, currentPaths, setCurrentPaths, onPathsChange, zoom }: ToolHookProps) => {
    const [draggedPointInfo, setDraggedPointInfo] = useState<DraggedPointInfo | null>(null);
    const [selectedPointInfo, setSelectedPointInfo] = useState<DraggedPointInfo | null>(null);
    const [focusedPathId, setFocusedPathId] = useState<string | null>(null);

    const getEditablePointAt = useCallback((point: any) => {
        const tolerance = 10 / zoom;
        for (let i = currentPaths.length - 1; i >= 0; i--) {
            const path = currentPaths[i];
            if (path.type === 'outline') continue;
            for (let j = 0; j < path.points.length; j++) {
                if (VEC.len(VEC.sub(point, path.points[j])) < tolerance) {
                    return { pathId: path.id, pointIndex: j };
                }
            }
        }
        return null;
    }, [currentPaths, zoom]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!selectedPointInfo) return;
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                const pathToDeleteFrom = currentPaths.find(p => p.id === selectedPointInfo.pathId);
                if (!pathToDeleteFrom) return;

                let newPaths: Path[];
                if (pathToDeleteFrom.points.length <= 2) {
                    newPaths = currentPaths.filter(p => p.id !== selectedPointInfo.pathId);
                } else {
                    newPaths = currentPaths.map(p => {
                        if (p.id === selectedPointInfo.pathId) {
                            return { ...p, points: p.points.filter((_, index) => index !== selectedPointInfo.pointIndex) };
                        }
                        return p;
                    });
                }
                onPathsChange(newPaths);
                setSelectedPointInfo(null);
                setFocusedPathId(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPointInfo, currentPaths, onPathsChange]);

    const start = (point: any) => {
        const grabbedPoint = getEditablePointAt(point);
        if (grabbedPoint) {
            setDraggedPointInfo(grabbedPoint);
            setSelectedPointInfo(grabbedPoint);
            setFocusedPathId(grabbedPoint.pathId);
            setIsDrawing(true);
        } else {
            setSelectedPointInfo(null);
            setFocusedPathId(null);
        }
    };

    const move = (point: any) => {
        if (isDrawing && draggedPointInfo) {
            setCurrentPaths(prev => prev.map(p => {
                if (p.id === draggedPointInfo.pathId) {
                    const newPoints = [...p.points];
                    newPoints[draggedPointInfo.pointIndex] = point;
                    return { ...p, points: newPoints };
                }
                return p;
            }));
        }
    };

    const end = () => {
        if (isDrawing) {
            if (draggedPointInfo) {
                onPathsChange(currentPaths);
            }
            setIsDrawing(false);
            setDraggedPointInfo(null);
        }
    };
    
    const doubleClick = (clickPoint: any) => {
        // First, check if a point was double-clicked to delete it.
        const pointToDelete = getEditablePointAt(clickPoint);
        if (pointToDelete) {
            const pathToDeleteFrom = currentPaths.find(p => p.id === pointToDelete.pathId);
            if (!pathToDeleteFrom) return;

            let newPaths: Path[];
            if (pathToDeleteFrom.points.length <= 2) {
                // If 2 or fewer points, delete the whole path
                newPaths = currentPaths.filter(p => p.id !== pointToDelete.pathId);
            } else {
                // Otherwise, just delete the point
                newPaths = currentPaths.map(p => {
                    if (p.id === pointToDelete.pathId) {
                        return { ...p, points: p.points.filter((_, index) => index !== pointToDelete.pointIndex) };
                    }
                    return p;
                });
            }
            onPathsChange(newPaths);
            setSelectedPointInfo(null);
            setFocusedPathId(null);
            return; // Exit after deleting
        }

        // If no point was clicked, fall back to adding a point on a segment.
        let closestSegment = { distance: Infinity, pathId: '', segmentIndex: -1, newPoint: { x: 0, y: 0 } };
        const tolerance = 10 / zoom;
        currentPaths.forEach(path => {
            if (path.type === 'outline') return;
            if (path.type !== 'pen' && path.type !== 'line') return;
            for (let i = 0; i < path.points.length - 1; i++) {
                const { distance, projection } = distanceToSegment(clickPoint, path.points[i], path.points[i+1]);
                if (distance < closestSegment.distance) {
                    closestSegment = { distance, pathId: path.id, segmentIndex: i, newPoint: projection };
                }
            }
        });
        if (closestSegment.distance < tolerance) {
            const newPaths = currentPaths.map(p => {
                if (p.id === closestSegment.pathId) {
                    const newPoints = [...p.points];
                    newPoints.splice(closestSegment.segmentIndex + 1, 0, closestSegment.newPoint);
                    return { ...p, points: newPoints };
                }
                return p;
            });
            onPathsChange(newPaths);
            setFocusedPathId(closestSegment.pathId);
        }
    };

    const getCursor = () => {
        if (isDrawing && draggedPointInfo) return 'grabbing';
        return 'default'; // Let canvas handle pointer based on hover
    };

    return { start, move, end, doubleClick, getCursor, selectedPointInfo, focusedPathId };
};