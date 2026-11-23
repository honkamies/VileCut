class Store {
  constructor(initialState) {
    this.listeners = new Map();
    this.state = new Proxy(initialState, {
      set: (target, property, value) => {
        if (target[property] === value) return true;
        target[property] = value;
        this.notify(property, value);
        return true;
      }
    });
  }

  subscribe(property, callback) {
    if (!this.listeners.has(property)) {
      this.listeners.set(property, new Set());
    }
    this.listeners.get(property).add(callback);
    return () => this.listeners.get(property).delete(callback);
  }

  notify(property, value) {
    if (this.listeners.has(property)) {
      for (const callback of this.listeners.get(property)) {
        callback(value, this.state);
      }
    }
  }
}

export const isDangerZoneEnvironment = typeof window !== 'undefined' && (
  window.VILECUT_DANGER_ZONE === true ||
  window.location.pathname.includes('/danger') ||
  (typeof document !== 'undefined' && !!document.querySelector('.danger-header-badge'))
);

export function getDefaultState(dangerMode = isDangerZoneEnvironment) {
  return {
    // Environment Flag
    isDangerZone: dangerMode,

    // Media & Image Elements
    uploadedImages: [], // Array of { id, name, img, layers: [], layerStats: [] }
    activeImageIndex: -1,
    imageLoaded: false,
    layers: [], // Stack of active rendering layers: { canvas, index, initialZ, lastWrapCount, sourceImageId }

    // Core Layer Settings
    maskType: 'adaptive-luminosity',
    layerCount: 5,
    maskFeather: 0.3,
    hueTolerance: 45, // in degrees
    randomBoundaries: [], // boundary points for random mode
    layerEdgeFade: 10, // border fade out percentage (0-50%)
    aspectRatio: 'original',

    // Toggle FX Switches
    glitchEnabled: false,

    // Layer Inspector settings
    selectedInspectorLayer: 0,
    inspectorBgMode: 'checkerboard',

    // Text Overlays
    texts: [],
    selectedTextId: null,

    // Audio Track
    audioTrack: null,
    selectedAudio: false,

    // Video Background / Overlay Track
    videoBlocks: [],
    selectedVideoId: null,

    // Glitch Triggers on Timeline
    glitchTriggers: [],
    selectedGlitchTriggerId: null,
    prevTime: 0,

    // Graphic Overlays
    graphics: [],
    selectedGraphicId: null,

    // Motion parameters
    timelineZoom: 1.0,
    isPlaying: false,
    time: 0,
    lastFrameTime: 0,
    fps: 0,
    zoomSpeed: 0.05,
    zoomDepth: 4.0,
    cameraRotation: 0, // deg/sec
    cameraRotationBase: 0, // base angle to prevent rotation jumps
    cameraDrift: 0.0,  // drift multiplier
    gridActive: false,

    // Symmetries
    mirrorMode: 'none',
    kaleidoscopeSlices: 8,

    // Glitches
    glitchStyleRgbSort: true,
    glitchStyleVhs: false,
    glitchStyleBlock: false,
    glitchStyleLiquid: false,
    glitchStyleRandom: false,
    glitchStyleFlicker: false,
    glitchFlickerHighlightsOnly: false,
    activeSpikeStyle: null,
    rgbSplit: 0,
    pixelSort: 0,
    glitchFrequency: 5, // % probability
    glitchSeverity: 10,  // px displacement
    depthModulation: 0,
    glitchMonochrome: false,
    glitchActive: false,
    glitchTimer: 0,
    glitchZoomBoostTimer: 0,
    shakeX: 0,
    shakeY: 0,
    shakeRot: 0,

    // Micro-Geometric & Pixel FX
    geometricEnabled: false,

    // Spectral Edge Curtain
    geoCurtainActive: false,
    geoCurtainDirection: 'down',
    geoCurtainAngle: 0,
    geoCurtainBidirectional: false,
    geoCurtainLength: 50,
    geoCurtainDensity: 60,
    geoCurtainThreshold: 35,
    geoCurtainFlicker: 25,
    geoCurtainOpacity: 75,
    geoCurtainBlend: 'screen',
    geoCurtainLumTrigger: 'all',
    geoCurtainMinLum: 0,
    geoCurtainMaxLum: 100,
    geoCurtainColorMode: 'neon',
    geoCurtainTintColor: '#00f2fe',
    geoCurtainLumMod: 40,
    geoCurtainOriginDot: true,
    geoCurtainMultiEdge: false,

    // Micro-HUD Geometry Nodes
    geoNodesActive: false,
    geoNodeShape: 'bracket',
    geoNodeDensity: 35,
    geoNodeSize: 8,
    geoNodeStroke: 1,
    geoNodeColor: '#00f2fe',

    // Topographic Contours
    geoContoursActive: false,
    geoContourLevels: 12,
    geoContourOpacity: 70,
    geoContourColor: '#39ff14',

    // Vintage VHS & Analog Camcorder FX
    vhsEnabled: false,
    vhsPreset: 'camcorder',
    vhsScope: 'composite',
    vhsVerticalJump: 8,
    vhsTrackingNoise: 15,
    vhsTapeCrease: 10,
    vhsDegradationBlur: 40,
    vhsDegradationOpacity: 75,
    vhsWobble: 22,
    vhsGrain: 25,
    vhsSoftness: 30,
    vhsChromaBleed: 35,
    vhsColorDecay: 15,
    vhsScanlines: 20,
    vhsScanlineBlur: 50,

    // Export & Render State
    isExporting: false,
    isHighResSnapshot: false,
    exportFormat: 'mp4',
    exportRecorder: null,
    exportChunks: [],
    exportFps: 30,
    exportDuration: dangerMode ? 30 : 5,
    exportLoops: 1,
    exportMode: 'duration',
    videoFadeInActive: false,
    videoFadeInDuration: 0.5,
    videoFadeOutActive: false,
    videoFadeOutDuration: 0.5,
    exportResolution: dangerMode ? 'viewport' : '1080',
    exportBitrateMbps: 24,
    exportCancel: false
  };
}

