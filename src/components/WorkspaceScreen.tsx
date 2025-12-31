import React, { useState, useRef, useEffect, DragEvent, ChangeEvent, MouseEvent as ReactMouseEvent } from 'react';
import { 
  ImagePlus, Layers, ArrowLeft, Upload, Loader2, AlertCircle, 
  RefreshCw, GripVertical, Wand2, Download, RotateCcw, CheckCircle2, Info, X, Plus, UploadCloud,
  Undo, Redo, ZoomIn, ZoomOut, Maximize, Crop, MousePointer2, Move, Hand, Trash2 
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface WorkspaceScreenProps {
  onBack: () => void;
}

// --- 类型定义 ---

interface TattooDesign {
  id: string;
  title: string;
  imageUrl: string;
}

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ZoomState {
  scale: number;
  x: number;
  y: number;
}

interface SelectionBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDrawing: boolean;
}

interface PlacedTattoo {
  id: string; // 唯一实例ID
  libraryId: string; // 原始库ID
  image: HTMLImageElement; // 图片对象
  x: number; // 中心点X
  y: number; // 中心点Y
  width: number;
  height: number;
  rotation: number; // 弧度
}

interface HistorySnapshot {
  backgroundDataUrl: string;
  tattoos: PlacedTattoo[]; 
}

// 交互模式：增加 PAN_VIEW (平移视角)
type InteractionMode = 'NONE' | 'MOVE' | 'RESIZE' | 'ROTATE' | 'PAN_VIEW';

// --- 初始数据 ---
const INITIAL_TATTOO_LIBRARY: TattooDesign[] = [
  { id: 't1', title: '传统黑龙', imageUrl: 'https://placehold.co/200x200/1a1a1a/FFFFFF/png?text=Dragon' },
  { id: 't2', title: '极简玫瑰', imageUrl: 'https://placehold.co/200x200/3e0000/FFCCCC/png?text=Rose' },
  { id: 't3', title: '几何图形', imageUrl: 'https://placehold.co/200x200/0f172a/38bdf8/png?text=Geo' },
  { id: 't4', title: '部落图腾', imageUrl: 'https://placehold.co/200x200/000000/FFFFFF/png?text=Tribal' },
  { id: 't5', title: '水彩飞鸟', imageUrl: 'https://placehold.co/200x200/1e1b4b/818cf8/png?text=Bird' },
  { id: 't6', title: '点刺曼陀罗', imageUrl: 'https://placehold.co/200x200/27272a/a1a1aa/png?text=Mandala' },
  { id: 't7', title: '日式锦鲤', imageUrl: 'https://placehold.co/200x200/450a0a/fca5a5/png?text=Koi' },
  { id: 't8', title: '手写字体', imageUrl: 'https://placehold.co/200x200/171717/e5e5e5/png?text=Script' },
];

/**
 * 图像压缩辅助函数
 */
const compressCanvasImage = (sourceCanvas: HTMLCanvasElement, quality = 0.8, maxDimension = 1024): string => {
  let width = sourceCanvas.width;
  let height = sourceCanvas.height;

  if (width > maxDimension || height > maxDimension) {
    const ratio = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * ratio);
    height = Math.round(height * ratio);
  }

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const ctx = tempCanvas.getContext('2d');
  
  if (!ctx) return '';
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  return tempCanvas.toDataURL('image/jpeg', quality).split(',')[1];
};

/**
 * 操作台界面组件
 * 阶段 14 更新：添加垃圾桶删除功能
 */
