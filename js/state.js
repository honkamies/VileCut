export const state = {
  // Media & Image Elements
  uploadedImages: [], // Array of { id, name, img, layers: [] }
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

  // Graphic Overlays
  graphics: [],
  selectedGraphicId: null,

  // Motion parameters
  isPlaying: true,
  time: 0,
  lastFrameTime: 0,
  fps: 0,
  zoomSpeed: 0.05,
  zoomDepth: 4.0,
  cameraRotation: 0, // deg/sec
  cameraDrift: 0.0,  // drift multiplier
  cameraAngle: 0,    // accumulated angle
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
  activeSpikeStyle: null,
  rgbSplit: 0,
  pixelSort: 0,
  glitchFrequency: 5, // % probability
  glitchSeverity: 10,  // px displacement
  depthModulation: 0,
  glitchMonochrome: false,
  glitchActive: false,
  glitchTimer: 0,
  shakeX: 0,
  shakeY: 0,
  shakeRot: 0,

  // Exporter
  isExporting: false,
  exportFormat: 'mp4',
  exportRecorder: null,
  exportChunks: [],
  exportFrame: 0,
  exportTotalFrames: 0,
  exportFps: 30,
  exportDuration: 5,
  exportLoops: 1,
  exportMode: 'duration',
  videoFadeActive: false,
  videoFadeDuration: 0.5,
  exportResolution: '1080',
  exportCancel: false
};
