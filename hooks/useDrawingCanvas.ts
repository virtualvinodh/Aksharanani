import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Point, Path, Tool, AppSettings, ImageTransform } from '../types';
import { VEC } from '../utils/vectorUtils';
import { useTheme } from '../contexts/ThemeContext';
import { DraggedPointInfo, UseDrawingCanvasProps, Handle } from './drawingTools/types';
import { usePanTool } from './drawingTools/usePanTool';
import { usePenTool } from './drawingTools/usePenTool';
import { useShapeTool } from './drawingTools/useShapeTool';
import { useCurveTool } from './drawingTools/useCurveTool';
import { useSelectTool } from './drawingTools/useSelectTool';
import { useEditTool } from './drawingTools/useEditTool';
import { useEraserTool } from './drawingTools/useEraserTool';
import { useLayout } from '../../contexts/LayoutContext';
import { useLocale } from '../../contexts/LocaleContext';

export { DraggedPointInfo, Handle };

export const useDrawingCanvas = (props: UseDrawingCanvasProps) => {
    const {
        canvasRef, initialPaths, onPathsChange, tool, zoom, setZoom, viewOffset,
        setViewOffset, settings
    } = props;
    
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPaths, setCurrentPaths] = useState<Path[]>(initialPaths);
    const [previewPath, setPreviewPath] = useState<Path | null>(null);
    const [bgImageObject, setBgImageObject] = useState<HTMLImageElement | null>(null);
    const { theme } = useTheme();
    const { showNotification } = useLayout();
    const { t } = useLocale();

    const isPinchingRef = useRef(false);
    const pinchStartDistanceRef = useRef(0);
    const pinchStartZoomRef = useRef(zoom);

    useEffect(() => { setCurrentPaths(initialPaths); }, [initialPaths]);

    useEffect(() => {
        if (props.backgroundImage) {
            const img = new Image();
            img.onload = () => setBgImageObject(img);
            img.onerror = () => setBgImageObject(null);
            img.src = props.backgroundImage;
        } else {
            setBgImageObject(null);
        }
    }, [props.backgroundImage]);

    const getViewportPoint = useCallback((e: React.MouseEvent | React.TouchEvent | React.WheelEvent, touchIndex = 0): Point | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const pointSource = 'touches' in e ? e.touches[touchIndex] : e;
        if (!pointSource) return null;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return { x: (pointSource.clientX - rect.left) * scaleX, y: (pointSource.clientY - rect.top) * scaleY };
    }, [canvasRef]);

    const getCanvasPoint = useCallback((viewportPoint: Point): Point => ({
        x: (viewportPoint.x - viewOffset.x) / zoom,
        y: (viewportPoint.y - viewOffset.y) / zoom,
    }), [viewOffset, zoom]);
    
    const toolProps = { ...props, isDrawing, setIsDrawing, currentPaths, setCurrentPaths, onPathsChange, previewPath, setPreviewPath, getCanvasPoint, showNotification, t };
    
    const panTool = usePanTool({ setViewOffset, viewOffset });
    const penTool = usePenTool(toolProps);
    const shapeTool = useShapeTool(toolProps);
    const curveTool = useCurveTool(toolProps);
    const selectTool = useSelectTool(toolProps);
    const editTool = useEditTool(toolProps);
    const eraserTool = useEraserTool(toolProps);

    const startInteraction = useCallback((point: Point, viewportPoint: Point, e: React.MouseEvent | React.TouchEvent) => {
        switch (tool) {
            case 'pan': panTool.startPan(viewportPoint); break;
            case 'pen': case 'calligraphy': penTool.start(point); break;
            case 'line': case 'circle': case 'ellipse': case 'dot': shapeTool.start(point); break;
            case 'curve': curveTool.start(point); break;
            case 'select': selectTool.start(point, e as React.MouseEvent); break;
            case 'edit': editTool.start(point); break;
            case 'eraser': eraserTool.start(point); break;
        }
    }, [tool, panTool, penTool, shapeTool, curveTool, selectTool, editTool, eraserTool]);

    const moveInteraction = useCallback((point: Point, viewportPoint: Point) => {
        switch (tool) {
            case 'pan': panTool.move(viewportPoint); break;
            case 'pen': case 'calligraphy': penTool.move(point); break;
            case 'line': case 'circle': case 'ellipse': case 'dot': shapeTool.move(point); break;
            case 'curve': curveTool.move(point); break;
            case 'select': selectTool.move(point); break;
            case 'edit': editTool.move(point); break;
            case 'eraser': eraserTool.move(point); break;
        }
    }, [tool, panTool, penTool, shapeTool, curveTool, selectTool, editTool, eraserTool]);

    const endInteraction = useCallback(() => {
        isPinchingRef.current = false;
        switch (tool) {
            case 'pan': panTool.end(); break;
            case 'pen': case 'calligraphy': penTool.end(); break;
            case 'line': case 'circle': case 'ellipse': case 'dot': shapeTool.end(); break;
            case 'curve': curveTool.end(); break;
            case 'select': selectTool.end(); break;
            case 'edit': editTool.end(); break;
            case 'eraser': eraserTool.end(); break;
        }
    }, [tool, panTool, penTool, shapeTool, curveTool, selectTool, editTool, eraserTool]);
    
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 || (tool === 'pan' && e.button === 0)) {
            const viewportPoint = getViewportPoint(e);
            if(viewportPoint) panTool.startPan(viewportPoint);
            return;
        }
        const viewportPoint = getViewportPoint(e);
        if (viewportPoint) startInteraction(getCanvasPoint(viewportPoint), viewportPoint, e);
    }, [tool, getViewportPoint, getCanvasPoint, startInteraction, panTool]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;
        if (panTool.isPanning) {
            panTool.move(viewportPoint);
            return;
        }
        moveInteraction(getCanvasPoint(viewportPoint), viewportPoint);
    }, [getViewportPoint, getCanvasPoint, moveInteraction, panTool]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        if (tool === 'pan' && e.touches.length === 2) {
            e.preventDefault();
            isPinchingRef.current = true;
            const p1 = getViewportPoint(e, 0)!;
            const p2 = getViewportPoint(e, 1)!;
            pinchStartDistanceRef.current = VEC.len(VEC.sub(p1, p2));
            pinchStartZoomRef.current = zoom;
        } else if (e.touches.length === 1) {
            const viewportPoint = getViewportPoint(e);
            if (viewportPoint) startInteraction(getCanvasPoint(viewportPoint), viewportPoint, e);
        }
    }, [tool, getViewportPoint, getCanvasPoint, startInteraction, zoom]);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (isPinchingRef.current && e.touches.length === 2) {
            e.preventDefault();
            const p1 = getViewportPoint(e, 0)!;
            const p2 = getViewportPoint(e, 1)!;
            const currentDist = VEC.len(VEC.sub(p1, p2));

            const zoomFactor = currentDist / pinchStartDistanceRef.current;
            const newZoom = Math.max(0.1, Math.min(10, pinchStartZoomRef.current * zoomFactor));

            const midPointViewport = VEC.scale(VEC.add(p1, p2), 0.5);
            const pointInCanvas = getCanvasPoint(midPointViewport);
            
            const newViewOffset = {
                x: midPointViewport.x - pointInCanvas.x * newZoom,
                y: midPointViewport.y - pointInCanvas.y * newZoom
            };
            
            setZoom(newZoom);
            setViewOffset(newViewOffset);

        } else if (!isPinchingRef.current && e.touches.length === 1) {
            const viewportPoint = getViewportPoint(e);
            if (viewportPoint) moveInteraction(getCanvasPoint(viewportPoint), viewportPoint);
        }
    }, [getViewportPoint, getCanvasPoint, moveInteraction, setZoom, setViewOffset]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (isPinchingRef.current && e.touches.length < 2) {
            isPinchingRef.current = false;
            if (e.touches.length === 1) {
                const viewportPoint = getViewportPoint(e);
                if(viewportPoint) panTool.startPan(viewportPoint);
            }
        }
        if (e.touches.length === 0) {
            endInteraction();
        }
    }, [getViewportPoint, panTool, endInteraction]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        if (tool === 'edit') {
            const viewportPoint = getViewportPoint(e);
            if (viewportPoint) editTool.doubleClick(getCanvasPoint(viewportPoint));
        }
    }, [tool, getViewportPoint, getCanvasPoint, editTool]);
    
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault(); const viewportPoint = getViewportPoint(e); if (!viewportPoint) return;
        const zoomFactor = -e.deltaY * 0.001; const newZoom = Math.max(0.1, Math.min(10, zoom * (1 + zoomFactor)));
        const pointInCanvas = getCanvasPoint(viewportPoint);
        const newViewOffset = { x: viewportPoint.x - pointInCanvas.x * newZoom, y: viewportPoint.y - pointInCanvas.y * newZoom };
        setZoom(newZoom); setViewOffset(newViewOffset);
    }, [getViewportPoint, zoom, getCanvasPoint, setZoom, setViewOffset]);
    
    const getCursor = useCallback(() => {
        if (panTool.isPanning) return 'grabbing';
        switch (tool) {
            case 'pan': return 'grab';
            case 'select': return selectTool.getCursor();
            case 'edit': return editTool.getCursor();
            case 'eraser': {
                const eraserDiameter = Math.max(4, Math.min(128, settings.strokeThickness * zoom));
                const r = eraserDiameter / 2;
                const strokeColor = theme === 'dark' ? 'white' : 'black';
                const svg = `<svg width="${eraserDiameter}" height="${eraserDiameter}" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="${r}" cy="${r}" r="${r - 1}" fill="none" stroke="${strokeColor}" stroke-width="1.5" />
                </svg>`;
                return `url('data:image/svg+xml;utf8,${encodeURIComponent(svg)}') ${r} ${r}, crosshair`;
            }
            case 'curve': return curveTool.getCursor();
            default: return 'crosshair';
        }
    }, [tool, panTool.isPanning, selectTool, editTool, curveTool, settings.strokeThickness, zoom, theme]);
    
    return {
        currentPaths, previewPath, marqueeBox: selectTool.marqueeBox, selectionBox: selectTool.selectionBox,
        focusedPathId: editTool.focusedPathId, selectedPointInfo: editTool.selectedPointInfo, bgImageObject,
        handleMouseDown, handleMouseMove, handleMouseUp: endInteraction, handleTouchStart, handleTouchMove,
        handleTouchEnd, handleTouchCancel: endInteraction,
        handleWheel, handleDoubleClick, getCursor, handles: selectTool.handles,
        isMobile: selectTool.isMobile, HANDLE_SIZE: selectTool.HANDLE_SIZE,
    };
};