export const SERIALIZABLE_SETTINGS_KEYS = [
  'maskType',
  'layerCount',
  'maskFeather',
  'hueTolerance',
  'randomBoundaries',
  'layerEdgeFade',
  'aspectRatio',
  'glitchEnabled',
  'zoomSpeed',
  'zoomDepth',
  'cameraRotation',
  'cameraDrift',
  'mirrorMode',
  'kaleidoscopeSlices',
  'glitchStyleRgbSort',
  'glitchStyleVhs',
  'glitchStyleBlock',
  'glitchStyleLiquid',
  'glitchStyleRandom',
  'glitchStyleFlicker',
  'glitchFlickerHighlightsOnly',
  'rgbSplit',
  'pixelSort',
  'glitchFrequency',
  'glitchSeverity',
  'depthModulation',
  'glitchMonochrome',
  'geometricEnabled',
  'geoCurtainActive',
  'geoCurtainDirection',
  'geoCurtainAngle',
  'geoCurtainBidirectional',
  'geoCurtainLength',
  'geoCurtainDensity',
  'geoCurtainThreshold',
  'geoCurtainFlicker',
  'geoCurtainOpacity',
  'geoCurtainBlend',
  'geoCurtainLumTrigger',
  'geoCurtainMinLum',
  'geoCurtainMaxLum',
  'geoCurtainColorMode',
  'geoCurtainTintColor',
  'geoCurtainLumMod',
  'geoCurtainOriginDot',
  'geoCurtainMultiEdge',
  'geoNodesActive',
  'geoNodeShape',
  'geoNodeDensity',
  'geoNodeSize',
  'geoNodeStroke',
  'geoNodeColor',
  'geoContoursActive',
  'geoContourLevels',
  'geoContourOpacity',
  'geoContourColor',
  'vhsEnabled',
  'vhsPreset',
  'vhsScope',
  'vhsVerticalJump',
  'vhsTrackingNoise',
  'vhsTapeCrease',
  'vhsDegradationBlur',
  'vhsDegradationOpacity',
  'vhsWobble',
  'vhsGrain',
  'vhsSoftness',
  'vhsChromaBleed',
  'vhsColorDecay',
  'vhsScanlines',
  'vhsScanlineBlur',
  'exportFormat',
  'exportFps',
  'exportDuration',
  'exportLoops',
  'exportMode',
  'exportResolution',
  'exportBitrateMbps',
  'videoFadeInActive',
  'videoFadeInDuration',
  'videoFadeOutActive',
  'videoFadeOutDuration'
];

