'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { SensorVisualization, type SensorVisualizationHandle, type ViewState } from '@/components/sensor-visualization'
import { SensorControlPanel } from '@/components/sensor-control-panel'
import { 
  defaultSensors, 
  defaultCarDimensions,
  defaultCarOffset,
  getInitialSensorStatus,
  type SensorStatus, 
  type Sensor,
  type CarDimensions,
  type CarOffset,
  type SelectionType,
} from '@/lib/sensor-config'
import { Button } from '@/components/ui/button'
import { Download, Upload, Loader2, RotateCcw, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'

// Global display settings type
interface GlobalDisplaySettings {
  enabled: boolean
  showPoints: boolean
  showLabels: boolean
  showFovs: boolean
}

const defaultGlobalDisplay: GlobalDisplaySettings = {
  enabled: true,
  showPoints: true,
  showLabels: true,
  showFovs: true,
}

// Storage key for localStorage
const STORAGE_KEY = 'av-dashboard-config'

// Type for saved configuration
interface SavedConfig {
  sensors: Sensor[]
  sensorStatus: SensorStatus
  carDimensions: CarDimensions
  carOffset: CarOffset
  globalDisplay: GlobalDisplaySettings
  viewState?: ViewState
  maxRange?: number
  savedAt: string
}

// Load config from localStorage
function loadConfigFromStorage(): Partial<SavedConfig> | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved) as Partial<SavedConfig>
    }
  } catch (e) {
    console.error('Failed to load config from localStorage:', e)
  }
  return null
}

// Save config to localStorage
function saveConfigToStorage(config: SavedConfig) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch (e) {
    console.error('Failed to save config to localStorage:', e)
  }
}