export const WorkspaceScreen: React.FC<WorkspaceScreenProps> = ({ onBack }) => {
  // --- 状态管理 ---
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasImage, setHasImage] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  
  // 纹身库状态
  const [tattooLibrary, setTattooLibrary] = useState<TattooDesign[]>(INITIAL_TATTOO_LIBRARY);
  const [isDraggingOverLibrary, setIsDraggingOverLibrary] = useState(false);
  const [dragOverTattooId, setDragOverTattooId] = useState<string | null>(null);

  // 场景对象状态
  const [tattoos, setTattoos] = useState<PlacedTattoo[]>([]);
  const [selectedTattooId, setSelectedTattooId] = useState<string | null>(null);

  // 删除功能状态 (新增)
  const [isDraggingOverTrash, setIsDraggingOverTrash] = useState(false);

  // 历史记录状态
  interface SerializedSnapshot {
    bg: string;
    tattoos: {
      id: string; libraryId: string; src: string; 
      x: number; y: number; w: number; h: number; r: number; 
    }[];
  }
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 缩放状态
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, x: 0, y: 0 });
  const zoomRef = useRef<ZoomState>({ scale: 1, x: 0, y: 0 }); 

  // 截图模式状态
  const [isScreenshotMode, setIsScreenshotMode] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);

  // 交互状态
  const interactionModeRef = useRef<InteractionMode>('NONE');
  const lastMousePosRef = useRef<{x: number, y: number}>({x: 0, y: 0}); // 记录 Canvas 内部坐标
  const lastClientPosRef = useRef<{x: number, y: number}>({x: 0, y: 0}); // 记录屏幕坐标
  const initialTattooStateRef = useRef<PlacedTattoo | null>(null); 

  const [toast, setToast] = useState<ToastState>({ show: false, message: '', type: 'info' });

  // --- Refs ---
  const canvasContainerRef = useRef<HTMLDivElement>(null); 
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const libraryRef = useRef<HTMLElement>(null); // 新增：纹身库容器引用
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tattooInputRef = useRef<HTMLInputElement>(null);
  const rafIdRef = useRef<number | null>(null);

  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const currentBgRef = useRef<HTMLImageElement | null>(null);
  const draggingTattooImgRef = useRef<HTMLImageElement | null>(null);
  const draggingTattooDataRef = useRef<TattooDesign | null>(null);

  // --- 核心渲染循环 ---
  useEffect(() => {
    renderCanvas();
  }, [tattoos, selectedTattooId, hasImage]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      // 清理全局事件监听，防止组件卸载后报错
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  // --- 缩放事件监听 ---
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (isScreenshotMode) return;
      if (!e.ctrlKey) return;
      e.preventDefault();

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const { scale, x, y } = zoomRef.current;
      const delta = -e.deltaY;
      const zoomFactor = 0.15; 
      const direction = delta > 0 ? 1 : -1;
      const newScale = Math.min(Math.max(scale * (1 + direction * zoomFactor), 0.5), 3.0);
      
      if (newScale === scale) return;

      const ratio = newScale / scale;
      const rectCenterX = rect.left + rect.width / 2;
      const rectCenterY = rect.top + rect.height / 2;
      const mx = e.clientX - rectCenterX;
      const my = e.clientY - rectCenterY;
      const newX = x + (mx * (1 - ratio));
      const newY = y + (my * (1 - ratio));

      setZoom({ scale: newScale, x: newX, y: newY });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [hasImage, isScreenshotMode]);

  // --- 辅助功能 ---

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  // --- 核心渲染函数 ---
  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !currentBgRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. 清空
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. 绘制背景
    ctx.drawImage(currentBgRef.current, 0, 0);

    // 3. 绘制所有纹身
    tattoos.forEach(tattoo => {
        ctx.save();
        ctx.translate(tattoo.x, tattoo.y);
        ctx.rotate(tattoo.rotation);
        
        // 绘制图片
        ctx.drawImage(
            tattoo.image, 
            -tattoo.width / 2, 
            -tattoo.height / 2, 
            tattoo.width, 
            tattoo.height
        );
        
        // 如果被选中，绘制控制UI
        if (tattoo.id === selectedTattooId && !isProcessing) {
            drawSelectionControls(ctx, tattoo.width, tattoo.height);
        }
        
        ctx.restore();
    });
  };

  // 绘制选中框和控制点
  const drawSelectionControls = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const halfW = w / 2;
    const halfH = h / 2;

    // 边框
    ctx.strokeStyle = '#a855f7'; 
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(-halfW, -halfH, w, h);
    ctx.setLineDash([]);

    // 控制点样式
    const drawHandle = (x: number, y: number, color = 'white', radius = 6) => {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    };

    drawHandle(halfW, halfH); // Resize
    
    const rotHandleY = -halfH - 25;
    ctx.beginPath();
    ctx.moveTo(0, -halfH);
    ctx.lineTo(0, rotHandleY);
    ctx.strokeStyle = '#a855f7';
    ctx.stroke();
    drawHandle(0, rotHandleY, '#e9d5ff'); // Rotate
  };

  // --- 坐标转换辅助 ---
  const getMouseCanvasPos = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
  };

  const isPointInRotatedRect = (px: number, py: number, tattoo: PlacedTattoo) => {
    const dx = px - tattoo.x;
    const dy = py - tattoo.y;
    const cos = Math.cos(-tattoo.rotation);
    const sin = Math.sin(-tattoo.rotation);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    
    return (
        rx >= -tattoo.width / 2 &&
        rx <= tattoo.width / 2 &&
        ry >= -tattoo.height / 2 &&
        ry <= tattoo.height / 2
    );
  };

  const hitTestControls = (px: number, py: number, tattoo: PlacedTattoo): InteractionMode => {
    const dx = px - tattoo.x;
    const dy = py - tattoo.y;
    const cos = Math.cos(-tattoo.rotation);
    const sin = Math.sin(-tattoo.rotation);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;

    const halfW = tattoo.width / 2;
    const halfH = tattoo.height / 2;
    const handleRadius = 15; 

    const rotY = -halfH - 25;
    if (Math.abs(rx - 0) < handleRadius && Math.abs(ry - rotY) < handleRadius) return 'ROTATE';
    if (Math.abs(rx - halfW) < handleRadius && Math.abs(ry - halfH) < handleRadius) return 'RESIZE';
    
    return 'NONE';
  };

  // --- 鼠标交互处理 (选择、移动、变换、平移、删除) ---

  // 1. 全局鼠标移动处理
  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (!hasImage) return;
    const mode = interactionModeRef.current;
    
    // A. 视图平移 (Pan View)
    if (mode === 'PAN_VIEW') {
        const dx = e.clientX - lastClientPosRef.current.x;
        const dy = e.clientY - lastClientPosRef.current.y;
        lastClientPosRef.current = { x: e.clientX, y: e.clientY };
        
        setZoom(prev => ({
             ...prev,
             x: prev.x + dx,
             y: prev.y + dy
        }));
        return; 
    }
    
    // B. 纹身交互 (Move/Rotate/Resize)
    if (mode !== 'NONE' && selectedTattooId && initialTattooStateRef.current) {
        
        // 垃圾桶检测 (仅在移动模式下)
        if (mode === 'MOVE') {
            if (libraryRef.current) {
                const libRect = libraryRef.current.getBoundingClientRect();
                const isOver = e.clientX >= libRect.left && 
                               e.clientX <= libRect.right &&
                               e.clientY >= libRect.top &&
                               e.clientY <= libRect.bottom;
                
                setIsDraggingOverTrash(isOver);
            }
        } else {
             setIsDraggingOverTrash(false);
        }

        const { x, y } = getMouseCanvasPos(e.clientX, e.clientY);
        const startTattoo = initialTattooStateRef.current;
        const startMouse = lastMousePosRef.current;

        setTattoos(prev => prev.map(t => {
            if (t.id !== selectedTattooId) return t;

            if (mode === 'MOVE') {
                return {
                    ...t,
                    x: startTattoo.x + (x - startMouse.x),
                    y: startTattoo.y + (y - startMouse.y)
                };
            }

            if (mode === 'ROTATE') {
                const angle = Math.atan2(y - t.y, x - t.x);
                return { ...t, rotation: angle + Math.PI / 2 };
            }

            if (mode === 'RESIZE') {
                const dist = Math.sqrt(Math.pow(x - t.x, 2) + Math.pow(y - t.y, 2));
                const startDist = Math.sqrt(Math.pow(startTattoo.width/2, 2) + Math.pow(startTattoo.height/2, 2));
                const scale = dist / startDist;
                return {
                    ...t,
                    width: Math.max(20, startTattoo.width * scale),
                    height: Math.max(20, startTattoo.height * scale)
                };
            }
            return t;
        }));
    }
  };

  // 2. 全局鼠标抬起处理
  const handleGlobalMouseUp = (e: MouseEvent) => {
    // 移除全局监听
    window.removeEventListener('mousemove', handleGlobalMouseMove);
    window.removeEventListener('mouseup', handleGlobalMouseUp);

    // 恢复光标
    if (interactionModeRef.current === 'PAN_VIEW') {
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    }

    // 执行删除逻辑
    if (interactionModeRef.current === 'MOVE' && isDraggingOverTrash) {
        setTattoos(prev => prev.filter(t => t.id !== selectedTattooId));
        setSelectedTattooId(null);
        showToast('纹身已删除', 'info');
        setIsDraggingOverTrash(false);
    }
    
    // 保存历史
    if (interactionModeRef.current !== 'NONE') {
        interactionModeRef.current = 'NONE';
        initialTattooStateRef.current = null;
        saveHistorySnapshot(); 
    }
  };

  // 3. Canvas 鼠标按下处理 (入口)
  const handleCanvasMouseDown = (e: ReactMouseEvent) => {
    if (isScreenshotMode || !hasImage) return;

    // 绑定全局监听
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    const { x, y } = getMouseCanvasPos(e.clientX, e.clientY);
    lastMousePosRef.current = { x, y };

    // 1. 优先检测控制点
    if (selectedTattooId) {
        const selected = tattoos.find(t => t.id === selectedTattooId);
        if (selected) {
            const mode = hitTestControls(x, y, selected);
            if (mode !== 'NONE') {
                interactionModeRef.current = mode;
                initialTattooStateRef.current = { ...selected };
                return;
            }
        }
    }

    // 2. 检测纹身主体
    let clickedId: string | null = null;
    for (let i = tattoos.length - 1; i >= 0; i--) {
        if (isPointInRotatedRect(x, y, tattoos[i])) {
            clickedId = tattoos[i].id;
            break;
        }
    }

    if (clickedId) {
        setSelectedTattooId(clickedId);
        interactionModeRef.current = 'MOVE';
        const t = tattoos.find(t => t.id === clickedId)!;
        initialTattooStateRef.current = { ...t };
    } else {
        setSelectedTattooId(null);
        // 3. 视图平移检测
        if (zoom.scale !== 1) {
             interactionModeRef.current = 'PAN_VIEW';
             lastClientPosRef.current = { x: e.clientX, y: e.clientY };
             if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
        } else {
             interactionModeRef.current = 'NONE';
        }
    }
  };

  // 鼠标移动时更新光标 (仅在未交互时，用于 hover 效果)
  const handleCanvasHover = (e: ReactMouseEvent) => {
    if (isScreenshotMode || !hasImage || interactionModeRef.current !== 'NONE') return;
    
    const { x, y } = getMouseCanvasPos(e.clientX, e.clientY);
    const canvas = canvasRef.current;
    if (!canvas) return;

    let hover = false;
    if (selectedTattooId) {
        const t = tattoos.find(t => t.id === selectedTattooId);
        if (t && hitTestControls(x, y, t) !== 'NONE') hover = true;
    }
    if (!hover) {
        for (let t of tattoos) {
            if (isPointInRotatedRect(x, y, t)) { hover = true; break; }
        }
    }
    
    if (hover) {
        canvas.style.cursor = 'move';
    } else if (zoom.scale !== 1) {
        canvas.style.cursor = 'grab';
    } else {
        canvas.style.cursor = 'default';
    }
  };


  // --- 历史记录管理功能 ---
  const saveHistorySnapshot = () => {
    if (!canvasRef.current || !currentBgRef.current) return;
    
    const snapshot: SerializedSnapshot = {
        bg: currentBgRef.current.src,
        tattoos: tattoos.map(t => ({
            id: t.id,
            libraryId: t.libraryId,
            src: t.image.src,
            x: t.x, y: t.y, w: t.width, h: t.height, r: t.rotation
        }))
    };
    
    const json = JSON.stringify(snapshot);
    if (historyIndex >= 0 && history[historyIndex] === json) return;

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(json);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const restoreHistory = (index: number) => {
    if (index < 0 || index >= history.length) return;
    
    const json = history[index];
    try {
        const snapshot: SerializedSnapshot = JSON.parse(json);
        
        const bgImg = new Image();
        bgImg.onload = () => {
            currentBgRef.current = bgImg;
            renderCanvas();
        };
        bgImg.src = snapshot.bg;

        const loadedTattoos: PlacedTattoo[] = [];
        let loadedCount = 0;
        
        if (snapshot.tattoos.length === 0) {
            setTattoos([]);
            setHistoryIndex(index);
            return;
        }

        snapshot.tattoos.forEach(tData => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                loadedTattoos.push({
                    id: tData.id,
                    libraryId: tData.libraryId,
                    image: img,
                    x: tData.x, y: tData.y, width: tData.w, height: tData.h, rotation: tData.r
                });
                loadedCount++;
                if (loadedCount === snapshot.tattoos.length) {
                    setTattoos(loadedTattoos);
                    setHistoryIndex(index);
                }
            };
            img.src = tData.src;
        });

    } catch (e) {
        console.error("Failed to restore history", e);
    }
  };

  const handleUndo = () => {
    if (historyIndex > 0) restoreHistory(historyIndex - 1);
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) restoreHistory(historyIndex + 1);
  };

  const resetZoom = () => {
    setZoom({ scale: 1, x: 0, y: 0 });
  };

  const handleZoomIn = () => {
    setZoom(prev => ({ ...prev, scale: Math.min(prev.scale + 0.25, 3) }));
  };

  const handleZoomOut = () => {
    setZoom(prev => ({ ...prev, scale: Math.max(prev.scale - 0.25, 0.5) }));
  };

  // --- 截图选取逻辑 ---

  const toggleScreenshotMode = () => {
    if (!hasImage) return;
    setIsScreenshotMode(prev => !prev);
    setSelectionBox(null);
    setSelectedTattooId(null);
    if (!isScreenshotMode) {
      showToast('进入截图模式，拖拽框选区域', 'info');
    }
  };

  const handleSelectionMouseDown = (e: React.MouseEvent) => {
    if (!isScreenshotMode || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelectionBox({ startX: x, startY: y, currentX: x, currentY: y, isDrawing: true });
  };

  const handleSelectionMouseMove = (e: React.MouseEvent) => {
    if (!isScreenshotMode || !selectionBox?.isDrawing || !canvasContainerRef.current) return;
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setSelectionBox(prev => prev ? { ...prev, currentX: x, currentY: y } : null);
  };

  const handleSelectionMouseUp = () => {
    if (!isScreenshotMode || !selectionBox?.isDrawing) return;
    const { startX, startY, currentX, currentY } = selectionBox;
    const domLeft = Math.min(startX, currentX);
    const domTop = Math.min(startY, currentY);
    const domWidth = Math.abs(currentX - startX);
    const domHeight = Math.abs(currentY - startY);

    if (domWidth > 10 && domHeight > 10 && canvasRef.current) {
      performCrop(domLeft, domTop, domWidth, domHeight);
    }
    setSelectionBox(null);
    setIsScreenshotMode(false);
  };

  const performCrop = (domLeft: number, domTop: number, domWidth: number, domHeight: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    renderCanvas();

    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = canvasContainerRef.current!.getBoundingClientRect();
    const screenSelectionLeft = containerRect.left + domLeft;
    const screenSelectionTop = containerRect.top + domTop;
    const relativeX = screenSelectionLeft - canvasRect.left;
    const relativeY = screenSelectionTop - canvasRect.top;
    const ratioX = canvas.width / canvasRect.width;
    const ratioY = canvas.height / canvasRect.height;
    const sourceX = relativeX * ratioX;
    const sourceY = relativeY * ratioY;
    const sourceW = domWidth * ratioX;
    const sourceH = domHeight * ratioY;

    try {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = sourceW;
      tempCanvas.height = sourceH;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(canvas, sourceX, sourceY, sourceW, sourceH, 0, 0, sourceW, sourceH);
        const link = document.createElement('a');
        link.download = `tattoo-crop-${Date.now()}.png`;
        link.href = tempCanvas.toDataURL('image/png');
        link.click();
        showToast('局部截图已下载', 'success');
      }
    } catch (e) {
      console.error(e);
      showToast('截图失败，请确保选区在图片范围内', 'error');
    }
  };

  // --- 按钮功能区 ---

  const handleReset = () => {
    if (!originalImageRef.current || !canvasRef.current) return;
    const img = originalImageRef.current;
    currentBgRef.current = img;
    
    setTattoos([]);
    setSelectedTattooId(null);
    resetZoom(); 
    setIsScreenshotMode(false);
    
    const snapshot: SerializedSnapshot = {
        bg: img.src,
        tattoos: []
    };
    setHistory([JSON.stringify(snapshot)]);
    setHistoryIndex(0);

    renderCanvas();
    showToast('已重置到原始照片', 'info');
  };

  const handleDownload = () => {
    if (!canvasRef.current || !hasImage) return;
    const prevSelection = selectedTattooId;
    setSelectedTattooId(null);
    setTimeout(() => {
        renderCanvas(); 
        try {
          const link = document.createElement('a');
          link.download = `tattoo-preview-${Date.now()}.jpg`;
          link.href = canvasRef.current!.toDataURL('image/jpeg', 0.9);
          link.click();
          showToast('图片下载已开始', 'success');
        } catch (e) {
          showToast('下载失败，请重试', 'error');
        }
        if (prevSelection) setSelectedTattooId(prevSelection);
    }, 0);
  };

  // --- 纹身文件上传逻辑 ---
  const handleTattooUploadClick = () => tattooInputRef.current?.click();
  const handleTattooFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processTattooFile(file);
    e.target.value = '';
  };
  const processTattooFile = (file: File, replaceId?: string) => {
    if (file.size > 5 * 1024 * 1024) { showToast('纹身图片过大，请上传 5MB 以内的图片', 'error'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result as string;
      if (replaceId) {
        setTattooLibrary(prev => prev.map(t => t.id === replaceId ? { ...t, imageUrl: result, title: `自定义-${file.name.slice(0, 6)}` } : t));
        showToast('纹身样式已替换更新', 'success');
      } else {
        const newTattoo: TattooDesign = { id: `custom-${Date.now()}`, title: `自定义-${file.name.slice(0, 6)}`, imageUrl: result };
        setTattooLibrary(prev => [newTattoo, ...prev]);
        showToast('新纹身已添加到库中', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  // --- 样式库拖拽处理 ---
  const handleLibraryDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); if (e.dataTransfer.types.includes('Files')) setIsDraggingOverLibrary(true); };
  const handleLibraryDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOverLibrary(false); };
  const handleLibraryDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDraggingOverLibrary(false); setDragOverTattooId(null); if (e.dataTransfer.files.length > 0) processTattooFile(e.dataTransfer.files[0]); };
  const handleTattooItemDragOver = (e: DragEvent<HTMLDivElement>, id: string) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); setDragOverTattooId(id); setIsDraggingOverLibrary(true); } };
  const handleTattooItemDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setDragOverTattooId(null); };
  const handleTattooItemDrop = (e: DragEvent<HTMLDivElement>, id: string) => { if (e.dataTransfer.files.length > 0) { e.preventDefault(); e.stopPropagation(); setDragOverTattooId(null); setIsDraggingOverLibrary(false); processTattooFile(e.dataTransfer.files[0], id); } };

  // --- 主照片处理 ---
  const handleUploadClick = () => { if (isLoading || isProcessing) return; fileInputRef.current?.click(); };
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) processFile(file); e.target.value = ''; };
  const processFile = (file: File) => {
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        originalImageRef.current = img;
        currentBgRef.current = img;
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          setTattoos([]); 
          setSelectedTattooId(null);
          const snapshot: SerializedSnapshot = { bg: img.src, tattoos: [] };
          setHistory([JSON.stringify(snapshot)]);
          setHistoryIndex(0);
          resetZoom(); 
          setIsScreenshotMode(false);
          renderCanvas(); 
        }
        setHasImage(true);
        setIsLoading(false);
        if (showGuide) setShowGuide(false);
        showToast('照片上传成功，请拖拽纹身预览', 'success');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // --- 纹身拖拽到 Canvas 逻辑 ---
  const handleTattooDragStart = (e: DragEvent<HTMLDivElement>, tattoo: TattooDesign) => {
    if (isScreenshotMode) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/json', JSON.stringify(tattoo));
    e.dataTransfer.effectAllowed = 'copy';
    draggingTattooDataRef.current = tattoo;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = tattoo.imageUrl;
    draggingTattooImgRef.current = img;
  };

  const handleCanvasDragOver = (e: DragEvent<HTMLCanvasElement>) => {
    e.preventDefault(); e.stopPropagation();
  };
  const handleCanvasDragLeave = (e: DragEvent<HTMLCanvasElement>) => {
    e.preventDefault(); e.stopPropagation();
  };

  const handleCanvasDrop = (e: DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isScreenshotMode) return;
    if (e.dataTransfer.types.includes('Files')) return;
    if (!hasImage || !currentBgRef.current || !draggingTattooImgRef.current || !draggingTattooDataRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const img = draggingTattooImgRef.current;
    const targetWidth = canvas.width * 0.25; 
    const scaleFactor = targetWidth / img.width;
    const width = img.width * scaleFactor;
    const height = img.height * scaleFactor;

    const newTattoo: PlacedTattoo = {
        id: Date.now().toString(),
        libraryId: draggingTattooDataRef.current.id,
        image: img,
        x, y, width, height,
        rotation: 0
    };

    setTattoos(prev => [...prev, newTattoo]);
    setSelectedTattooId(newTattoo.id);
    
    setTimeout(saveHistorySnapshot, 0);

    draggingTattooDataRef.current = null;
  };

  // --- AI 生成逻辑 ---
  const handleAIRequest = async () => {
      setSelectedTattooId(null);
      setTimeout(async () => {
          if (!canvasRef.current) return;
          renderCanvas(); 
          await generateTattooEffect(canvasRef.current);
      }, 50);
  };

  const generateTattooEffect = async (canvas: HTMLCanvasElement) => {
    setIsProcessing(true);
    const base64Data = compressCanvasImage(canvas, 0.85, 1024);

    try {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
            updateCurrentBackground(canvas);
            showToast('API Key 未配置，仅保留当前排版效果', 'info');
            setIsProcessing(false);
            return;
        }

        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } },
                    { text: "This image shows a person with tattoo designs overlaid on their skin. Make the tattoos look photorealistic, as if they are inked into the skin. Match skin texture, lighting, shading, and body curvature perfectly. Do NOT change the person or background. Keep high resolution." }
                ]
            }
        });

        let generatedImageBase64 = null;
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    generatedImageBase64 = part.inlineData.data;
                    break;
                }
            }
        }

        if (generatedImageBase64) {
            const resultImg = new Image();
            resultImg.onload = () => {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(resultImg, 0, 0);
                    updateCurrentBackground(canvas); 
                    showToast('AI 融合生成成功！', 'success');
                }
                setIsProcessing(false);
            };
            resultImg.src = `data:image/jpeg;base64,${generatedImageBase64}`;
        } else {
            throw new Error("No image in response");
        }
    } catch (err: any) {
        console.error("AI Error:", err);
        updateCurrentBackground(canvas); 
        showToast('生成遇到问题，已保留当前效果', 'error');
        setIsProcessing(false);
    }
  };

  const updateCurrentBackground = (canvas: HTMLCanvasElement) => {
    const newImg = new Image();
    const dataUrl = canvas.toDataURL();
    newImg.src = dataUrl;
    newImg.onload = () => {
        currentBgRef.current = newImg;
        setTattoos([]);
        saveHistorySnapshot();
        renderCanvas();
    };
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-950 text-gray-100">
      {/* 顶部导航 */}
      <header className="flex-none h-16 border-b border-gray-800 bg-gray-900/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between z-30">
        <div className="flex items-center gap-3 md:gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="返回首页">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base md:text-lg font-semibold flex items-center gap-2">
            <Layers className="w-5 h-5 text-purple-500" />
            <span className="hidden md:inline">纹身预览工作台</span>
            <span className="md:hidden">工作台</span>
          </h2>
        </div>
        
        {/* 工具栏 */}
        <div className="flex items-center gap-2 md:gap-4">
          {hasImage && (
            <>
               {/* 截图按钮 */}
               <button 
                  onClick={toggleScreenshotMode} 
                  disabled={isProcessing} 
                  className={`p-2 rounded-lg transition-all flex items-center gap-2 text-sm border ${isScreenshotMode ? 'bg-purple-600 text-white border-purple-500' : 'text-gray-400 hover:text-white hover:bg-gray-800 border-transparent'}`}
                  title={isScreenshotMode ? "取消截图" : "截图选取"}
                >
                  <Crop className="w-4 h-4" />
                  <span className="hidden sm:inline">{isScreenshotMode ? "退出" : "截图"}</span>
                </button>

               <div className="w-px h-6 bg-gray-700"></div>

              {/* 历史记录按钮组 */}
              <div className="flex items-center bg-gray-800 rounded-lg p-0.5 border border-gray-700">
                <button 
                  onClick={handleUndo} 
                  disabled={isProcessing || historyIndex <= 0 || isScreenshotMode}
                  className="p-1.5 md:p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed" 
                  title="回退"
                >
                  <Undo className="w-4 h-4 md:w-5 md:h-5" />
                </button>
                <div className="w-px h-4 bg-gray-700 mx-1"></div>
                <button 
                  onClick={handleRedo} 
                  disabled={isProcessing || historyIndex >= history.length - 1 || isScreenshotMode}
                  className="p-1.5 md:p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-md transition-all disabled:opacity-30 disabled:cursor-not-allowed" 
                  title="前进"
                >
                  <Redo className="w-4 h-4 md:w-5 md:h-5" />
                </button>
              </div>

              {/* 操作按钮组 */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleReset} 
                  disabled={isProcessing} 
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-all flex items-center gap-2 text-sm" 
                  title="重置画布"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">重置</span>
                </button>
                
                <button 
                  onClick={handleDownload} 
                  disabled={isProcessing} 
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg shadow-lg flex items-center gap-2 text-sm transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">下载</span>
                </button>

                {/* AI 生成按钮 (显式调用) */}
                <button 
                  onClick={handleAIRequest} 
                  disabled={isProcessing || tattoos.length === 0} 
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-lg flex items-center gap-2 text-sm transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed animate-pulse-slow"
                >
                  <Wand2 className="w-4 h-4" />
                  <span className="hidden sm:inline">AI 融合</span>
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* 主区域 */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* 左侧画布区 */}
        <section className="flex-1 bg-gray-900/50 relative flex flex-col p-2 md:p-6 overflow-hidden select-none">
          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/jpeg, image/png, image/webp" className="hidden" />
          
          <div 
            ref={canvasContainerRef}
            onClick={!hasImage ? handleUploadClick : undefined}
            onDoubleClick={hasImage ? resetZoom : undefined}
            onDragEnter={(e) => { e.preventDefault(); if(e.dataTransfer.types.includes('Files')) setIsDraggingFile(true); }}
            onDragLeave={(e) => { e.preventDefault(); if(!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingFile(false); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); setIsDraggingFile(false); if(e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]); }}
            // 绑定交互事件：仅绑定 MouseDown，Move 和 Up 动态绑定到 window
            onMouseDown={isScreenshotMode ? handleSelectionMouseDown : handleCanvasMouseDown}
            onMouseMove={isScreenshotMode ? handleSelectionMouseMove : handleCanvasHover} // 非截图模式仅用于 Hover 效果
            onMouseUp={isScreenshotMode ? handleSelectionMouseUp : undefined}
            className={`
              relative w-full h-full rounded-xl border-2 border-dashed transition-all duration-300 overflow-hidden 
              flex flex-col items-center justify-center
              ${isDraggingFile ? 'border-purple-500 bg-purple-500/10' : hasImage ? 'border-transparent' : 'border-gray-700 bg-gray-800/20 hover:bg-gray-800/30 cursor-pointer'}
              ${isScreenshotMode ? 'cursor-crosshair' : ''} 
            `}
          >
            {/* Canvas，应用 CSS Transform */}
            <canvas 
              ref={canvasRef}
              onDragOver={handleCanvasDragOver}
              onDragLeave={handleCanvasDragLeave}
              onDrop={handleCanvasDrop}
              style={{
                transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                transformOrigin: 'center center',
                cursor: isScreenshotMode ? 'crosshair' : 'default' 
              }}
              className={`max-w-full max-h-full object-contain shadow-2xl ${!hasImage ? 'hidden' : 'block'} ${isProcessing ? 'blur-sm scale-[0.99] opacity-80' : ''} transition-transform duration-100 ease-out`} 
            />

            {/* 截图选区遮罩 */}
            {isScreenshotMode && (
              <div className="absolute inset-0 bg-black/20 z-50 pointer-events-none">
                 <div className="absolute top-4 left-0 w-full text-center pointer-events-none">
                    <span className="bg-black/70 text-white px-3 py-1 rounded text-sm shadow-lg backdrop-blur">
                       拖拽框选要截取的区域
                    </span>
                 </div>
                 {selectionBox?.isDrawing && (
                   <div 
                      className="absolute border-2 border-purple-500 bg-purple-500/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                      style={{
                        left: Math.min(selectionBox.startX, selectionBox.currentX),
                        top: Math.min(selectionBox.startY, selectionBox.currentY),
                        width: Math.abs(selectionBox.currentX - selectionBox.startX),
                        height: Math.abs(selectionBox.currentY - selectionBox.startY)
                      }}
                   >
                      <div className="absolute -bottom-6 left-0 bg-purple-600 text-white text-[10px] px-1 rounded">
                        {Math.round(Math.abs(selectionBox.currentX - selectionBox.startX))} x {Math.round(Math.abs(selectionBox.currentY - selectionBox.startY))}
                      </div>
                   </div>
                 )}
              </div>
            )}

            {!hasImage && !isLoading && (
              <div className="text-center p-6 animate-fade-in-up">
                <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 transition-colors ${isDraggingFile ? 'bg-purple-600' : 'bg-gray-800'}`}>
                  {isDraggingFile ? <Upload className="w-8 h-8 text-white" /> : <ImagePlus className="w-8 h-8 text-gray-400" />}
                </div>
                <h3 className="text-xl font-medium mb-2 text-gray-200">上传您的照片</h3>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">点击或拖拽照片到此处 (JPG, PNG) <br/> 建议使用清晰的皮肤特写照片</p>
              </div>
            )}
            
            {isLoading && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gray-900/60 backdrop-blur-sm">
                <Loader2 className="w-10 h-10 text-purple-500 animate-spin mb-3" />
                <p className="text-gray-300">正在处理图片...</p>
              </div>
            )}
            
            {isProcessing && (
              <div className="absolute inset-0 z-20 flex items-center justify-center">
                <div className="bg-gray-800/90 backdrop-blur-md px-8 py-6 rounded-2xl border border-purple-500/30 shadow-2xl flex flex-col items-center animate-bounce-slight">
                  <Wand2 className="w-10 h-10 text-purple-400 animate-pulse mb-4" />
                  <h3 className="text-white font-semibold text-lg mb-1">AI 正在融合生成</h3>
                  <p className="text-gray-400 text-xs">调整光影 · 匹配纹理 · 优化透视</p>
                </div>
              </div>
            )}
            
            {hasImage && showGuide && !isProcessing && (
              <div className="absolute inset-0 z-10 bg-black/60 flex items-center justify-center p-4 backdrop-blur-[2px]">
                <div className="bg-gray-800 p-6 rounded-xl max-w-sm text-center shadow-2xl border border-gray-700">
                  <GripVertical className="w-6 h-6 text-purple-400 mx-auto mb-4" />
                  <h4 className="text-lg font-bold text-white mb-2">开始设计</h4>
                  <p className="text-gray-400 text-sm mb-6">从右侧纹身库中<b>拖拽</b>喜欢的图案。<br/>选中图案后可<b>移动</b>、<b>缩放</b>和<b>旋转</b>。<br/>满意后点击上方 <b>AI 融合</b>。</p>
                  <button onClick={() => setShowGuide(false)} className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors">我知道了</button>
                </div>
              </div>
            )}

            {/* 浮动工具栏：更换图片 & 缩放控制 */}
            {hasImage && !isProcessing && !isScreenshotMode && ( // 截图时隐藏
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3">
                 {/* 缩放控制器 */}
                 <div className="bg-gray-800/90 backdrop-blur-md border border-gray-700 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-lg">
                    <button onClick={handleZoomOut} className="p-1.5 hover:bg-gray-700 rounded-full text-gray-300 hover:text-white transition-colors" title="缩小 (Ctrl+Wheel Down)">
                       <ZoomOut className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-mono w-10 text-center text-gray-300 select-none">{Math.round(zoom.scale * 100)}%</span>
                    <button onClick={handleZoomIn} className="p-1.5 hover:bg-gray-700 rounded-full text-gray-300 hover:text-white transition-colors" title="放大 (Ctrl+Wheel Up)">
                       <ZoomIn className="w-4 h-4" />
                    </button>
                    <div className="w-px h-3 bg-gray-600 mx-1"></div>
                    <button onClick={resetZoom} className="p-1.5 hover:bg-gray-700 rounded-full text-gray-300 hover:text-white transition-colors" title="重置视图">
                       <Maximize className="w-3.5 h-3.5" />
                    </button>
                 </div>

                 <button onClick={handleUploadClick} className="p-3 bg-gray-800/90 hover:bg-gray-700 text-white rounded-full shadow-lg border border-gray-600 backdrop-blur transition-all" title="更换底图">
                  <RefreshCw className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* 右侧侧边栏 - 纹身样式库 (添加 Drop Zone & Trash Zone) */}
        <aside 
          ref={libraryRef}
          onDragOver={handleLibraryDragOver}
          onDragLeave={handleLibraryDragLeave}
          onDrop={handleLibraryDrop}
          className={`
            w-full md:w-80 border-l border-gray-800 flex flex-col shadow-2xl z-20 transition-all duration-300 relative
            ${isDraggingOverTrash 
                ? 'bg-red-900/50 border-red-500/50' 
                : isDraggingOverLibrary 
                    ? 'bg-purple-900/10 border-purple-500/50' 
                    : 'bg-gray-900'
            }
          `}
        >
          {/* 删除模式下的覆盖层 */}
          {isDraggingOverTrash && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/80 backdrop-blur-sm z-30 animate-fade-in pointer-events-none">
                  <div className="p-4 bg-red-800 rounded-full mb-3 shadow-lg scale-110">
                    <Trash2 className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-white font-bold text-lg">松开删除</h3>
                  <p className="text-red-200 text-sm">将纹身移出画布以移除</p>
              </div>
          )}

          {/* Header with Upload */}
          <div className="p-4 border-b border-gray-800 bg-gray-900/50 shrink-0">
             <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-200 flex items-center gap-2 text-sm">
                  <Layers className="w-4 h-4 text-gray-400" />
                  纹身样式库
                </h3>
                <span className="text-xs bg-gray-800 px-2 py-0.5 rounded text-gray-500 border border-gray-700">{tattooLibrary.length}</span>
             </div>
             
             {/* 上传区域 */}
             <div className="bg-gray-800/50 rounded-lg p-2 border border-dashed border-gray-700 hover:border-purple-500/50 transition-colors">
                <input type="file" ref={tattooInputRef} onChange={handleTattooFileChange} accept="image/png, image/jpeg, image/webp" className="hidden" />
                <div className="flex items-center justify-between">
                   <div className="flex flex-col">
                      <span className="text-xs text-gray-300 font-medium">支持本地上传和拖拽</span>
                      <span className="text-[10px] text-gray-500">建议透明 PNG, 最大 5MB</span>
                   </div>
                   <button 
                     onClick={handleTattooUploadClick}
                     className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs flex items-center gap-1 transition-colors"
                   >
                     <UploadCloud className="w-3 h-3" />
                     上传
                   </button>
                </div>
             </div>
          </div>
          
          {/* 纹身列表 */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="grid grid-cols-3 md:grid-cols-2 gap-3 pb-16">
              {tattooLibrary.map((tattoo) => (
                <div 
                  key={tattoo.id}
                  draggable="true"
                  onDragStart={(e) => handleTattooDragStart(e, tattoo)}
                  onDragOver={(e) => handleTattooItemDragOver(e, tattoo.id)}
                  onDragLeave={handleTattooItemDragLeave}
                  onDrop={(e) => handleTattooItemDrop(e, tattoo.id)}
                  className={`
                    group relative aspect-square bg-gray-800 rounded-lg border cursor-grab active:cursor-grabbing hover:shadow-lg transition-all overflow-hidden
                    ${dragOverTattooId === tattoo.id ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-gray-700 hover:border-purple-500/50'}
                  `}
                >
                  <div className="absolute inset-0 p-2 flex items-center justify-center">
                    <img 
                      src={tattoo.imageUrl} 
                      alt={tattoo.title} 
                      className="max-w-full max-h-full object-contain pointer-events-none group-hover:scale-110 transition-transform duration-300"
                      crossOrigin="anonymous"
                    />
                  </div>
                  
                  {/* 拖拽替换提示覆盖层 */}
                  {dragOverTattooId === tattoo.id && (
                     <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 pointer-events-none animate-fade-in">
                        <RefreshCw className="w-6 h-6 text-purple-400 mb-1" />
                        <span className="text-[10px] text-white">松开替换</span>
                     </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 pointer-events-none">
                    <span className="text-[10px] text-white font-medium truncate w-full">{tattoo.title}</span>
                  </div>
                </div>
              ))}
              
              {/* 空位占位符，提示可以直接拖拽新增 */}
              {isDraggingOverLibrary && !dragOverTattooId && (
                <div className="aspect-square rounded-lg border-2 border-dashed border-purple-500/50 bg-purple-500/10 flex flex-col items-center justify-center animate-pulse">
                  <Plus className="w-6 h-6 text-purple-400 mb-1" />
                  <span className="text-xs text-purple-300">松开添加</span>
                </div>
              )}
            </div>
            
            <div className="mt-2 p-3 bg-blue-900/20 border border-blue-900/30 rounded-lg flex gap-3">
              <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-200 leading-relaxed">
                 将图片拖到<b>空白处</b>可添加新纹身，拖到<b>现有纹身</b>上可替换。<br/>
                 按住 <b>Ctrl + 滚轮</b> 可缩放图片。
              </p>
            </div>
          </div>
        </aside>
      </main>

      {/* Toast */}
      <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 transform ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'}`}>
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl border ${toast.type === 'success' ? 'bg-green-900/90 border-green-700 text-green-100' : toast.type === 'error' ? 'bg-red-900/90 border-red-700 text-red-100' : 'bg-gray-800/90 border-gray-600 text-gray-100'} backdrop-blur-md`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      </div>
    </div>
  );
};