export const storeInstance = new Store(getDefaultState());
export const state = storeInstance.state;
export const subscribe = storeInstance.subscribe.bind(storeInstance);

/**
 * Lightweight Undo/Redo & Project Serialization Manager
 */
export class HistoryManager {
  static undoStack = [];
  static redoStack = [];
  static maxDepth = 40;
  static isRestoring = false;
  static onUpdateCallback = null;
  static onChange = null;

  static canUndo() {
    return HistoryManager.undoStack.length > 1;
  }

  static canRedo() {
    return HistoryManager.redoStack.length > 0;
  }

  static notifyChange() {
    if (HistoryManager.onChange) {
      HistoryManager.onChange({
        canUndo: HistoryManager.canUndo(),
        canRedo: HistoryManager.canRedo()
      });
    }
  }

  static captureSnapshot() {
    const settings = {};
    for (const key of SERIALIZABLE_SETTINGS_KEYS) {
      const val = state[key];
      settings[key] = Array.isArray(val) ? [...val] : val;
    }

    const texts = (state.texts || []).map(t => ({ ...t }));
    const glitchTriggers = (state.glitchTriggers || []).map(gt => ({ ...gt }));

    // Preserve live Image/Video DOM references by id while snapshotting coordinates/timing
    const graphicsMeta = (state.graphics || []).map(g => ({
      id: g.id,
      fileName: g.fileName,
      img: g.img,
      startTime: g.startTime,
      endTime: g.endTime,
      x: g.x,
      y: g.y,
      scale: g.scale,
      glitchFrequency: g.glitchFrequency,
      glitchAmplitude: g.glitchAmplitude,
      flickerIntensity: g.flickerIntensity,
      brightness: g.brightness,
      contrast: g.contrast,
      glowActive: g.glowActive,
      glowRadius: g.glowRadius,
      glowColor: g.glowColor,
      trackIndex: g.trackIndex
    }));

    const videosMeta = (state.videoBlocks || []).map(v => ({
      id: v.id,
      fileName: v.fileName,
      file: v.file,
      url: v.url,
      element: v.element,
      duration: v.duration,
      sourceOffset: v.sourceOffset || 0,
      startTime: v.startTime,
      endTime: v.endTime,
      scale: v.scale !== undefined ? v.scale : 100,
      monochrome: v.monochrome,
      mirrorMode: v.mirrorMode,
      kaleidoscopeSlices: v.kaleidoscopeSlices,
      brightness: v.brightness,
      contrast: v.contrast,
      x: v.x,
      y: v.y,
      scale: v.scale,
      edgeFade: v.edgeFade,
      fadeInDuration: v.fadeInDuration,
      fadeOutDuration: v.fadeOutDuration,
      trackIndex: v.trackIndex
    }));

    return {
      settings,
      texts,
      glitchTriggers,
      graphicsMeta,
      videosMeta
    };
  }

  static pushState() {
    if (HistoryManager.isRestoring) return;
    const snap = HistoryManager.captureSnapshot();
    const snapJson = JSON.stringify({
      settings: snap.settings,
      texts: snap.texts,
      glitchTriggers: snap.glitchTriggers,
      graphics: snap.graphicsMeta.map(({ img, ...rest }) => rest),
      videos: snap.videosMeta.map(({ file, element, ...rest }) => rest)
    });

    if (HistoryManager.undoStack.length > 0) {
      const top = HistoryManager.undoStack[HistoryManager.undoStack.length - 1];
      if (top.json === snapJson) return;
    }

    HistoryManager.undoStack.push({ snap, json: snapJson });
    if (HistoryManager.undoStack.length > HistoryManager.maxDepth) {
      HistoryManager.undoStack.shift();
    }
    HistoryManager.redoStack = [];
    if (HistoryManager.onUpdateCallback) HistoryManager.onUpdateCallback();
    HistoryManager.notifyChange();
  }