export default function AVRedundancyDashboard() {
  const [isInitialized, setIsInitialized] = useState(false)
  const [sensors, setSensors] = useState<Sensor[]>(defaultSensors)
  const [sensorStatus, setSensorStatus] = useState<SensorStatus>(() => getInitialSensorStatus(defaultSensors))
  const [selection, setSelection] = useState<SelectionType>(null)
  const [carDimensions, setCarDimensions] = useState<CarDimensions>(defaultCarDimensions)
  const [carOffset, setCarOffset] = useState<CarOffset>(defaultCarOffset)
  const [viewState, setViewState] = useState<ViewState | null>(null)
  const [savedViewState, setSavedViewState] = useState<ViewState | null>(null)
  const [globalDisplay, setGlobalDisplay] = useState<GlobalDisplaySettings>(defaultGlobalDisplay)
  const [maxRange, setMaxRange] = useState(150)

  const { theme, setTheme } = useTheme()

  const visualizationRef = useRef<SensorVisualizationHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load config from localStorage on mount
  useEffect(() => {
    const savedConfig = loadConfigFromStorage()
    if (savedConfig) {
      if (savedConfig.sensors) setSensors(savedConfig.sensors)
      if (savedConfig.sensorStatus) setSensorStatus(savedConfig.sensorStatus)
      if (savedConfig.carDimensions) setCarDimensions(savedConfig.carDimensions)
      if (savedConfig.carOffset && savedConfig.carOffset.x !== undefined) {
        setCarOffset(savedConfig.carOffset)
      }
      if (savedConfig.globalDisplay) setGlobalDisplay(savedConfig.globalDisplay)
      if (savedConfig.viewState) setSavedViewState(savedConfig.viewState)
      if (savedConfig.maxRange) setMaxRange(savedConfig.maxRange)
    }
    setIsInitialized(true)
  }, [])

  // Save to localStorage whenever config changes (debounced)
  useEffect(() => {
    if (!isInitialized) return

    const timeoutId = setTimeout(() => {
      saveConfigToStorage({
        sensors,
        sensorStatus,
        carDimensions,
        carOffset,
        globalDisplay,
        viewState: viewState || undefined,
        maxRange,
        savedAt: new Date().toISOString(),
      })
    }, 500) // Debounce 500ms

    return () => clearTimeout(timeoutId)
  }, [sensors, sensorStatus, carDimensions, carOffset, globalDisplay, viewState, maxRange, isInitialized])

  // Export config to JSON file
  const handleExport = useCallback(() => {
    const config: SavedConfig = {
      sensors,
      sensorStatus,
      carDimensions,
      carOffset,
      globalDisplay,
      viewState: viewState || undefined,
      maxRange,
      savedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `av-dashboard-config-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [sensors, sensorStatus, carDimensions, carOffset, globalDisplay, viewState])

  // Import config from JSON file
  const handleImport = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const config = JSON.parse(e.target?.result as string) as SavedConfig
        if (config.sensors) setSensors(config.sensors)
        if (config.sensorStatus) setSensorStatus(config.sensorStatus)
        if (config.carDimensions) setCarDimensions(config.carDimensions)
        if (config.carOffset && config.carOffset.x !== undefined) {
          setCarOffset(config.carOffset)
        }
        if (config.globalDisplay) setGlobalDisplay(config.globalDisplay)
        if (config.maxRange) setMaxRange(config.maxRange)
        if (config.viewState) {
          setSavedViewState(config.viewState)
          setTimeout(() => {
            visualizationRef.current?.setView(config.viewState!)
          }, 100)
        }
        // Clear selection after import
        setSelection(null)
      } catch (err) {
        console.error('Failed to parse config file:', err)
        alert('Failed to import config. Please check the file format.')
      }
    }
    reader.readAsText(file)
    // Reset file input
    event.target.value = ''
  }, [])

  const handleToggle = useCallback((id: string) => {
    setSensorStatus((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }, [])

  const handleSensorDrag = useCallback((id: string, x: number, y: number) => {
    setSensors((prev) =>
      prev.map((sensor) =>
        sensor.id === id ? { ...sensor, x, y } : sensor
      )
    )
    // Update selection if dragging the selected sensor
    setSelection((prev) => 
      prev?.type === 'sensor' && prev.sensor.id === id 
        ? { type: 'sensor', sensor: { ...prev.sensor, x, y } }
        : prev
    )
  }, [])

  const handleSelectionChange = useCallback((newSelection: SelectionType) => {
    setSelection(newSelection)
  }, [])

  const handleSensorUpdate = useCallback((id: string, updates: Partial<Sensor>) => {
    setSensors((prev) =>
      prev.map((sensor) =>
        sensor.id === id ? { ...sensor, ...updates } : sensor
      )
    )
    // Update selection state as well
    setSelection((prev) => 
      prev?.type === 'sensor' && prev.sensor.id === id 
        ? { type: 'sensor', sensor: { ...prev.sensor, ...updates } }
        : prev
    )
  }, [])

  const handleSensorAdd = useCallback((sensor: Sensor) => {
    setSensors((prev) => [...prev, sensor])
    setSensorStatus((prev) => ({ ...prev, [sensor.id]: true }))
    // Select the newly added sensor
    setSelection({ type: 'sensor', sensor })
  }, [])

  const handleSensorDelete = useCallback((id: string) => {
    setSensors((prev) => prev.filter((s) => s.id !== id))
    setSensorStatus((prev) => {
      const newStatus = { ...prev }
      delete newStatus[id]
      return newStatus
    })
    // Clear selection if deleted sensor was selected
    setSelection((prev) => 
      prev?.type === 'sensor' && prev.sensor.id === id ? null : prev
    )
  }, [])

  const handleSensorsReorder = useCallback((reorderedSensors: Sensor[]) => {
    setSensors(reorderedSensors)
  }, [])

  // Reset everything to default values
  const handleResetToDefault = useCallback(() => {
    setSensors(defaultSensors)
    setSensorStatus(getInitialSensorStatus(defaultSensors))
    setCarDimensions(defaultCarDimensions)
    setCarOffset(defaultCarOffset)
    setGlobalDisplay(defaultGlobalDisplay)
    setMaxRange(150)
    setSelection(null)
    visualizationRef.current?.resetView()
  }, [])

  // Delete all sensors (keep car settings at default)
  const handleDeleteAllSensors = useCallback(() => {
    setSensors([])
    setSensorStatus({})
    setSelection(null)
  }, [])

  const handleResetView = useCallback(() => {
    visualizationRef.current?.resetView()
  }, [])

  const handleCenterView = useCallback(() => {
    visualizationRef.current?.centerView()
  }, [])

  const handleViewStateChange = useCallback((state: ViewState) => {
    setViewState(state)
  }, [])

  const handleGlobalDisplayChange = useCallback((settings: GlobalDisplaySettings) => {
    setGlobalDisplay(settings)
  }, [])

  const aliveCount = sensors.filter((s) => sensorStatus[s.id] !== false).length
  const totalCount = sensors.length
  const ratio = totalCount > 0 ? aliveCount / totalCount : 0

  const getStatusColor = () => {
    if (ratio >= 0.8) return 'text-green-400'
    if (ratio >= 0.4) return 'text-yellow-400'
    return 'text-red-400'
  }

  // Show loading screen while initializing
  if (!isInitialized) {
    return (
      <div className="h-screen bg-background flex flex-col items-center justify-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Loading configuration...</p>
      </div>
    )
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              AV Redundancy Dashboard
            </h1>
            <p className="text-xs text-muted-foreground">
              Interactive sensor coverage visualization
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* Import/Export/Reset buttons */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                className="text-xs"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToDefault}
                className="text-xs"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="text-xs"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </Button>
            </div>
            
            {/* System status */}
            <div className="flex items-center gap-3 pl-4 border-l border-border">
              <span className="text-sm text-muted-foreground">System:</span>
              <span className={`text-lg font-bold ${getStatusColor()}`}>
                {ratio >= 0.8 ? 'NORMAL' : ratio >= 0.4 ? 'DEGRADED' : 'CRITICAL'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Horizontal Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Visualization Area - always dark regardless of theme */}
        <div className="flex-1 p-4">
          <div className="w-full h-full rounded-xl border border-border overflow-hidden">
            <SensorVisualization
              ref={visualizationRef}
              sensors={sensors}
              sensorStatus={sensorStatus}
              carDimensions={carDimensions}
              carOffset={carOffset}
              globalDisplay={globalDisplay}
              initialViewState={savedViewState || undefined}
              onSensorDrag={handleSensorDrag}
              onSelectionChange={handleSelectionChange}
              selection={selection}
              onViewStateChange={handleViewStateChange}
              colorScheme={theme === 'light' ? 'light' : 'dark'}
              maxRange={maxRange}
            />
          </div>
        </div>

        {/* Control Panel - Fixed width on right */}
        <div className="w-80 flex-shrink-0 border-l border-border p-4 bg-card/50 overflow-hidden">
          <SensorControlPanel
            sensors={sensors}
            sensorStatus={sensorStatus}
            selection={selection}
            carDimensions={carDimensions}
            carOffset={carOffset}
            viewState={viewState}
            globalDisplay={globalDisplay}
            onToggle={handleToggle}
            onCarDimensionsChange={setCarDimensions}
            onCarOffsetChange={setCarOffset}
            onSensorUpdate={handleSensorUpdate}
            onSensorAdd={handleSensorAdd}
            onSensorDelete={handleSensorDelete}
            onDeleteAllSensors={handleDeleteAllSensors}
            onSelectionChange={handleSelectionChange}
            onResetView={handleResetView}
            onCenterView={handleCenterView}
            onGlobalDisplayChange={handleGlobalDisplayChange}
            onSensorsReorder={handleSensorsReorder}
            maxRange={maxRange}
            onMaxRangeChange={setMaxRange}
          />
        </div>
      </div>
    </div>
  )
}
