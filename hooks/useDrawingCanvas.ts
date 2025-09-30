import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Point, Path, Tool, AppSettings, ImageTransform, Segment } from '../types';
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
import { distanceToSegment } from '../utils/geometryUtils';
import { getAccurateGlyphBBox, curveToPolyline, quadraticCurveToPolyline } from '../services/glyphRenderService';

export { DraggedPointInfo, Handle };

declare var paper: any;

export const useDrawingCanvas = (props: UseDrawingCanvasProps) => {
    const {
        canvasRef, initialPaths, onPathsChange, tool, zoom, setZoom, viewOffset,
        setViewOffset, settings
    } = props;
    
    const [isDrawing, setIsDrawing] = useState(false);
    const [currentPaths, setCurrentPaths] = useState<Path[]>(initialPaths);
    const [previewPath, setPreviewPath] = useState<Path | null>(null);
    const [bgImageObject, setBgImageObject] = useState<HTMLImageElement | null>(null);
    const [hoveredPathId, setHoveredPathId] = useState<string | null>(null);
    const { theme } = useTheme();
    const { showNotification } = useLayout();
    const { t } = useLocale();

    // --- Animation State ---
    const zoomRef = useRef(zoom);
    const viewOffsetRef = useRef(viewOffset);
    const targetZoomRef = useRef(zoom);
    const targetViewOffsetRef = useRef(viewOffset);
    // FIX: The ref for requestAnimationFrame's ID must allow for `undefined` when the animation is not running.
    const animationFrameRef = useRef<number | undefined>();

    // Keep refs in sync with state for use in the animation loop
    useEffect(() => {
        zoomRef.current = zoom;
        viewOffsetRef.current = viewOffset;
    }, [zoom, viewOffset]);

    const startAnimation = useCallback(() => {
        if (animationFrameRef.current) return;

        const animate = () => {
            const LERP_FACTOR = 0.2; // Adjust for smoothness (lower is smoother but slower)
            
            const currentZoom = zoomRef.current;
            const currentOffset = viewOffsetRef.current;
            const targetZoom = targetZoomRef.current;
            const targetOffset = targetViewOffsetRef.current;
            
            const newZoom = currentZoom + (targetZoom - currentZoom) * LERP_FACTOR;
            const newOffset = {
                x: currentOffset.x + (targetOffset.x - currentOffset.x) * LERP_FACTOR,
                y: currentOffset.y + (targetOffset.y - currentOffset.y) * LERP_FACTOR,
            };

            const isZoomDone = Math.abs(newZoom - targetZoom) < 0.001;
            const isOffsetDone = VEC.len(VEC.sub(newOffset, targetOffset)) < 0.1;

            if (isZoomDone && isOffsetDone) {
                // Animation finished, snap to final values and stop loop
                setZoom(targetZoom);
                setViewOffset(targetOffset);
                animationFrameRef.current = undefined;
            } else {
                // Continue animation
                setZoom(newZoom);
                setViewOffset(newOffset);
                animationFrameRef.current = requestAnimationFrame(animate);
            }
        };

        animationFrameRef.current = requestAnimationFrame(animate);
    // FIX: Added missing dependency array to useCallback.
    }, [setZoom, setViewOffset]);

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

    const findPathAtPoint = useCallback((point: Point): Path | null => {
        const paperScope = new paper.PaperScope();
        paperScope.setup(new paperScope.Size(1, 1));
        const tolerance = (settings.strokeThickness / 2 + 5) / zoom;
        
        for (let i = currentPaths.length - 1; i >= 0; i--) {
            const path = currentPaths[i];

            if (path.type === 'outline' && path.segmentGroups) {
                let paperItem: any;
                const createPaperPath = (segments: Segment[]) => new paperScope.Path({ 
                    segments: segments.map(seg => new paperScope.Segment(new paperScope.Point(seg.point.x, seg.point.y), new paperScope.Point(seg.handleIn.x, seg.handleIn.y), new paperScope.Point(seg.handleOut.x, seg.handleOut.y))), 
                    closed: true 
                });
                
                if (path.segmentGroups.length > 1) {
                    const nonEmptyGroups = path.segmentGroups.filter(g => g.length > 0);
                    if (nonEmptyGroups.length > 0) {
                        paperItem = new paperScope.CompoundPath({ children: nonEmptyGroups.map(createPaperPath), fillRule: 'evenodd' });
                    }
                } else if (path.segmentGroups.length === 1 && path.segmentGroups[0].length > 0) {
                    paperItem = createPaperPath(path.segmentGroups[0]);
                }
                
                if (paperItem && paperItem.hitTest(new paperScope.Point(point.x, point.y), { fill: true, tolerance: 0 })) {
                    return path;
                }
                continue;
            }

            let pointsToCheck = path.points;

            if ((path.type === 'pen' || path.type === 'calligraphy') && path.points.length > 2) {
                pointsToCheck = curveToPolyline(path.points, 10);
            } else if (path.type === 'curve' && path.points.length === 3) {
                pointsToCheck = quadraticCurveToPolyline(path.points, 10);
            }
            
            for (let j = 0; j < pointsToCheck.length - 1; j++) {
                if (distanceToSegment(point, pointsToCheck[j], pointsToCheck[j + 1]).distance < tolerance) return path;
            }
        }
        return null;
    }, [currentPaths, settings.strokeThickness, zoom]);
    
    const toolProps = { ...props, isDrawing, setIsDrawing, currentPaths, setCurrentPaths, onPathsChange, previewPath, setPreviewPath, getCanvasPoint, showNotification, t, findPathAtPoint };
    
    const handlePan = useCallback((newOffset: Point) => {
        targetViewOffsetRef.current = newOffset;
        startAnimation();
    }, [startAnimation]);

    const panTool = usePanTool({ onPan: handlePan });
    const penTool = usePenTool(toolProps);
    const shapeTool = useShapeTool(toolProps);
    const curveTool = useCurveTool(toolProps);
    const selectTool = useSelectTool(toolProps);
    const editTool = useEditTool(toolProps);
    const eraserTool = useEraserTool(toolProps);

    const startInteraction = useCallback((point: Point, viewportPoint: Point, e: React.MouseEvent | React.TouchEvent) => {
        switch (tool) {
            case 'pan': panTool.startPan(viewportPoint, viewOffset); break;
            case 'pen': case 'calligraphy': penTool.start(point); break;
            case 'line': case 'circle': case 'ellipse': case 'dot': shapeTool.start(point); break;
            case 'curve': curveTool.start(point); break;
            case 'select': selectTool.start(point, e as React.MouseEvent); break;
            case 'edit': editTool.start(point); break;
            case 'eraser': eraserTool.start(point); break;
        }
    }, [tool, panTool, penTool, shapeTool, curveTool, selectTool, editTool, eraserTool, viewOffset]);

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
        setHoveredPathId(null);
    }, [tool, panTool, penTool, shapeTool, curveTool, selectTool, editTool, eraserTool]);
    
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 1 || (tool === 'pan' && e.button === 0)) {
            const viewportPoint = getViewportPoint(e);
            if(viewportPoint) panTool.startPan(viewportPoint, viewOffset);
            return;
        }
        const viewportPoint = getViewportPoint(e);
        if (viewportPoint) startInteraction(getCanvasPoint(viewportPoint), viewportPoint, e);
    }, [tool, getViewportPoint, getCanvasPoint, startInteraction, panTool, viewOffset]);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        const viewportPoint = getViewportPoint(e);
        if (!viewportPoint) return;
        if (panTool.isPanning) {
            panTool.move(viewportPoint);
            return;
        }
        const canvasPoint = getCanvasPoint(viewportPoint);
        if (!isDrawing && (tool === 'select' || tool === 'edit')) {
            const path = findPathAtPoint(canvasPoint);
            setHoveredPathId(path ? path.id : null);
        } else if (isDrawing) {
            setHoveredPathId(null);
        }
        moveInteraction(canvasPoint, viewportPoint);
    }, [getViewportPoint, getCanvasPoint, moveInteraction, panTool, isDrawing, tool, findPathAtPoint]);

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
            
            targetZoomRef.current = newZoom;
            targetViewOffsetRef.current = newViewOffset;
            startAnimation();

        } else if (!isPinchingRef.current && e.touches.length === 1) {
            const viewportPoint = getViewportPoint(e);
            if (viewportPoint) moveInteraction(getCanvasPoint(viewportPoint), viewportPoint);
        }
    }, [getViewportPoint, getCanvasPoint, moveInteraction, startAnimation]);

    const handleTouchEnd = useCallback((e: React.TouchEvent) => {
        if (isPinchingRef.current && e.touches.length < 2) {
            isPinchingRef.current = false;
            if (e.touches.length === 1) {
                const viewportPoint = getViewportPoint(e);
                if(viewportPoint) panTool.startPan(viewportPoint, viewOffset);
            }
        }
        if (e.touches.length === 0) {
            endInteraction();
        }
    }, [getViewportPoint, panTool, endInteraction, viewOffset]);

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        if (tool === 'edit') {
            const viewportPoint = getViewportPoint(e);
            if (viewportPoint) editTool.doubleClick(getCanvasPoint(viewportPoint));
        }
    }, [tool, getViewportPoint, getCanvasPoint, editTool]);
    
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault(); 
        const viewportPoint = getViewportPoint(e); 
        if (!viewportPoint) return;
        
        const zoomFactor = -e.deltaY * 0.001; 
        const newZoom = Math.max(0.1, Math.min(10, zoom * (1 + zoomFactor)));
        
        const pointInCanvas = getCanvasPoint(viewportPoint);
        
        const newViewOffset = { 
            x: viewportPoint.x - pointInCanvas.x * newZoom, 
            y: viewportPoint.y - pointInCanvas.y * newZoom 
        };

        targetZoomRef.current = newZoom;
        targetViewOffsetRef.current = newViewOffset;
        startAnimation();

    }, [getViewportPoint, zoom, getCanvasPoint, startAnimation]);
    
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
        hoveredPathId,
        handleMouseDown, handleMouseMove, handleMouseUp: endInteraction, handleTouchStart, handleTouchMove,
        handleTouchEnd, handleTouchCancel: endInteraction,
        handleWheel, handleDoubleClick, getCursor, handles: selectTool.handles,
        isMobile: selectTool.isMobile, HANDLE_SIZE: selectTool.HANDLE_SIZE,
    };
};