  static applySnapshot(snap) {
    if (!snap) return;
    HistoryManager.isRestoring = true;
    try {
      const prevMaskSettings = `${state.maskType}:${state.layerCount}:${state.maskFeather}:${state.hueTolerance}:${state.layerEdgeFade}`;
      for (const [k, v] of Object.entries(snap.settings || {})) {
        state[k] = Array.isArray(v) ? [...v] : v;
      }
      const nextMaskSettings = `${state.maskType}:${state.layerCount}:${state.maskFeather}:${state.hueTolerance}:${state.layerEdgeFade}`;

      state.texts = (snap.texts || []).map(t => ({ ...t }));
      state.glitchTriggers = (snap.glitchTriggers || []).map(gt => ({ ...gt }));

      if (snap.graphicsMeta) {
        state.graphics = snap.graphicsMeta.map(g => ({ ...g }));
      }
      if (snap.videosMeta) {
        state.videoBlocks = snap.videosMeta.map(v => ({ ...v }));
      }

      if (HistoryManager.onUpdateCallback) {
        HistoryManager.onUpdateCallback({
          reprocessLayers: prevMaskSettings !== nextMaskSettings
        });
      }
    } finally {
      HistoryManager.isRestoring = false;
    }
  }

  static undo() {
    if (HistoryManager.undoStack.length <= 1) return false;
    const current = HistoryManager.undoStack.pop();
    HistoryManager.redoStack.push(current);
    const prev = HistoryManager.undoStack[HistoryManager.undoStack.length - 1];
    HistoryManager.applySnapshot(prev.snap);
    HistoryManager.notifyChange();
    return true;
  }

  static redo() {
    if (HistoryManager.redoStack.length === 0) return false;
    const next = HistoryManager.redoStack.pop();
    HistoryManager.undoStack.push(next);
    HistoryManager.applySnapshot(next.snap);
    HistoryManager.notifyChange();
    return true;
  }

  static imageToDataUrl(img) {
    if (!img) return null;
    if (typeof img.src === 'string' && img.src.startsWith('data:')) {
      return img.src;
    }
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width || 1;
      c.height = img.naturalHeight || img.height || 1;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }

  static serializeProject() {
    const snap = HistoryManager.captureSnapshot();
    const uploadedImages = (state.uploadedImages || []).map(item => ({
      id: item.id,
      name: item.name,
      dataUrl: HistoryManager.imageToDataUrl(item.img)
    })).filter(item => !!item.dataUrl);

    const graphics = (snap.graphicsMeta || []).map(({ img, ...rest }) => ({
      ...rest,
      dataUrl: HistoryManager.imageToDataUrl(img)
    })).filter(g => !!g.dataUrl);

    const mediaManifest = {
      audio: state.audioTrack ? {
        fileName: state.audioTrack.fileName,
        timelineStart: state.audioTrack.timelineStart,
        sourceOffset: state.audioTrack.sourceOffset,
        volume: state.audioTrack.volume,
        fadeInDuration: state.audioTrack.fadeInDuration || 0,
        fadeOutDuration: state.audioTrack.fadeOutDuration || 0
      } : null,
      videos: (state.videoBlocks || []).map(v => ({
        fileName: v.fileName,
        startTime: v.startTime,
        endTime: v.endTime,
        sourceOffset: v.sourceOffset || 0,
        scale: v.scale !== undefined ? v.scale : 100,
        x: v.x || 0,
        y: v.y || 0,
        trackIndex: v.trackIndex || 0
      }))
    };

    return {
      version: '1.20.0',
      app: 'VileCut',
      exportedAt: new Date().toISOString(),
      isDangerZone: state.isDangerZone,
      settings: snap.settings,
      activeImageIndex: state.activeImageIndex,
      uploadedImages,
      graphics,
      texts: snap.texts,
      glitchTriggers: snap.glitchTriggers,
      mediaManifest
    };
  }
}
